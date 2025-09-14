// Media Custodian API endpoints
import { getDb } from "../../lib/database-bun";
import { RequestTrackingService } from "../../lib/request-tracking";

export class MediaCustodianAPI {
  
  // Get all users for assignment dropdowns
  static async getAllUsers(): Promise<any[]> {
    const db = getDb();
    return db.query(`
      SELECT id, email, first_name, last_name, role 
      FROM users 
      WHERE active = 1 
      ORDER BY last_name, first_name
    `).all() as any[];
  }
  
  // Get only DTAs for drive assignment
  static async getDTAUsers(): Promise<any[]> {
    const db = getDb();
    return db.query(`
      SELECT DISTINCT u.id, u.email, u.first_name, u.last_name
      FROM users u
      JOIN user_roles ur ON ur.user_id = u.id AND ur.is_active = 1
      WHERE u.is_active = 1 AND ur.role = 'dta'
      ORDER BY u.last_name, u.first_name
    `).all() as any[];
  }

  // Media Drive CRUD Operations
  static async getAllMediaDrives(): Promise<any[]> {
    const db = getDb();
    return db.query(`
      SELECT md.*, u.email as issued_to_email, u.first_name, u.last_name
      FROM media_drives md
      LEFT JOIN users u ON md.issued_to_user_id = u.id
      ORDER BY md.created_at DESC
    `).all() as any[];
  }

  static async getMediaDriveById(id: number): Promise<any | null> {
    const db = getDb();
    const row = db.query(`
      SELECT md.*, u.email as issued_to_email, u.first_name, u.last_name
      FROM media_drives md
      LEFT JOIN users u ON md.issued_to_user_id = u.id
      WHERE md.id = ?
    `).get(id) as any | undefined;
    return row || null;
  }

