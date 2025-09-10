// Requestor API routes
import { getDb, UserRole, generateRequestNumber } from "../../lib/database-bun";
import { auditLog } from "../../lib/security";
import { RoleMiddleware } from "../../middleware/role-middleware";

const db = getDb();

export async function handleRequestorAPI(request: Request, path: string, ipAddress: string): Promise<Response | null> {
  const method = request.method;
  
  // List available DTAs (users with DTA role who have available drives)
  if (path === '/api/requestor/dtas' && method === 'GET') {
    const authResult = await RoleMiddleware.checkAuthAndRole(request, ipAddress, UserRole.REQUESTOR);
    if (authResult.response) return authResult.response;
    try {
      const dtas = db.query(`
        SELECT DISTINCT u.id, u.email, u.first_name, u.last_name
        FROM users u
        JOIN user_roles ur ON ur.user_id = u.id AND ur.is_active = 1
        JOIN media_drives md ON md.issued_to_user_id = u.id
        WHERE u.is_active = 1 AND ur.role = ? AND md.status = 'issued'
        ORDER BY u.last_name, u.first_name
      `).all(UserRole.DTA) as any[];
      return new Response(JSON.stringify(dtas), { headers: { 'Content-Type': 'application/json' } });
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Failed to load DTAs' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
  }

  // Check if a given DTA has an issued drive
  if (path.startsWith('/api/requestor/dta/') && path.endsWith('/issued-drive') && method === 'GET') {
    const authResult = await RoleMiddleware.checkAuthAndRole(request, ipAddress, UserRole.REQUESTOR);
    if (authResult.response) return authResult.response;
    try {
      const segments = path.split('/');
      const dtaIdStr = segments.length >= 5 ? segments[4] : '';
      const dtaId = parseInt(dtaIdStr || '');
      if (!dtaId) {
        return new Response(JSON.stringify({ error: 'Invalid DTA ID' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }
      const drive = db.query(`
        SELECT id, serial_number, media_control_number, type, model, capacity, status, issued_at
        FROM media_drives
        WHERE issued_to_user_id = ? AND status = 'issued'
        ORDER BY issued_at DESC
        LIMIT 1
      `).get(dtaId) as any;
      return new Response(JSON.stringify({ hasDrive: !!drive, drive: drive || null }), { headers: { 'Content-Type': 'application/json' } });
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Failed to check DTA drive' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
  }

  // Requestor save draft API
  if (path === '/api/requestor/save-draft' && method === 'POST') {
    const authResult = await RoleMiddleware.checkAuthAndRole(request, ipAddress, UserRole.REQUESTOR);
    if (authResult.response) return authResult.response;
    
    try {
      const requestData = await request.json() as any;
      
      // Ensure we have a request number and that it is unique
      if (!requestData.media_control_number) {
        requestData.media_control_number = generateRequestNumber();
      }

      // Helper to ensure uniqueness of request_number
      const ensureUniqueRequestNumber = (desired: string, excludeId?: number): string => {
        let candidate = desired;
        let attempt = 0;
        while (true) {
          const existing = db.query("SELECT id FROM aft_requests WHERE request_number = ? LIMIT 1").get(candidate) as any;
          if (!existing || (excludeId && existing.id === excludeId)) {
            return candidate;
          }
          // Generate a fresh unique number after first collision or if repeated collisions
          candidate = generateRequestNumber();
          attempt++;
          if (attempt > 5) {
            // Extremely unlikely; still return candidate
            return candidate;
          }
        }
      };

      let requestId: number;
      
      if (requestData.draft_id && requestData.draft_id !== '') {
        // Update existing draft
        requestId = parseInt(requestData.draft_id);
        // If request_number collides with another record, make it unique (excluding this draft id)
        requestData.media_control_number = ensureUniqueRequestNumber(requestData.media_control_number, requestId);
        
        db.query(`
          UPDATE aft_requests SET
            request_number = ?,
            status = 'draft',
            requestor_name = ?,
            requestor_org = ?,
            requestor_phone = ?,
            requestor_email = ?,
            transfer_purpose = ?,
            transfer_type = ?,
            classification = ?,
            data_description = ?,
            source_system = ?,
            source_location = ?,
            dta_id = ?,
            dest_system = ?,
            dest_location = ?,
            dest_contact = ?,
            files_list = ?,
            additional_file_list_attached = ?,
            compression_required = ?,
            encryption = ?,
            updated_at = unixepoch()
          WHERE id = ? AND requestor_id = ?
        `).run(
          requestData.media_control_number,
          authResult.session.email.split('@')[0], // Extract name from email
          'AFT System', // Default org
          '555-0000', // Default phone
          authResult.session.email,
          requestData.justification || '',
          requestData.transfer_type || '',
          requestData.overall_classification || '',
          `Transfer Type: ${requestData.transfer_type || 'N/A'}, Media: ${requestData.media_type || 'N/A'}`,
          requestData.source_is || '',
          requestData.source_classification || '',
          requestData.dta_id ? parseInt(requestData.dta_id) : null,
          requestData.dest_system || '',
          requestData.dest_location || '',
          requestData.destination_poc || '',
          requestData.files || '[]',
          requestData.additional_file_list_attached ? 1 : 0,
          requestData.media_encrypted ? 1 : 0,
          requestData.media_encrypted ? 'Yes' : 'No',
          requestId,
          authResult.session.userId
        );
      } else {
        // Create new draft
        // If desired request_number already exists, generate a unique one
        requestData.media_control_number = ensureUniqueRequestNumber(requestData.media_control_number);
        const result = db.query(`
          INSERT INTO aft_requests (
            request_number, requestor_id, status, requestor_name, requestor_org, 
            requestor_phone, requestor_email, transfer_purpose, transfer_type, 
            classification, data_description, source_system, source_location,
            dta_id,
            dest_system, dest_location, dest_contact, files_list, 
            additional_file_list_attached, compression_required, encryption,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch(), unixepoch())
          RETURNING id
        `).get(
          requestData.media_control_number,
          authResult.session.userId,
          'draft',
          authResult.session.email.split('@')[0], // Extract name from email
          'AFT System', // Default org
          '555-0000', // Default phone
          authResult.session.email,
          requestData.justification || '',
          requestData.transfer_type || '',
          requestData.overall_classification || '',
          `Transfer Type: ${requestData.transfer_type || 'N/A'}, Media: ${requestData.media_type || 'N/A'}`,
          requestData.source_is || '',
          requestData.source_classification || '',
          requestData.dta_id ? parseInt(requestData.dta_id) : null,
          requestData.dest_system || '',
          requestData.dest_location || '',
          requestData.destination_poc || '',
          requestData.files || '[]',
          requestData.additional_file_list_attached ? 1 : 0,
          requestData.media_encrypted ? 1 : 0,
          requestData.media_encrypted ? 'Yes' : 'No'
        ) as any;
        
        requestId = result.id;
      }
      
      await auditLog(authResult.session.userId, 'AFT_DRAFT_SAVED', 
        `AFT request draft saved: ${requestData.media_control_number}`, ipAddress);
      
      return new Response(JSON.stringify({ 
        success: true, 
        requestId,
        message: 'Draft saved successfully' 
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
      
    } catch (error: any) {
      console.error('Error saving AFT draft:', error);
      return new Response(JSON.stringify({ 
        success: false, 
        message: 'Failed to save draft: ' + error.message 
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  // Requestor submit request API
  if (path === '/api/requestor/submit-request' && method === 'POST') {
    const authResult = await RoleMiddleware.checkAuthAndRole(request, ipAddress, UserRole.REQUESTOR);
    if (authResult.response) return authResult.response;
    
    try {
      const { requestId, signature } = await request.json() as any;
      
      if (!requestId) {
        return new Response(JSON.stringify({ 
          success: false, 
          message: 'Request ID is required' 
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      // Verify the request belongs to this user and is in draft status
      const existingRequest = db.query(`
        SELECT id, status, request_number FROM aft_requests 
        WHERE id = ? AND requestor_id = ?
      `).get(requestId, authResult.session.userId) as any;
      
      if (!existingRequest) {
        return new Response(JSON.stringify({ 
          success: false, 
          message: 'Request not found or access denied' 
        }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      if (existingRequest.status !== 'draft') {
        return new Response(JSON.stringify({ 
          success: false, 
          message: 'Only draft requests can be submitted' 
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      // Update request status to submitted
      db.query(`
        UPDATE aft_requests SET
          status = 'submitted',
          updated_at = unixepoch()
        WHERE id = ?
      `).run(requestId);
      
      // Create digital signature record (simplified - in real implementation would use CAC)
      db.query(`
        INSERT INTO cac_signatures (
          request_id, user_id, step_type, certificate_subject, certificate_issuer,
          certificate_serial, certificate_thumbprint, certificate_not_before, 
          certificate_not_after, signature_data, signed_data, signature_reason,
          ip_address, user_agent, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())
      `).run(
        requestId,
        authResult.session.userId,
        'REQUESTER_CERTIFICATION',
        `CN=${authResult.session.email}`,
        'AFT System',
        'SIM-' + Date.now(),
        'SHA256:' + Math.random().toString(36),
        Math.floor(Date.now() / 1000),
        Math.floor(Date.now() / 1000) + (365 * 24 * 3600), // 1 year from now
        signature.timestamp,
        'AFT Request Certification',
        'I certify that the above file(s)/media to be transferred to/from the IS are required to support the development and sustainment contractual efforts on the ACDS contract.',
        ipAddress,
        signature.userAgent || 'Unknown'
      );
      
      await auditLog(authResult.session.userId, 'AFT_REQUEST_SUBMITTED', 
        `AFT request submitted for approval: ${existingRequest.request_number}`, ipAddress);
      
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Request submitted successfully and is now pending ISSM/ISSO review',
        status: 'submitted'
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
      
    } catch (error: any) {
      console.error('Error submitting AFT request:', error);
      return new Response(JSON.stringify({ 
        success: false, 
        message: 'Failed to submit request: ' + error.message 
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
  
  return null;
}
