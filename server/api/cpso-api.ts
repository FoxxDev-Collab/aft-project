// CPSO API Endpoints
import { getDb } from "../../lib/database-bun";
import { RoleMiddleware } from "../../middleware/role-middleware";
import { UserRole } from "../../lib/database-bun";
import { auditLog } from "../../lib/security";
import { CACSignatureManager, type CACSignatureData } from "../../lib/cac-signature";

export async function handleCPSOAPI(request: Request, path: string, ipAddress: string): Promise<Response> {
  // Check authentication and CPSO role
  const authResult = await RoleMiddleware.checkAuthAndRole(request, ipAddress);
  if (authResult.response) return authResult.response;
  const activeRole = authResult.session.activeRole || authResult.session.primaryRole;
  if (activeRole !== UserRole.CPSO) {
    return RoleMiddleware.accessDenied(`This API requires CPSO role. Your current role is ${activeRole?.toUpperCase()}.`);
  }

  const db = getDb();
  const method = request.method;
  const session = authResult.session;
  
  // Parse path to get endpoint
  const apiPath = path.replace('/api/cpso/', '');
  
  try {
    // GET endpoints
    if (method === 'GET') {
      if (apiPath === 'pending-count') {
        const result = db.query("SELECT COUNT(*) as count FROM aft_requests WHERE status = 'pending_cpso'").get() as any;
        return new Response(JSON.stringify({ count: result?.count || 0 }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      if (apiPath === 'export/approved') {
        const requests = db.query(`
          SELECT * FROM aft_requests 
          WHERE status = 'approved' AND approver_email = ?
          ORDER BY updated_at DESC
        `).all(session.email) as any[];
        
        // Generate CSV
        const csv = generateCSV(requests);
        return new Response(csv, {
          headers: {
            'Content-Type': 'text/csv',
            'Content-Disposition': 'attachment; filename="cpso-approved-requests.csv"'
          }
        });
      }
    }
    
    // POST endpoints
    if (method === 'POST') {
      const body: any = await request.json();
      
      // Approve request with CAC signature
      if (apiPath.startsWith('approve-cac/')) {
        const requestId = apiPath.split('/')[1];
        
        if (!requestId) {
          return new Response(JSON.stringify({ error: 'Request ID is required' }), { 
            status: 400, 
            headers: { 'Content-Type': 'application/json' } 
          });
        }
        
        const { signature, certificate, timestamp, algorithm, notes } = body as {
          signature: string;
          certificate: any;
          timestamp: string;
          algorithm: string;
          notes?: string;
        };
        
        // Validate signature data
        if (!signature || !certificate || !timestamp || !algorithm) {
          return new Response(JSON.stringify({ error: 'Invalid signature data' }), { 
            status: 400, 
            headers: { 'Content-Type': 'application/json' } 
          });
        }
        
        // Construct CAC signature data
        const signatureData: CACSignatureData = {
          signature,
          certificate,
          timestamp,
          algorithm,
          notes
        };
        
        // Apply CAC signature and approve request (CPSO approval to DTA)
        const signatureResult = await CACSignatureManager.applyApproverSignature(
          parseInt(requestId),
          session.userId,
          session.email,
          signatureData,
          ipAddress,
          'CPSO' // CPSO role for final approval
        );
        
        if (!signatureResult.success) {
          return new Response(JSON.stringify({ 
            success: false, 
            error: signatureResult.error || 'Failed to apply CAC signature' 
          }), { 
            status: 400, 
            headers: { 'Content-Type': 'application/json' } 
          });
        }
        
        // Log the action
        await auditLog(
          session.userId,
          'REQUEST_APPROVED_CAC',
          `CPSO approved request #${requestId} with CAC signature`,
          ipAddress,
          'info'
        );
        
        return new Response(JSON.stringify({ 
          success: true, 
          message: 'Request approved with CAC signature and forwarded to DTA' 
        }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      // Standard approve request (without CAC)
      if (apiPath.startsWith('approve/')) {
        const requestId = apiPath.split('/')[1];

        if (!requestId) {
            return new Response(JSON.stringify({ error: 'Request ID is required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }
        const { notes }: { notes?: string } = body;
        
        // Update request status to approved (final approval)
        db.prepare(`
          UPDATE aft_requests 
          SET status = 'approved', 
              approver_email = ?,
              approver_id = (SELECT id FROM users WHERE email = ?),
              updated_at = unixepoch(),
              approval_notes = ?,
              rejection_reason = NULL
          WHERE id = ? AND status = 'pending_cpso'
        `).run(session.email, session.email, notes || null, requestId);
        
        // Add to history
        db.prepare(`
          INSERT INTO aft_request_history (request_id, action, user_email, notes, created_at)
          VALUES (?, 'CPSO_APPROVED', ?, ?, unixepoch())
        `).run(requestId, session.email, notes || 'Request approved by CPSO - Final approval');
        
        // Log the action
        await auditLog(
          session.userId,
          'REQUEST_APPROVED',
          `CPSO approved request #${requestId}`,
          ipAddress,
          'info'
        );
        
        return new Response(JSON.stringify({ success: true }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      // Reject request
      if (apiPath.startsWith('reject/')) {
        const requestId = apiPath.split('/')[1];

        if (!requestId) {
            return new Response(JSON.stringify({ error: 'Request ID is required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }
        const { reason, notes }: { reason: string; notes?: string } = body;
        
        if (!reason) {
          return new Response(JSON.stringify({ error: 'Rejection reason is required' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        
        // Update request status
        db.prepare(`
          UPDATE aft_requests 
          SET status = 'rejected',
              approver_email = ?,
              approver_id = (SELECT id FROM users WHERE email = ?),
              updated_at = unixepoch(),
              rejection_reason = ?,
              approval_notes = ?
          WHERE id = ? AND status = 'pending_cpso'
        `).run(session.email, session.email, reason, notes || null, requestId);
        
        // Add to history
        db.prepare(`
          INSERT INTO aft_request_history (request_id, action, user_email, notes, created_at)
          VALUES (?, 'CPSO_REJECTED', ?, ?, unixepoch())
        `).run(requestId, session.email, `Reason: ${reason}. ${notes || ''}`);
        
        // Log the action
        await auditLog(
          session.userId,
          'REQUEST_REJECTED',
          `CPSO rejected request #${requestId}: ${reason}`,
          ipAddress,
          'info'
        );
        
        return new Response(JSON.stringify({ success: true }), {
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      // Generate reports
      if (apiPath === 'reports/generate') {
        const { type }: { type: 'monthly' | 'quarterly' | 'annual' } = body;
        
        let dateFilter = '';
        
        switch(type) {
          case 'monthly':
            dateFilter = `AND updated_at >= date('now', '-1 month')`;
            break;
          case 'quarterly':
            dateFilter = `AND updated_at >= date('now', '-3 months')`;
            break;
          case 'annual':
            dateFilter = `AND updated_at >= date('now', '-1 year')`;
            break;
        }
        
        const reportData = db.query(`
          SELECT 
            r.*,
            u.first_name || ' ' || u.last_name as requestor_name,
            u.email as requestor_email
          FROM aft_requests r
          LEFT JOIN users u ON r.requestor_id = u.id
          WHERE r.cpso_email = ? ${dateFilter}
          ORDER BY r.cpso_reviewed_at DESC
        `).all(session.email) as any[];
        
        // Generate a printable HTML report
        const html = generatePrintableReport(reportData, type, session.email);
        
        return new Response(html, {
          headers: {
            'Content-Type': 'text/html',
          }
        });
      }
    }
    
    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('CPSO API error:', error);
    await auditLog(
      session.userId,
      'CPSO_API_ERROR',
      `API error on ${path}: ${error}`,
      ipAddress,
      { error: String(error) }
    );
    
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

function generateCSV(requests: any[]): string {
  const headers = ['Request ID', 'Source System', 'Destination System', 'Classification', 'Requestor', 'Approved Date', 'Status'];
  const rows = requests.map(r => [
    r.id,
    r.source_system,
    r.destination_system,
    r.classification || 'UNCLASSIFIED',
    r.requestor_email,
    new Date(r.updated_at).toLocaleDateString(),
    r.status
  ]);
  
  return [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
  ].join('\n');
}

function generatePrintableReport(requests: any[], type: string, approverEmail: string): string {
  const reportTitle = `CPSO ${type.charAt(0).toUpperCase() + type.slice(1)} Report`;
  const generatedDate = new Date().toLocaleString();

  const summary = {
      total: requests.length,
      approved: requests.filter(r => r.status === 'approved').length,
      rejected: requests.filter(r => r.status === 'rejected').length
  };

  const tableRows = requests.map(r => `
    <tr>
        <td>${r.id}</td>
        <td>${new Date(r.created_at).toLocaleDateString()}</td>
        <td>${new Date(r.updated_at).toLocaleDateString()}</td>
        <td>${r.status}</td>
        <td>${r.source_system} -> ${r.destination_system}</td>
        <td>${r.requestor_name || r.requestor_email}</td>
    </tr>
  `).join('');

  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${reportTitle}</title>
        <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; margin: 2rem; color: #333; }
            h1, h2 { color: #111; }
            table { width: 100%; border-collapse: collapse; margin-top: 1.5rem; }
            th, td { border: 1px solid #ddd; padding: 0.75rem; text-align: left; font-size: 0.9rem; }
            th { background-color: #f7f7f7; font-weight: 600; }
            .header { border-bottom: 2px solid #eee; padding-bottom: 1rem; margin-bottom: 2rem; }
            .summary { display: flex; justify-content: space-between; list-style: none; padding: 0; margin: 1rem 0; }
            .summary li { border: 1px solid #eee; padding: 1rem; border-radius: 8px; flex-grow: 1; text-align: center; margin: 0 0.5rem; }
            .summary li:first-child { margin-left: 0; }
            .summary li:last-child { margin-right: 0; }
            .summary strong { display: block; font-size: 1.5rem; margin-bottom: 0.25rem; }
            @media print {
                body { margin: 1rem; }
                .no-print { display: none; }
                table { page-break-inside: auto; }
                tr { page-break-inside: avoid; page-break-after: auto; }
                thead { display: table-header-group; }
            }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>${reportTitle}</h1>
            <p><strong>CPSO:</strong> ${approverEmail}</p>
            <p><strong>Generated on:</strong> ${generatedDate}</p>
        </div>

        <h2>Summary</h2>
        <ul class="summary">
            <li><strong>${summary.total}</strong> Total Processed</li>
            <li><strong>${summary.approved}</strong> Approved</li>
            <li><strong>${summary.rejected}</strong> Rejected</li>
        </ul>

        <h2>Details</h2>
        <table>
            <thead>
                <tr>
                    <th>Request ID</th>
                    <th>Created</th>
                    <th>Processed</th>
                    <th>Status</th>
                    <th>Transfer Route</th>
                    <th>Requestor</th>
                </tr>
            </thead>
            <tbody>
                ${tableRows}
            </tbody>
        </table>
        
        <script>
            window.onload = () => {
                window.print();
            };
        </script>
    </body>
    </html>
  `;
}