  static async createMediaDrive(driveData: any): Promise<any> {
    const db = getDb();
    const result = db.query(`
      INSERT INTO media_drives (serial_number, media_control_number, type, model, capacity, location, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      driveData.serial_number,
      driveData.media_control_number || null,
      driveData.type,
      driveData.model,
      driveData.capacity,
      driveData.location || '',
      driveData.status || 'available'
    );
    
    return { id: result.lastInsertRowid, ...driveData };
  }

  static async updateMediaDrive(id: number, driveData: any): Promise<boolean> {
    const db = getDb();
    const fields = [];
    const values = [];
    
    if (driveData.serial_number !== undefined) {
      fields.push('serial_number = ?');
      values.push(driveData.serial_number);
    }
    if (driveData.media_control_number !== undefined) {
      fields.push('media_control_number = ?');
      values.push(driveData.media_control_number);
    }
    if (driveData.type !== undefined) {
      fields.push('type = ?');
      values.push(driveData.type);
    }
    if (driveData.model !== undefined) {
      fields.push('model = ?');
      values.push(driveData.model);
    }
    if (driveData.capacity !== undefined) {
      fields.push('capacity = ?');
      values.push(driveData.capacity);
    }
    if (driveData.location !== undefined) {
      fields.push('location = ?');
      values.push(driveData.location);
    }
    if (driveData.status !== undefined) {
      fields.push('status = ?');
      values.push(driveData.status);
    }
    
    fields.push('updated_at = unixepoch()');
    values.push(id);
    
    const result = db.query(`
      UPDATE media_drives 
      SET ${fields.join(', ')}
      WHERE id = ?
    `).run(...values);
    
    return result.changes > 0;
  }

  static async deleteMediaDrive(id: number): Promise<boolean> {
    const db = getDb();
    const result = db.query('DELETE FROM media_drives WHERE id = ?').run(id);
    return result.changes > 0;
  }

  static async issueDrive(driveId: number, userId: number, purpose: string): Promise<{ success: boolean; message: string }> {
    const db = getDb();
    
    // 1. Check if user is a DTA
    const user = db.query(`
      SELECT u.id, u.email, ur.role
      FROM users u
      JOIN user_roles ur ON ur.user_id = u.id AND ur.is_active = 1
      WHERE u.id = ? AND ur.role = 'dta'
    `).get(userId) as any;
    
    if (!user) {
      return { success: false, message: 'Only DTAs can have drives issued to them' };
    }
    
    // 2. Check if DTA already has a drive issued
    const existingDrive = db.query(`
      SELECT id, media_control_number, type
      FROM media_drives
      WHERE issued_to_user_id = ? AND status = 'issued'
    `).get(userId) as any;
    
    if (existingDrive) {
      return { 
        success: false, 
        message: `DTA already has drive ${existingDrive.media_control_number} (${existingDrive.type}) issued. DTAs can only have one drive at a time.` 
      };
    }
    
    // 3. Issue the drive
    const result = db.query(`
      UPDATE media_drives 
      SET issued_to_user_id = ?, issued_at = unixepoch(), purpose = ?, status = 'issued', last_used = unixepoch(), updated_at = unixepoch()
      WHERE id = ? AND status = 'available'
    `).run(userId, purpose, driveId);
    
    if (result.changes > 0) {
      return { success: true, message: 'Drive issued successfully' };
    } else {
      return { success: false, message: 'Drive not available or not found' };
    }
  }

  static async returnDrive(driveId: number): Promise<{ success: boolean; message: string }> {
    const db = getDb();
    
    // Check if drive has any active AFT requests
    const activeRequest = db.query(`
      SELECT ar.id, ar.status, ar.request_number
      FROM aft_requests ar 
      WHERE ar.selected_drive_id = ? 
      AND ar.status NOT IN ('completed', 'disposed', 'rejected', 'cancelled')
      LIMIT 1
    `).get(driveId) as any;
    
    if (activeRequest) {
      return {
        success: false,
        message: `Cannot return drive. Associated with active AFT request ${activeRequest.request_number} (${activeRequest.status})`
      };
    }
    
    const result = db.query(`
      UPDATE media_drives 
      SET issued_to_user_id = NULL, returned_at = unixepoch(), status = 'available', last_used = unixepoch(), updated_at = unixepoch()
      WHERE id = ?
    `).run(driveId);
    
    return {
      success: result.changes > 0,
      message: result.changes > 0 ? 'Drive returned successfully' : 'Failed to return drive'
    };
  }

  // Get media inventory (alias for getAllMediaDrives for inventory page)
  static async getMediaInventory(): Promise<any[]> {
    return this.getAllMediaDrives();
  }

  // Get all requests with filtering support
  static async getAllRequests(query: any = {}): Promise<any[]> {
    const db = getDb();
    
    let sql = `
      SELECT ar.*, 
             u.first_name || ' ' || u.last_name as requestor_name,
             u.email as requestor_email
      FROM aft_requests ar
      LEFT JOIN users u ON ar.requestor_id = u.id
    `;
    
    const conditions = [];
    const params = [];
    
    // Add filtering conditions based on query parameters
    if (query.status) {
      conditions.push('ar.status = ?');
      params.push(query.status);
    }
    
    if (query.requestor_id) {
      conditions.push('ar.requestor_id = ?');
      params.push(query.requestor_id);
    }
    
    if (query.classification) {
      conditions.push('ar.classification = ?');
      params.push(query.classification);
    }
    
    if (query.transfer_type) {
      conditions.push('ar.transfer_type = ?');
      params.push(query.transfer_type);
    }
    
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }
    
    sql += ' ORDER BY ar.created_at DESC';
    
    // Add limit if specified
    if (query.limit) {
      sql += ' LIMIT ?';
      params.push(parseInt(query.limit));
    }
    
    return db.query(sql).all(...params) as any[];
  }

  // Get request statistics for reports page
  static async getRequestStats(): Promise<any> {
    const db = getDb();
    
    // Get total requests count
    const totalResult = db.query('SELECT COUNT(*) as count FROM aft_requests').get() as any;
    const total = totalResult?.count || 0;
    
    // Get pending requests count
    const pendingResult = db.query("SELECT COUNT(*) as count FROM aft_requests WHERE status NOT IN ('completed', 'rejected', 'cancelled')").get() as any;
    const pending = pendingResult?.count || 0;
    
    // Get completed requests count
    const completedResult = db.query("SELECT COUNT(*) as count FROM aft_requests WHERE status = 'completed'").get() as any;
    const completed = completedResult?.count || 0;
    
    // Get recent activity (last 30 days)
    const recentResult = db.query("SELECT COUNT(*) as count FROM aft_requests WHERE created_at >= unixepoch() - 2592000").get() as any;
    const recentActivity = recentResult?.count || 0;
    
    return {
      total,
      pending,
      completed,
      recentActivity
    };
  }

  // Generate reports based on type and parameters
  static async generateReport(type: string, params?: any): Promise<any> {
    const db = getDb();
    
    try {
      switch (type.toLowerCase()) {
        case 'media_inventory':
          return await this.generateMediaInventoryReport(params);
          
        case 'request_summary':
          return await this.generateRequestSummaryReport(params);
          
        case 'drive_utilization':
          return await this.generateDriveUtilizationReport(params);
          
        case 'user_activity':
          return await this.generateUserActivityReport(params);
          
        default:
          throw new Error(`Unknown report type: ${type}`);
      }
    } catch (error) {
      console.error('Error generating report:', error);
      throw error;
    }
  }

  // Generate media inventory report
  private static async generateMediaInventoryReport(params?: any): Promise<any> {
    const db = getDb();
    
    // Get drive counts by status
    const statusCounts = db.query(`
      SELECT status, COUNT(*) as count
      FROM media_drives
      GROUP BY status
    `).all() as any[];

    // Get drive counts by type
    const typeCounts = db.query(`
      SELECT type, COUNT(*) as count
      FROM media_drives
      GROUP BY type
    `).all() as any[];

    // Get recently issued drives
    const recentlyIssued = db.query(`
      SELECT md.*, u.email, u.first_name, u.last_name
      FROM media_drives md
      LEFT JOIN users u ON md.issued_to_user_id = u.id
      WHERE md.issued_at >= unixepoch() - 604800
      ORDER BY md.issued_at DESC
      LIMIT 10
    `).all() as any[];

    return {
      title: 'Media Inventory Report',
      generated_at: new Date().toISOString(),
      summary: {
        total_drives: statusCounts.reduce((sum, item) => sum + item.count, 0),
        by_status: statusCounts,
        by_type: typeCounts
      },
      recently_issued: recentlyIssued
    };
  }

  // Generate request summary report
  private static async generateRequestSummaryReport(params?: any): Promise<any> {
    const db = getDb();
    
    // Get request counts by status
    const statusCounts = db.query(`
      SELECT status, COUNT(*) as count
      FROM aft_requests
      GROUP BY status
    `).all() as any[];

    // Get recent requests
    const recentRequests = db.query(`
      SELECT ar.*, u.first_name || ' ' || u.last_name as requestor_name
      FROM aft_requests ar
      LEFT JOIN users u ON ar.requestor_id = u.id
      ORDER BY ar.created_at DESC
      LIMIT 10
    `).all() as any[];

    // Get monthly request trends (last 6 months)
    const monthlyTrends = db.query(`
      SELECT 
        strftime('%Y-%m', datetime(created_at, 'unixepoch')) as month,
        COUNT(*) as count
      FROM aft_requests
      WHERE created_at >= unixepoch() - 15552000
      GROUP BY month
      ORDER BY month DESC
    `).all() as any[];

    return {
      title: 'Request Summary Report',
      generated_at: new Date().toISOString(),
      summary: {
        total_requests: statusCounts.reduce((sum, item) => sum + item.count, 0),
        by_status: statusCounts,
        monthly_trends: monthlyTrends
      },
      recent_requests: recentRequests
    };
  }

  // Generate drive utilization report
  private static async generateDriveUtilizationReport(params?: any): Promise<any> {
    const db = getDb();
    
    // Get utilization statistics
    const utilization = db.query(`
      SELECT 
        COUNT(*) as total_drives,
        SUM(CASE WHEN status = 'issued' THEN 1 ELSE 0 END) as issued_drives,
        SUM(CASE WHEN status = 'available' THEN 1 ELSE 0 END) as available_drives,
        SUM(CASE WHEN status = 'maintenance' THEN 1 ELSE 0 END) as maintenance_drives
      FROM media_drives
    `).get() as any;

    // Get top users by drive usage
    const topUsers = db.query(`
      SELECT 
        u.first_name || ' ' || u.last_name as user_name,
        u.email,
        COUNT(*) as drives_issued
      FROM media_drives md
      JOIN users u ON md.issued_to_user_id = u.id
      WHERE md.status = 'issued'
      GROUP BY u.id
      ORDER BY drives_issued DESC
      LIMIT 10
    `).all() as any[];

    const utilizationRate = utilization.total_drives > 0 
      ? ((utilization.issued_drives / utilization.total_drives) * 100).toFixed(1)
      : '0.0';

    return {
      title: 'Drive Utilization Report',
      generated_at: new Date().toISOString(),
      summary: {
        ...utilization,
        utilization_rate: `${utilizationRate}%`
      },
      top_users: topUsers
    };
  }

  // Generate user activity report
  private static async generateUserActivityReport(params?: any): Promise<any> {
    const db = getDb();
    
    // Get user request activity
    const userActivity = db.query(`
      SELECT 
        u.first_name || ' ' || u.last_name as user_name,
        u.email,
        COUNT(ar.id) as total_requests,
        SUM(CASE WHEN ar.status = 'completed' THEN 1 ELSE 0 END) as completed_requests,
        MAX(ar.created_at) as last_request_date
      FROM users u
      LEFT JOIN aft_requests ar ON u.id = ar.requestor_id
      WHERE u.role = 'requestor' AND u.active = 1
      GROUP BY u.id
      ORDER BY total_requests DESC
      LIMIT 20
    `).all() as any[];

    return {
      title: 'User Activity Report',
      generated_at: new Date().toISOString(),
      user_activity: userActivity.map(user => ({
        ...user,
        last_request_date: user.last_request_date 
          ? new Date(user.last_request_date * 1000).toISOString().split('T')[0]
          : 'Never'
      }))
    };
  }

  // Process request actions (approve, reject, complete, etc.)
  static async processRequest(
    requestId: number, 
    action: string, 
    userId: number, 
    notes?: string,
    dispositionData?: any
  ): Promise<{ success: boolean; message: string; newStatus?: string }> {
    const db = getDb();
    
    try {
      // Get current request
      const request = db.query('SELECT * FROM aft_requests WHERE id = ?').get(requestId) as any;
      if (!request) {
        return { success: false, message: 'Request not found' };
      }

      let newStatus: string;
      let message: string;

      // Determine new status based on action
      switch (action.toLowerCase()) {
        case 'approve':
          if (request.status === 'pending_media_custodian') {
            newStatus = 'completed';
            message = 'Request approved and marked as completed';
          } else {
            return { success: false, message: 'Request is not in a state that can be approved by media custodian' };
          }
          break;
          
        case 'reject':
          newStatus = 'rejected';
          message = 'Request has been rejected';
          break;
          
        case 'complete':
          newStatus = 'completed';
          message = 'Request marked as completed';
          break;
          
        case 'dispose':
          if (request.status === 'completed' || request.status === 'pending_media_custodian') {
            newStatus = 'disposed';
            message = 'Media has been disposed';
          } else {
            return { success: false, message: 'Request must be completed before disposal' };
          }
          break;
          
        case 'dispose_and_return_drive':
          if (request.status === 'completed' || request.status === 'pending_media_custodian') {
            // First dispose the media
            newStatus = 'disposed';
            message = 'Media has been disposed and drive returned';
            
            // Return the drive if one is associated
            if (request.selected_drive_id) {
              const returnResult = await this.returnDrive(request.selected_drive_id);
              if (!returnResult.success) {
                return { success: false, message: `Disposition completed but failed to return drive: ${returnResult.message}` };
              }
            }
          } else {
            return { success: false, message: 'Request must be completed before disposal' };
          }
          break;
          
        default:
          return { success: false, message: 'Invalid action specified' };
      }

      // Store disposition data if provided
      if (dispositionData && (action === 'dispose' || action === 'dispose_and_return_drive')) {
        const dispositionDate = dispositionData.dispositionDate ? 
          Math.floor(new Date(dispositionData.dispositionDate).getTime() / 1000) : 
          Math.floor(Date.now() / 1000);

        db.query(`
          UPDATE aft_requests 
          SET disposition_optical_destroyed = ?,
              disposition_optical_retained = ?,
              disposition_ssd_sanitized = ?,
              disposition_custodian_name = ?,
              disposition_date = ?,
              disposition_signature = ?,
              disposition_notes = ?,
              disposition_completed_at = ?,
              updated_at = unixepoch()
          WHERE id = ?
        `).run(
          dispositionData.opticalDestroyed || 'na',
          dispositionData.opticalRetained || 'na',
          dispositionData.ssdSanitized || 'na',
          dispositionData.custodianName,
          dispositionDate,
          dispositionData.digitalSignature,
          dispositionData.notes || '',
          Math.floor(Date.now() / 1000),
          requestId
        );
      }

      // Update request status using RequestTrackingService
      const success = RequestTrackingService.updateRequestStatus(
        requestId,
        userId,
        newStatus as any,
        notes
      );

      if (success) {
        return { 
          success: true, 
          message, 
          newStatus 
        };
      } else {
        return { 
          success: false, 
          message: 'Failed to update request status' 
        };
      }
      
    } catch (error) {
      console.error('Error processing request:', error);
      return { 
        success: false, 
        message: 'An error occurred while processing the request' 
      };
    }
  }
}

// API Handler Function
export async function handleMediaCustodianAPI(request: Request, path: string, ipAddress: string): Promise<Response | null> {
  const apiPath = path.startsWith('/media-custodian') ? path.substring('/media-custodian'.length) : path;
  // Media Drives API endpoints
  if (apiPath === '/api/drives' && request.method === 'GET') {
    try {
      const drives = await MediaCustodianAPI.getAllMediaDrives();
      return new Response(JSON.stringify(drives), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: 'Failed to fetch drives' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  if (apiPath === '/api/drives' && request.method === 'POST') {
    try {
      const driveData = await request.json();
      const newDrive = await MediaCustodianAPI.createMediaDrive(driveData as any);
      return new Response(JSON.stringify({ success: true, drive: newDrive }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: 'Failed to create drive' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  if (apiPath.startsWith('/api/drives/') && request.method === 'GET') {
    try {
      const pathParts = apiPath.split('/');
      if (pathParts.length < 4 || !pathParts[3]) return null;
      const driveId = parseInt(pathParts[3]);
      const drive = await MediaCustodianAPI.getMediaDriveById(driveId);
      if (drive) {
        return new Response(JSON.stringify(drive), {
          headers: { 'Content-Type': 'application/json' }
        });
      } else {
        return new Response(JSON.stringify({ error: 'Drive not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    } catch (error) {
      return new Response(JSON.stringify({ error: 'Failed to fetch drive' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  if (apiPath.startsWith('/api/drives/') && request.method === 'PUT') {
    try {
      const pathParts = apiPath.split('/');
      if (pathParts.length < 4 || !pathParts[3]) return null;
      const driveId = parseInt(pathParts[3]);
      const driveData = await request.json();
      const success = await MediaCustodianAPI.updateMediaDrive(driveId, driveData as any);
      
      if (success) {
        return new Response(JSON.stringify({ success: true }), {
          headers: { 'Content-Type': 'application/json' }
        });
      } else {
        return new Response(JSON.stringify({ error: 'Drive not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    } catch (error) {
      return new Response(JSON.stringify({ error: 'Failed to update drive' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  if (apiPath.startsWith('/api/drives/') && request.method === 'DELETE') {
    try {
      const pathParts = apiPath.split('/');
      if (pathParts.length < 4 || !pathParts[3]) return null;
      const driveId = parseInt(pathParts[3]);
      const success = await MediaCustodianAPI.deleteMediaDrive(driveId);
      
      if (success) {
        return new Response(JSON.stringify({ success: true }), {
          headers: { 'Content-Type': 'application/json' }
        });
      } else {
        return new Response(JSON.stringify({ error: 'Drive not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    } catch (error) {
      return new Response(JSON.stringify({ error: 'Failed to delete drive' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  if (apiPath.startsWith('/api/drives/') && apiPath.endsWith('/issue') && request.method === 'POST') {
    try {
      const pathParts = apiPath.split('/');
      if (pathParts.length < 4 || !pathParts[3]) return null;
      const driveId = parseInt(pathParts[3]);
      const requestBody = await request.json() as any;
      const userId = parseInt((requestBody.userId ?? requestBody.user_id) as string);
      const result = await MediaCustodianAPI.issueDrive(driveId, userId, requestBody.purpose);
      
      if (result.success) {
        return new Response(JSON.stringify({ success: true, message: result.message }), {
          headers: { 'Content-Type': 'application/json' }
        });
      } else {
        return new Response(JSON.stringify({ success: false, error: result.message }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    } catch (error) {
      return new Response(JSON.stringify({ error: 'Failed to issue drive' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  if (apiPath.startsWith('/api/drives/') && apiPath.endsWith('/return') && request.method === 'POST') {
    try {
      const pathParts = apiPath.split('/');
      if (pathParts.length < 4 || !pathParts[3]) return null;
      const driveId = parseInt(pathParts[3]);
      const result = await MediaCustodianAPI.returnDrive(driveId);
      
      return new Response(JSON.stringify(result), {
        status: result.success ? 200 : 400,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      return new Response(JSON.stringify({ success: false, message: 'Failed to return drive' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  if (apiPath === '/api/users' && request.method === 'GET') {
    try {
      const users = await MediaCustodianAPI.getAllUsers();
      return new Response(JSON.stringify(users), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: 'Failed to fetch users' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  // AFT Request processing endpoints
  if (apiPath === '/api/requests' && request.method === 'GET') {
    try {
      const url = new URL(request.url);
      const query = Object.fromEntries(url.searchParams);
      const requests = await MediaCustodianAPI.getAllRequests(query);
      return new Response(JSON.stringify(requests), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: 'Failed to fetch requests' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  // Process request with CAC signature
  if (apiPath.startsWith('/api/dispose-cac/') && request.method === 'POST') {
    const urlParts = apiPath.split('/');
    const requestId = parseInt(urlParts[3] || '');
    
    if (!requestId || isNaN(requestId)) {
      return new Response(JSON.stringify({ error: 'Invalid request ID' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    try {
      const body = await request.json() as any;
      const { signature, certificate, timestamp, algorithm, custodianName, dispositionDate, 
              opticalDestroyed, opticalRetained, ssdSanitized, notes } = body;
      
      // TODO: Implement CAC signature for media disposition
      // For now, just process as regular disposition
      const result = await MediaCustodianAPI.processRequest(
        requestId,
        'dispose',
        1, // TODO: Get actual user ID from auth
        notes,
        {
          custodianName,
          dispositionDate,
          digitalSignature: custodianName, // Use custodian name as signature for now
          opticalDestroyed,
          opticalRetained,
          ssdSanitized,
          notes
        }
      );
      
      return new Response(JSON.stringify(result), {
        status: result.success ? 200 : 400,
        headers: { 'Content-Type': 'application/json' }
      });
      
    } catch (error) {
      console.error('Error processing CAC disposition:', error);
      return new Response(JSON.stringify({ error: 'Failed to process disposition with CAC' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
  
  if (apiPath.startsWith('/api/requests/') && apiPath.includes('/process') && request.method === 'POST') {
    try {
      const pathParts = apiPath.split('/');
      if (pathParts.length < 4 || !pathParts[3]) return null;
      const requestId = parseInt(pathParts[3]);
      const requestBody = await request.json() as any;
      
      const result = await MediaCustodianAPI.processRequest(
        requestId,
        requestBody.action,
        requestBody.userId,
        requestBody.notes,
        requestBody // Pass the entire request body as disposition data
      );
      
      return new Response(JSON.stringify(result), {
        status: result.success ? 200 : 400,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: 'Failed to process request' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  // Check if drive can be returned (AFT request completed)
  if (apiPath.startsWith('/api/drives/') && apiPath.endsWith('/can-return') && request.method === 'GET') {
    try {
      const pathParts = apiPath.split('/');
      if (pathParts.length < 4 || !pathParts[3]) return null;
      const driveId = parseInt(pathParts[3]);
      
      const db = getDb();
      // Check if drive has any active AFT requests
      const activeRequest = db.query(`
        SELECT ar.id, ar.status 
        FROM aft_requests ar 
        WHERE ar.selected_drive_id = ? 
        AND ar.status NOT IN ('completed', 'disposed', 'rejected', 'cancelled')
        LIMIT 1
      `).get(driveId) as any;
      
      const canReturn = !activeRequest;
      const message = activeRequest 
        ? `Drive is associated with active AFT request #${activeRequest.id} (${activeRequest.status})`
        : 'Drive can be returned';
      
      return new Response(JSON.stringify({ 
        canReturn, 
        message,
        activeRequest: activeRequest || null 
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: 'Failed to check drive return status' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  // Return drive from AFT request
  if (apiPath === '/api/return-drive' && request.method === 'POST') {
    try {
      const requestBody = await request.json() as any;
      const { driveId, requestId, userId } = requestBody;
      
      if (!driveId || !requestId || !userId) {
        return new Response(JSON.stringify({ 
          success: false, 
          message: 'Missing required parameters: driveId, requestId, userId' 
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      const db = getDb();
      
      // Verify the request is completed or disposed
      const aftRequest = db.query(`
        SELECT id, status, request_number 
        FROM aft_requests 
        WHERE id = ? AND status IN ('completed', 'disposed')
      `).get(requestId) as any;
      
      if (!aftRequest) {
        return new Response(JSON.stringify({ 
          success: false, 
          message: 'Request not found or not in completed/disposed status' 
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      
      // Return the drive
      const result = await MediaCustodianAPI.returnDrive(driveId);
      
      if (result.success) {
        // Add audit entry for the drive return
        RequestTrackingService.addAuditEntry(
          requestId,
          userId,
          'drive_returned',
          undefined,
          undefined,
          JSON.stringify({ driveId, action: 'return_to_inventory' }),
          'Drive returned to inventory by media custodian'
        );
      }
      
      return new Response(JSON.stringify(result), {
        status: result.success ? 200 : 400,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      return new Response(JSON.stringify({ 
        success: false, 
        message: 'Failed to return drive to inventory' 
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }

  return null;
}
