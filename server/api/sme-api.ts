// SME API Endpoints
import { getDb, UserRole } from "../../lib/database-bun";
import { RoleMiddleware } from "../../middleware/role-middleware";
import { RequestTrackingService } from "../../lib/request-tracking";

export async function handleSMEAPI(request: Request, path: string, ipAddress: string): Promise<Response | null> {
  if (!path.startsWith('/api/sme/')) {
    return null;
  }

  const authResult = await RoleMiddleware.checkAuthAndRole(request, ipAddress, UserRole.SME);
  if (authResult.response) return authResult.response;

  const url = new URL(request.url);
  const pathSegments = url.pathname.split('/');

  // Path: /api/sme/requests/:id
  if (pathSegments[3] === 'requests' && pathSegments.length >= 5) {
    const requestId = parseInt(pathSegments[4] || '', 10);
    if (isNaN(requestId)) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid request ID' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    if (request.method === 'GET') {
      return getRequestDetails(requestId);
    } else if (request.method === 'POST' && pathSegments[5] === 'sign') {
      if (!authResult.session.email || !authResult.session.userId) {
        return new Response(JSON.stringify({ success: false, error: 'User session invalid' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
      }
      return signRequest(requestId, authResult.session.email, authResult.session.userId, request);
    }
  }

  return new Response(JSON.stringify({ success: false, error: 'SME API endpoint not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
}

async function getRequestDetails(requestId: number): Promise<Response> {
  const db = getDb();
  const requestData = db.query("SELECT * FROM aft_requests WHERE id = ?").get(requestId);

  if (!requestData) {
    return new Response(JSON.stringify({ success: false, error: 'Request not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  }

  return new Response(JSON.stringify({ success: true, request: requestData }), { headers: { 'Content-Type': 'application/json' } });
}

async function signRequest(requestId: number, smeEmail: string, smeUserId: number, request: Request): Promise<Response> {
  const db = getDb();

  try {
    const body = await request.json() as { notes?: string };
    const { notes } = body;

    const requestData = db.query("SELECT * FROM aft_requests WHERE id = ?").get(requestId) as any;

    if (!requestData) {
      return new Response(JSON.stringify({ success: false, error: 'Request not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }

    if (requestData.status !== 'pending_sme_signature') {
      return new Response(JSON.stringify({ success: false, error: `Request is not pending SME signature. Current status: ${requestData.status}` }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    db.transaction(() => {
      // Update request status to forward to media custodian
      db.run(`
        UPDATE aft_requests 
        SET status = 'pending_media_custodian', 
            sme_signature_date = unixepoch(),
            updated_at = unixepoch() 
        WHERE id = ?
      `, [requestId]);

      // Add to request history
      db.run(`
        INSERT INTO aft_request_history (request_id, action, user_email, notes, created_at)
        VALUES (?, 'SME_SIGNED', ?, ?, unixepoch())
      `, [requestId, smeEmail, `SME signature provided. Two-Person Integrity check completed. ${notes || ''}`]);

      RequestTrackingService.addAuditEntry(
        requestId,
        smeUserId,
        'sme_signed',
        requestData.status,
        'pending_media_custodian',
        undefined,
        'SME signature provided, forwarded to Media Custodian for final processing.'
      );
    })();

    return new Response(JSON.stringify({ success: true, message: 'Request signed successfully and forwarded to Media Custodian' }), { headers: { 'Content-Type': 'application/json' } });

  } catch (error: any) {
    console.error('Error signing request:', error);
    return new Response(JSON.stringify({ success: false, error: 'Database error while signing request.' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}