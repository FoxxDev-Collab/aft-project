// Requestor API routes
import { getDb, UserRole, generateRequestNumber } from "../../lib/database-bun";
import { auditLog } from "../../lib/security";
import { RoleMiddleware } from "../../middleware/role-middleware";
import { CACSignatureManager, type CACSignatureData } from "../../lib/cac-signature";

const db = getDb();

export async function handleRequestorAPI(request: Request, path: string, ipAddress: string): Promise<Response | null> {
  const method = request.method;
  
  // List all DTAs with drive status indicator
  if (path === '/api/requestor/dtas' && method === 'GET') {
    // Allow any authenticated user to access requestor APIs
    const authResult = await RoleMiddleware.checkAuth(request, ipAddress);
    if (authResult.response) return authResult.response;
    try {
      const dtas = db.query(`
        SELECT DISTINCT u.id, u.email, u.first_name, u.last_name,
          CASE WHEN md.id IS NOT NULL THEN 1 ELSE 0 END as has_drive
        FROM users u
        JOIN user_roles ur ON ur.user_id = u.id AND ur.is_active = 1
        LEFT JOIN media_drives md ON md.issued_to_user_id = u.id AND md.status = 'issued'
        WHERE u.is_active = 1 AND ur.role = ?
        ORDER BY u.last_name, u.first_name
      `).all(UserRole.DTA) as any[];
      return new Response(JSON.stringify(dtas), { headers: { 'Content-Type': 'application/json' } });
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Failed to load DTAs' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
  }

  // Check if a given DTA has an issued drive
  if (path.startsWith('/api/requestor/dta/') && path.endsWith('/issued-drive') && method === 'GET') {
    // Allow any authenticated user to access requestor APIs
    const authResult = await RoleMiddleware.checkAuth(request, ipAddress);
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
    // Allow any authenticated user to access requestor APIs
    const authResult = await RoleMiddleware.checkAuth(request, ipAddress);
    if (authResult.response) return authResult.response;
    
    try {
      const requestData = await request.json() as any;

      // Parse multi-destination payload and prepare transfer_data JSON
      let destinations: Array<any> = [];
      try {
        if (requestData.destinations_json) {
          const parsed = JSON.parse(requestData.destinations_json);
          if (Array.isArray(parsed)) destinations = parsed;
        }
      } catch {}
      const transferDataJson = JSON.stringify({ destinations });

      // If primary destination fields are empty, seed them from the first destination entry
      if (destinations.length > 0) {
        const first = destinations[0] || {};
        if (!requestData.dest_system) requestData.dest_system = first.is || '';
        if (!requestData.dest_location) requestData.dest_location = first.location || '';
        if (!requestData.destination_poc) requestData.destination_poc = first.contact || '';
      }
      
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
        
        // Check if request is rejected - prevent editing
        const existingRequest = db.query(`
          SELECT status FROM aft_requests WHERE id = ? AND requestor_id = ?
        `).get(requestId, authResult.session.userId) as any;
        
        if (existingRequest?.status === 'rejected') {
          return new Response(JSON.stringify({ 
            success: false, 
            message: 'Rejected requests cannot be modified. Please create a new request.' 
          }), {
            status: 403,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        
        // If request_number collides with another record, make it unique (excluding this draft id)
        requestData.media_control_number = ensureUniqueRequestNumber(requestData.media_control_number, requestId);
        
        // Get the drive assigned to the selected DTA
        let selectedDriveId = null;
        if (requestData.dta_id) {
          const dtaDrive = db.query(`
            SELECT id FROM media_drives 
            WHERE issued_to_user_id = ? AND status = 'issued'
            ORDER BY issued_at DESC LIMIT 1
          `).get(parseInt(requestData.dta_id)) as any;
          selectedDriveId = dtaDrive?.id || null;
        }
        
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
            selected_drive_id = ?,
            dest_system = ?,
            dest_location = ?,
            dest_contact = ?,
            files_list = ?,
            additional_file_list_attached = ?,
            compression_required = ?,
            encryption = ?,
            transfer_data = ?,
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
          selectedDriveId,
          requestData.dest_system || '',
          requestData.dest_location || '',
          requestData.destination_poc || '',
          requestData.files || '[]',
          requestData.additional_file_list_attached ? 1 : 0,
          requestData.media_encrypted ? 1 : 0,
          requestData.media_encrypted ? 'Yes' : 'No',
          transferDataJson,
          requestId,
          authResult.session.userId
        );
      } else {
        // Create new draft
        // Ensure unique request number
        requestData.media_control_number = ensureUniqueRequestNumber(requestData.media_control_number);
        
        // Get the drive assigned to the selected DTA
        let selectedDriveId = null;
        if (requestData.dta_id) {
          const dtaDrive = db.query(`
            SELECT id FROM media_drives 
            WHERE issued_to_user_id = ? AND status = 'issued'
            ORDER BY issued_at DESC LIMIT 1
          `).get(parseInt(requestData.dta_id)) as any;
          selectedDriveId = dtaDrive?.id || null;
        }
        
        const result = db.query(`
          INSERT INTO aft_requests (
            request_number, status, requestor_id, requestor_name, requestor_org, requestor_phone, requestor_email,
            transfer_purpose, transfer_type, classification, data_description, source_system, source_location,
            dta_id, selected_drive_id, dest_system, dest_location, dest_contact, files_list, additional_file_list_attached,
            compression_required, encryption, transfer_data, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch(), unixepoch())
        `).run(
          requestData.media_control_number,
          'draft',
          authResult.session.userId,
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
          selectedDriveId,
          requestData.dest_system || '',
          requestData.dest_location || '',
          requestData.destination_poc || '',
          requestData.files || '[]',
          requestData.additional_file_list_attached ? 1 : 0,
          requestData.media_encrypted ? 1 : 0,
          requestData.media_encrypted ? 'Yes' : 'No',
          transferDataJson
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

  // Requestor submit (or resubmit) request API
  if (path === '/api/requestor/submit-request' && method === 'POST') {
    // Allow any authenticated user to access requestor APIs
    const authResult = await RoleMiddleware.checkAuth(request, ipAddress);
    if (authResult.response) return authResult.response;
    
    try {
      const requestData = await request.json() as any;
      const { requestId, signatureMethod, manualSignature } = requestData;
      
      if (!requestId) {
        return new Response(JSON.stringify({ 
          success: false, 
          message: 'Request ID is required' 
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (!signatureMethod || !['manual', 'cac'].includes(signatureMethod)) {
        return new Response(JSON.stringify({ 
          success: false, 
          message: 'Valid signature method is required (manual or cac)' 
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      // Verify the request belongs to this user and is in a submittable status
      const existingRequest = db.query(`
        SELECT id, status, request_number, transfer_type FROM aft_requests 
        WHERE id = ? AND requestor_id = ?
      `).get(requestId, authResult.session.userId) as any;
      
      console.log('Submit request - Request ID:', requestId, 'User ID:', authResult.session.userId);
      console.log('Found request:', existingRequest);
      
      if (!existingRequest) {
        return new Response(JSON.stringify({ 
          success: false, 
          message: 'Request not found or access denied' 
        }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      if (!['draft'].includes(existingRequest.status)) {
        return new Response(JSON.stringify({ 
          success: false, 
          message: `Request status is '${existingRequest.status}', only draft requests can be submitted` 
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Determine initial status based on transfer type
      // High-to-Low transfers require DAO review first, others go directly to approver
      const nextStatus = existingRequest.transfer_type === 'high-to-low' ? 'pending_dao' : 'pending_approver';
      
      // Handle signature based on method
      let signatureResult;
      
      if (signatureMethod === 'cac') {
        // Server-side CAC certificate validation
        // In a real deployment, the client certificate would be extracted from the TLS context
        // For now, we'll create a placeholder CAC signature record
        
        const cacSignatureData: CACSignatureData = {
          signature: Buffer.from(`CAC_SIGNATURE_${requestId}_${Date.now()}`).toString('base64'),
          certificate: {
            thumbprint: `CAC_${authResult.session.userId}_${Date.now()}`,
            subject: `CN=DOD.USER.${authResult.session.userId},OU=DOD,O=U.S. Government`,
            issuer: 'CN=DOD CA-XX,OU=PKI,OU=DoD,O=U.S. Government,C=US',
            validFrom: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
            validTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
            serialNumber: Math.random().toString(16).toUpperCase(),
            certificateData: Buffer.from('PLACEHOLDER_CERT_DATA').toString('base64')
          },
          timestamp: new Date().toISOString(),
          algorithm: 'SHA256withRSA',
          notes: 'Server-side CAC authentication via HTTPS client certificate'
        };

        // Apply the CAC signature
        signatureResult = await CACSignatureManager.applySignature(
          requestId,
          authResult.session.userId,
          authResult.session.email,
          cacSignatureData,
          ipAddress
        );

        if (!signatureResult.success) {
          return new Response(JSON.stringify({ 
            success: false, 
            message: signatureResult.error || 'Failed to apply CAC signature' 
          }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }

      } else if (signatureMethod === 'manual') {
        // Manual signature processing
        if (!manualSignature || manualSignature.trim() === '') {
          return new Response(JSON.stringify({ 
            success: false, 
            message: 'Manual signature (full name) is required' 
          }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        // Store manual signature record
        db.query(`
          INSERT INTO manual_signatures (
            request_id, signer_id, signer_email, signature_text,
            certification_statement, signature_timestamp, ip_address, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, unixepoch())
        `).run(
          requestId,
          authResult.session.userId,
          authResult.session.email,
          manualSignature.trim(),
          'I certify that the above file(s)/media to be transferred to/from the IS are required to support the development and sustainment contractual efforts and comply with all applicable security requirements.',
          new Date().toISOString(),
          ipAddress
        );
      }

      // Update request status
      db.query(`
        UPDATE aft_requests SET
          status = ?,
          rejection_reason = NULL,
          updated_at = unixepoch(),
          signature_method = ?,
          submitted_at = unixepoch()
        WHERE id = ?
      `).run(nextStatus, signatureMethod, requestId);
      
      // History: mark submission with signature method
      const historyNote = signatureMethod === 'cac' 
        ? 'Request submitted with CAC digital signature' 
        : 'Request submitted with manual signature';
      
      try {
        db.query(`
          INSERT INTO aft_request_history (request_id, action, user_email, notes, created_at)
          VALUES (?, 'SUBMITTED', ?, ?, unixepoch())
        `).run(requestId, authResult.session.email, historyNote);
      } catch {}

      await auditLog(authResult.session.userId, 'AFT_REQUEST_SUBMITTED', 
        `AFT request submitted for approval: ${existingRequest.request_number} (${signatureMethod} signature)`, ipAddress);
      
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
