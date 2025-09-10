// DTA API endpoints
import { UserRole, getDb } from "../../lib/database-bun";
import { RoleMiddleware } from "../../middleware/role-middleware";
import { RequestTrackingService } from "../../lib/request-tracking";
import { auditLog } from "../../lib/security";

export async function handleDTAAPI(request: Request, path: string, ipAddress: string): Promise<Response | null> {
  if (!path.startsWith('/api/dta/')) {
    return null;
  }

  // Check authentication and DTA role
  const authResult = await RoleMiddleware.checkAuthAndRole(request, ipAddress, UserRole.DTA);
  if (authResult.response) return authResult.response;

  const db = getDb();
  const userId = authResult.session.userId;
  const userEmail = authResult.session.email;

  // Parse the API path
  const apiPath = path.replace('/api/dta/', '');
  const segments = apiPath.split('/').filter(Boolean);

  try {
    switch (request.method) {
      case 'GET':
        return await handleDTAGet(segments, db, userId, userEmail, ipAddress);
      case 'POST':
        return await handleDTAPost(segments, request, db, userId, userEmail, ipAddress);
      case 'PUT':
        return await handleDTAPut(segments, request, db, userId, userEmail, ipAddress);
      default:
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
          status: 405,
          headers: { 'Content-Type': 'application/json' }
        });
    }
  } catch (error) {
    console.error('DTA API error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function handleDTAGet(segments: string[], db: any, userId: number, userEmail: string, ipAddress: string): Promise<Response> {
  const [resource, id, action] = segments;

  switch (resource) {
    case 'dashboard':
      return getDashboardData(db);
    
    case 'requests':
      if (id && action === 'timeline') {
        return getRequestTimeline(db, parseInt(id));
      } else if (id) {
        return getRequestDetails(db, parseInt(id));
      } else {
        return getAllRequests(db);
      }
    
    case 'transfers':
      if (id && action === 'status') {
        return getTransferStatus(db, parseInt(id));
      } else if (action === 'active') {
        return getActiveTransfers(db);
      } else {
        return getAllTransfers(db);
      }
    
    case 'statistics':
      return getDTAStatistics(db);
    
    default:
      return new Response(JSON.stringify({ error: 'Resource not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
  }
}

async function handleDTAPost(segments: string[], request: Request, db: any, userId: number, userEmail: string, ipAddress: string): Promise<Response> {
  const [resource, id, action] = segments;
  const body = await request.json().catch(() => ({}));

  switch (resource) {
    case 'requests':
      if (id && action === 'approve') {
        return await approveRequest(db, parseInt(id), body, userId, userEmail, ipAddress);
      } else if (id && action === 'reject') {
        return await rejectRequest(db, parseInt(id), body, userId, userEmail, ipAddress);
      } else if (id && action === 'antivirus-scan') {
        return await recordAntivirusScan(db, parseInt(id), body, userId, userEmail, ipAddress);
      } else if (id && action === 'complete-transfer') {
        return await completeTransfer(db, parseInt(id), body, userId, userEmail, ipAddress);
      }
      break;
    
    case 'transfers':
      if (id && action === 'pause') {
        return await pauseTransfer(db, parseInt(id), userId, userEmail, ipAddress);
      } else if (id && action === 'resume') {
        return await resumeTransfer(db, parseInt(id), userId, userEmail, ipAddress);
      } else if (id && action === 'cancel') {
        return await cancelTransfer(db, parseInt(id), body, userId, userEmail, ipAddress);
      }
      break;
    
    case 'bulk':
      if (action === 'process') {
        return await bulkProcessRequests(db, body, userId, userEmail, ipAddress);
      }
      break;
  }

  return new Response(JSON.stringify({ error: 'Action not supported' }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' }
  });
}

async function handleDTAPut(segments: string[], request: Request, db: any, userId: number, userEmail: string, ipAddress: string): Promise<Response> {
  const [resource, id] = segments;
  const body = await request.json().catch(() => ({}));

  switch (resource) {
    case 'requests':
      if (id) {
        return updateRequest(db, parseInt(id), body, userId, userEmail, ipAddress);
      }
      break;
    
    case 'transfers':
      if (id) {
        return updateTransferSettings(db, parseInt(id), body, userId, userEmail, ipAddress);
      }
      break;
  }

  return new Response(JSON.stringify({ error: 'Update not supported' }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' }
  });
}

// GET endpoint implementations
function getDashboardData(db: any): Response {
  const stats = {
    totalRequests: db.query("SELECT COUNT(*) as count FROM aft_requests").get(),
    pendingDTA: db.query("SELECT COUNT(*) as count FROM aft_requests WHERE status = 'pending_dta'").get(),
    activeTransfers: db.query("SELECT COUNT(*) as count FROM aft_requests WHERE status = 'active_transfer'").get(),
    completedToday: db.query(`
      SELECT COUNT(*) as count FROM aft_requests 
      WHERE status = 'completed' AND DATE(datetime(updated_at, 'unixepoch')) = DATE('now')
    `).get()
  };

  return new Response(JSON.stringify({ success: true, stats }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

function getAllRequests(db: any): Response {
  const requests = RequestTrackingService.getRequestsWithTimeline({ limit: 100 });
  return new Response(JSON.stringify({ success: true, requests }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

function getRequestDetails(db: any, requestId: number): Response {
  const request = db.query("SELECT * FROM aft_requests WHERE id = ?").get(requestId);
  if (!request) {
    return new Response(JSON.stringify({ error: 'Request not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return new Response(JSON.stringify({ success: true, request }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

function getRequestTimeline(db: any, requestId: number): Response {
  const request = db.query("SELECT * FROM aft_requests WHERE id = ?").get(requestId);
  if (!request) {
    return new Response(JSON.stringify({ error: 'Request not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const timeline = RequestTrackingService.getRequestTimeline(requestId);
  return new Response(JSON.stringify({ success: true, request, timeline }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

function getActiveTransfers(db: any): Response {
  const transfers = db.query(`
    SELECT * FROM aft_requests 
    WHERE status = 'active_transfer' 
    ORDER BY updated_at DESC
  `).all();

  return new Response(JSON.stringify({ success: true, transfers }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

function getAllTransfers(db: any): Response {
  const transfers = db.query(`
    SELECT * FROM aft_requests 
    WHERE status IN ('active_transfer', 'completed', 'cancelled') 
    ORDER BY updated_at DESC 
    LIMIT 50
  `).all();

  return new Response(JSON.stringify({ success: true, transfers }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

function getTransferStatus(db: any, requestId: number): Response {
  const transfer = db.query(`
    SELECT *, 
      CASE 
        WHEN status = 'active_transfer' THEN 'running'
        WHEN status = 'completed' THEN 'completed'
        WHEN status = 'cancelled' THEN 'cancelled'
        ELSE 'unknown'
      END as transfer_status
    FROM aft_requests 
    WHERE id = ?
  `).get(requestId);

  if (!transfer) {
    return new Response(JSON.stringify({ error: 'Transfer not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return new Response(JSON.stringify({ success: true, transfer }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

function getDTAStatistics(db: any): Response {
  const stats = {
    totalProcessed: db.query("SELECT COUNT(*) as count FROM aft_requests WHERE status NOT IN ('draft', 'submitted')").get(),
    averageProcessingTime: "2.4 hours", // This would be calculated from actual data
    dataVolume: "1.2 TB", // This would be calculated from actual data
    successRate: "98.5%", // This would be calculated from actual data
    weeklyTrends: [
      { day: 'Mon', processed: 15 },
      { day: 'Tue', processed: 23 },
      { day: 'Wed', processed: 18 },
      { day: 'Thu', processed: 31 },
      { day: 'Fri', processed: 27 },
      { day: 'Sat', processed: 12 },
      { day: 'Sun', processed: 8 }
    ]
  };

  return new Response(JSON.stringify({ success: true, stats }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

// POST endpoint implementations
async function approveRequest(db: any, requestId: number, body: any, userId: number, userEmail: string, ipAddress: string): Response {
  const request = db.query("SELECT * FROM aft_requests WHERE id = ?").get(requestId);
  if (!request) {
    return new Response(JSON.stringify({ error: 'Request not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (request.status !== 'pending_dta') {
    return new Response(JSON.stringify({ error: 'Request is not pending DTA approval' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Update request status to active_transfer and assign DTA
  db.query(`
    UPDATE aft_requests 
    SET status = ?, dta_id = ?, actual_start_date = unixepoch(), updated_at = unixepoch() 
    WHERE id = ?
  `).run('active_transfer', userId, requestId);

  // Log the approval
  RequestTrackingService.addTimelineEntry(requestId, 'dta_approved', 'DTA Approved', 
    `Request approved by ${userEmail} and moved to active transfer`, userEmail);

  // Security audit log
  await auditLog('DTA_APPROVAL', userEmail, ipAddress, { 
    requestId, 
    action: 'approve',
    notes: body.notes || 'No additional notes' 
  });

  return new Response(JSON.stringify({ 
    success: true, 
    message: 'Request approved and moved to active transfer status',
    newStatus: 'active_transfer'
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

async function rejectRequest(db: any, requestId: number, body: any, userId: number, userEmail: string, ipAddress: string): Response {
  const request = db.query("SELECT * FROM aft_requests WHERE id = ?").get(requestId);
  if (!request) {
    return new Response(JSON.stringify({ error: 'Request not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (request.status !== 'pending_dta') {
    return new Response(JSON.stringify({ error: 'Request is not pending DTA approval' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (!body.reason) {
    return new Response(JSON.stringify({ error: 'Rejection reason is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Update request status
  db.query("UPDATE aft_requests SET status = ?, updated_at = unixepoch() WHERE id = ?").run('rejected', requestId);

  // Log the rejection
  RequestTrackingService.addTimelineEntry(requestId, 'dta_rejected', 'DTA Rejected', 
    `Request rejected by ${userEmail}: ${body.reason}`, userEmail);

  // Security audit log
  await auditLog('DTA_REJECTION', userEmail, ipAddress, { 
    requestId, 
    action: 'reject', 
    reason: body.reason 
  });

  return new Response(JSON.stringify({ success: true, message: 'Request rejected successfully' }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

async function pauseTransfer(db: any, requestId: number, userId: number, userEmail: string, ipAddress: string): Response {
  const request = db.query("SELECT * FROM aft_requests WHERE id = ?").get(requestId);
  if (!request) {
    return new Response(JSON.stringify({ error: 'Request not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (request.status !== 'active_transfer') {
    return new Response(JSON.stringify({ error: 'Transfer is not active' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // In a real implementation, this would pause the actual transfer process
  // For now, we'll just log the action
  RequestTrackingService.addTimelineEntry(requestId, 'transfer_paused', 'Transfer Paused', 
    `Transfer paused by ${userEmail}`, userEmail);

  // Security audit log
  await auditLog('TRANSFER_PAUSE', userEmail, ipAddress, { requestId });

  return new Response(JSON.stringify({ success: true, message: 'Transfer paused successfully' }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

async function resumeTransfer(db: any, requestId: number, userId: number, userEmail: string, ipAddress: string): Response {
  const request = db.query("SELECT * FROM aft_requests WHERE id = ?").get(requestId);
  if (!request) {
    return new Response(JSON.stringify({ error: 'Request not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Resume transfer logic would go here
  RequestTrackingService.addTimelineEntry(requestId, 'transfer_resumed', 'Transfer Resumed', 
    `Transfer resumed by ${userEmail}`, userEmail);

  // Security audit log
  await auditLog('TRANSFER_RESUME', userEmail, ipAddress, { requestId });

  return new Response(JSON.stringify({ success: true, message: 'Transfer resumed successfully' }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

async function cancelTransfer(db: any, requestId: number, body: any, userId: number, userEmail: string, ipAddress: string): Response {
  const request = db.query("SELECT * FROM aft_requests WHERE id = ?").get(requestId);
  if (!request) {
    return new Response(JSON.stringify({ error: 'Request not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Update request status
  db.query("UPDATE aft_requests SET status = ?, updated_at = unixepoch() WHERE id = ?").run('cancelled', requestId);

  // Log the cancellation
  RequestTrackingService.addTimelineEntry(requestId, 'transfer_cancelled', 'Transfer Cancelled', 
    `Transfer cancelled by ${userEmail}: ${body.reason || 'No reason provided'}`, userEmail);

  // Security audit log
  await auditLog('TRANSFER_CANCEL', userEmail, ipAddress, { 
    requestId, 
    reason: body.reason || 'No reason provided' 
  });

  return new Response(JSON.stringify({ success: true, message: 'Transfer cancelled successfully' }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

async function bulkProcessRequests(db: any, body: any, userId: number, userEmail: string, ipAddress: string): Response {
  const { action, requestIds, reason } = body;
  
  if (!action || !requestIds || !Array.isArray(requestIds)) {
    return new Response(JSON.stringify({ error: 'Invalid bulk request data' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const results = [];
  const errors = [];

  for (const requestId of requestIds) {
    try {
      const request = db.query("SELECT * FROM aft_requests WHERE id = ?").get(requestId);
      if (!request) {
        errors.push(`Request ${requestId} not found`);
        continue;
      }

      if (action === 'approve' && request.status === 'pending_dta') {
        db.query("UPDATE aft_requests SET status = ?, updated_at = unixepoch() WHERE id = ?").run('active_transfer', requestId);
        RequestTrackingService.addTimelineEntry(requestId, 'dta_approved', 'DTA Approved (Bulk)', 
          `Bulk approved by ${userEmail}`, userEmail);
        results.push({ requestId, status: 'approved' });
      } else if (action === 'reject' && request.status === 'pending_dta') {
        db.query("UPDATE aft_requests SET status = ?, updated_at = unixepoch() WHERE id = ?").run('rejected', requestId);
        RequestTrackingService.addTimelineEntry(requestId, 'dta_rejected', 'DTA Rejected (Bulk)', 
          `Bulk rejected by ${userEmail}: ${reason}`, userEmail);
        results.push({ requestId, status: 'rejected' });
      } else {
        errors.push(`Request ${requestId} cannot be ${action}d in current status`);
      }
    } catch (error) {
      errors.push(`Error processing request ${requestId}: ${error.message}`);
    }
  }

  // Security audit log
  await auditLog('BULK_PROCESS', userEmail, ipAddress, { 
    action, 
    requestCount: requestIds.length,
    successCount: results.length,
    errorCount: errors.length 
  });

  return new Response(JSON.stringify({ 
    success: true, 
    processed: results.length,
    errors: errors.length,
    results,
    errors 
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

function updateRequest(db: any, requestId: number, body: any, userId: number, userEmail: string, ipAddress: string): Response {
  const request = db.query("SELECT * FROM aft_requests WHERE id = ?").get(requestId);
  if (!request) {
    return new Response(JSON.stringify({ error: 'Request not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Update allowed fields
  const allowedFields = ['priority', 'notes', 'transfer_window'];
  const updates = [];
  const values = [];

  for (const [field, value] of Object.entries(body)) {
    if (allowedFields.includes(field)) {
      updates.push(`${field} = ?`);
      values.push(value);
    }
  }

  if (updates.length === 0) {
    return new Response(JSON.stringify({ error: 'No valid fields to update' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  values.push(Date.now() / 1000); // updated_at
  values.push(requestId);

  db.query(`UPDATE aft_requests SET ${updates.join(', ')}, updated_at = ? WHERE id = ?`).run(...values);

  // Log the update
  RequestTrackingService.addTimelineEntry(requestId, 'dta_updated', 'DTA Updated', 
    `Request updated by ${userEmail}`, userEmail);

  return new Response(JSON.stringify({ success: true, message: 'Request updated successfully' }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

function updateTransferSettings(db: any, requestId: number, body: any, userId: number, userEmail: string, ipAddress: string): Response {
  // This would update transfer-specific settings like bandwidth limits, retry counts, etc.
  return new Response(JSON.stringify({ success: true, message: 'Transfer settings updated' }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

// Section 4 AFT Form Functions - Anti-Virus Scan and Transfer Process

async function recordAntivirusScan(db: any, requestId: number, body: any, userId: number, userEmail: string, ipAddress: string): Promise<Response> {
  const request = db.query("SELECT * FROM aft_requests WHERE id = ?").get(requestId);
  if (!request) {
    return new Response(JSON.stringify({ error: 'Request not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (request.status !== 'active_transfer') {
    return new Response(JSON.stringify({ error: 'Request is not in active transfer status' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const { scanType, filesScanned, threatsFound } = body;
  
  if (!scanType || !['origination', 'destination'].includes(scanType)) {
    return new Response(JSON.stringify({ error: 'Invalid scan type. Must be "origination" or "destination"' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Update the appropriate scan fields based on scan type
  if (scanType === 'origination') {
    db.query(`
      UPDATE aft_requests 
      SET origination_scan_performed = 1, 
          origination_files_scanned = ?, 
          origination_threats_found = ?,
          updated_at = unixepoch()
      WHERE id = ?
    `).run(filesScanned || 0, threatsFound || 0, requestId);
    
    RequestTrackingService.addTimelineEntry(requestId, 'origination_scan', 'Origination Media Scan Complete', 
      `Scanned ${filesScanned || 0} files, found ${threatsFound || 0} threats by ${userEmail}`, userEmail);
  } else {
    db.query(`
      UPDATE aft_requests 
      SET destination_scan_performed = 1, 
          destination_files_scanned = ?, 
          destination_threats_found = ?,
          updated_at = unixepoch()
      WHERE id = ?
    `).run(filesScanned || 0, threatsFound || 0, requestId);
    
    RequestTrackingService.addTimelineEntry(requestId, 'destination_scan', 'Destination Media Scan Complete', 
      `Scanned ${filesScanned || 0} files, found ${threatsFound || 0} threats by ${userEmail}`, userEmail);
  }

  // Security audit log
  await auditLog('ANTIVIRUS_SCAN', userEmail, ipAddress, { 
    requestId, 
    scanType,
    filesScanned: filesScanned || 0,
    threatsFound: threatsFound || 0
  });

  return new Response(JSON.stringify({ 
    success: true, 
    message: `${scanType} scan recorded successfully`,
    scanType,
    filesScanned: filesScanned || 0,
    threatsFound: threatsFound || 0
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

async function completeTransfer(db: any, requestId: number, body: any, userId: number, userEmail: string, ipAddress: string): Promise<Response> {
  const request = db.query("SELECT * FROM aft_requests WHERE id = ?").get(requestId);
  if (!request) {
    return new Response(JSON.stringify({ error: 'Request not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  if (request.status !== 'active_transfer') {
    return new Response(JSON.stringify({ error: 'Request is not in active transfer status' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Validate that both scans have been performed
  if (!request.origination_scan_performed || !request.destination_scan_performed) {
    return new Response(JSON.stringify({ 
      error: 'Both origination and destination anti-virus scans must be completed before transfer completion',
      requiresScans: {
        origination: !request.origination_scan_performed,
        destination: !request.destination_scan_performed
      }
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // If threats were found, prevent completion
  if (request.origination_threats_found > 0 || request.destination_threats_found > 0) {
    return new Response(JSON.stringify({ 
      error: 'Transfer cannot be completed due to malware/virus threats found during scanning',
      threats: {
        origination: request.origination_threats_found,
        destination: request.destination_threats_found
      }
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const { filesTransferred, smeUserId, tpiMaintained } = body;

  // Validate required fields
  if (!filesTransferred || !smeUserId) {
    return new Response(JSON.stringify({ 
      error: 'Files transferred count and SME user ID are required' 
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Update request with transfer completion data and move to pending SME signature
  db.query(`
    UPDATE aft_requests 
    SET transfer_completed_date = unixepoch(),
        files_transferred_count = ?,
        dta_signature_date = unixepoch(),
        sme_id = ?,
        tpi_maintained = ?,
        actual_end_date = unixepoch(),
        status = 'pending_sme_signature',
        updated_at = unixepoch()
    WHERE id = ?
  `).run(filesTransferred, smeUserId, tpiMaintained ? 1 : 0, requestId);

  // Log the transfer completion
  RequestTrackingService.addTimelineEntry(requestId, 'transfer_completed', 'Transfer Completed by DTA', 
    `Transfer completed by ${userEmail}. ${filesTransferred} files transferred. TPI ${tpiMaintained ? 'maintained' : 'not maintained'}`, userEmail);

  // Add timeline entry for pending SME signature
  RequestTrackingService.addTimelineEntry(requestId, 'pending_sme_signature', 'Pending SME Signature', 
    `Transfer completed, waiting for SME signature for Two-Person Integrity`, userEmail);

  // Security audit log
  await auditLog('TRANSFER_COMPLETION', userEmail, ipAddress, { 
    requestId, 
    filesTransferred,
    smeUserId,
    tpiMaintained
  });

  return new Response(JSON.stringify({ 
    success: true, 
    message: 'Transfer completed successfully. Request moved to pending SME signature.',
    newStatus: 'pending_sme_signature',
    filesTransferred,
    dtaSignatureDate: Date.now() / 1000,
    requiresSmeSignature: true
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}