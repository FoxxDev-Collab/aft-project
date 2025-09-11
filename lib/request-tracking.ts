// AFT Request Tracking and Timeline Service
// Handles request status tracking, audit trails, and timeline generation

import { getDb, AFTStatus, AFT_STATUS_LABELS, type AFTStatusType } from './database-bun';
import type { TimelineStep } from '../components/ui/timeline';

export interface RequestAuditEntry {
  id: number;
  request_id: number;
  user_id: number;
  action: string;
  old_status?: string;
  new_status?: string;
  changes?: string;
  notes?: string;
  created_at: number;
  user_name?: string;
  user_role?: string;
}

export interface RequestTimelineData {
  request_id: number;
  current_status: AFTStatusType;
  timeline_steps: TimelineStep[];
  audit_entries: RequestAuditEntry[];
  estimated_completion?: number;
  actual_completion?: number;
}

export class RequestTrackingService {
  
  // Get complete timeline data for a request
  static getRequestTimeline(requestId: number): RequestTimelineData | null {
    const db = getDb();
    
    // Get request basic info including transfer_type for conditional flow
    const request = db.query(`
      SELECT id, status, created_at, updated_at, requestor_name, 
             approval_date, actual_start_date, actual_end_date, transfer_type
      FROM aft_requests 
      WHERE id = ?
    `).get(requestId) as any;
    
    if (!request) return null;
    
    // Get audit trail
    const auditEntries = db.query(`
      SELECT 
        al.id, al.request_id, al.user_id, al.action, al.old_status, 
        al.new_status, al.changes, al.notes, al.created_at,
        u.first_name || ' ' || u.last_name as user_name,
        u.primary_role as user_role
      FROM aft_audit_log al
      LEFT JOIN users u ON al.user_id = u.id
      WHERE al.request_id = ?
      ORDER BY al.created_at ASC
    `).all(requestId) as RequestAuditEntry[];
    
    // Generate timeline steps
    const timelineSteps = this.generateTimelineSteps(request, auditEntries);
    
    return {
      request_id: requestId,
      current_status: request.status,
      timeline_steps: timelineSteps,
      audit_entries: auditEntries,
      estimated_completion: this.estimateCompletion(request.status),
      actual_completion: request.actual_end_date
    };
  }
  
  // Generate timeline steps from request data and audit entries
  private static generateTimelineSteps(request: any, auditEntries: RequestAuditEntry[]): TimelineStep[] {
    const statusFlow = this.getStatusFlow(request.status, request.transfer_type);
    const statusEvents = new Map<AFTStatusType, RequestAuditEntry>();

    // The first audit entry for a request is its creation, which we map to the DRAFT status.
    if (auditEntries.length > 0) {
        statusEvents.set(AFTStatus.DRAFT, auditEntries[0]!);
    }

    // Map subsequent status changes to their respective events.
    for (const entry of auditEntries) {
        if (entry.action === 'status_change' && entry.new_status) {
            statusEvents.set(entry.new_status as AFTStatusType, entry);
        }
    }

    const currentStatusIndex = statusFlow.indexOf(request.status as AFTStatusType);

    return statusFlow.map((status, index) => {
        const event = statusEvents.get(status);
        let stepStatus: TimelineStep['status'];

        if (index < currentStatusIndex) {
            stepStatus = 'completed';
        } else if (index === currentStatusIndex) {
            stepStatus = 'current';
        } else {
            stepStatus = 'pending';
        }

        if (request.status === AFTStatus.REJECTED || request.status === AFTStatus.CANCELLED) {
            if (status === request.status) {
                stepStatus = 'error';
            } else if (index > currentStatusIndex) {
                stepStatus = 'skipped';
            }
        }

        return {
            id: status,
            title: AFT_STATUS_LABELS[status] || status,
            description: this.getStatusDescription(status),
            status: stepStatus,
            timestamp: event?.created_at,
            assignedTo: event?.user_name || this.getDefaultAssignee(status),
            notes: event?.notes,
            duration: this.calculateStepDuration(status, auditEntries, request)
        };
    });
}
  
  // Get the expected status flow for a request type
  private static getStatusFlow(requestStatus: AFTStatusType, transferType?: string): AFTStatusType[] {
    const highToLowFlow: AFTStatusType[] = [
      AFTStatus.DRAFT,
      AFTStatus.SUBMITTED,
      AFTStatus.PENDING_DAO,
      AFTStatus.PENDING_APPROVER,
      AFTStatus.PENDING_CPSO,
      AFTStatus.APPROVED,
      AFTStatus.PENDING_DTA,
      AFTStatus.ACTIVE_TRANSFER,
      AFTStatus.PENDING_SME_SIGNATURE,
      AFTStatus.COMPLETED,
      AFTStatus.PENDING_MEDIA_CUSTODIAN,
      AFTStatus.DISPOSED
    ];

    const standardFlow: AFTStatusType[] = [
      AFTStatus.DRAFT,
      AFTStatus.SUBMITTED,
      AFTStatus.PENDING_APPROVER,
      AFTStatus.PENDING_CPSO,
      AFTStatus.APPROVED,
      AFTStatus.PENDING_DTA,
      AFTStatus.ACTIVE_TRANSFER,
      AFTStatus.PENDING_SME_SIGNATURE,
      AFTStatus.COMPLETED,
      AFTStatus.PENDING_MEDIA_CUSTODIAN,
      AFTStatus.DISPOSED
    ];

    let flow = (transferType === 'high_to_low') ? highToLowFlow : standardFlow;

    // If a terminal status is reached, adjust the flow to show the final state correctly
    if (requestStatus === AFTStatus.REJECTED || requestStatus === AFTStatus.CANCELLED) {
        const lastCompletedStepIndex = flow.indexOf(requestStatus) > -1 ? flow.indexOf(requestStatus) : highToLowFlow.indexOf(requestStatus);
        if(lastCompletedStepIndex > -1) {
            return [...flow.slice(0, lastCompletedStepIndex), requestStatus];
        }
    }

    return flow;
}
  
  // Check if a status has been completed
  private static isStatusCompleted(status: AFTStatusType, currentStatus: AFTStatusType, transferType?: string): boolean {
    const flow = this.getStatusFlow(currentStatus, transferType);
    const statusIndex = flow.indexOf(status);
    const currentIndex = flow.indexOf(currentStatus);
    
    return statusIndex >= 0 && currentIndex >= 0 && statusIndex < currentIndex;
  }
  
  // Check if a status is pending (future)
  private static isStatusPending(status: AFTStatusType, currentStatus: AFTStatusType, transferType?: string): boolean {
    const flow = this.getStatusFlow(currentStatus, transferType);
    const statusIndex = flow.indexOf(status);
    const currentIndex = flow.indexOf(currentStatus);
    
    return statusIndex >= 0 && currentIndex >= 0 && statusIndex > currentIndex;
  }
  
  // Get description for each status
  private static getStatusDescription(status: string): string {
    const descriptions: Record<string, string> = {
      [AFTStatus.DRAFT]: 'Request is being prepared by the requestor',
      [AFTStatus.SUBMITTED]: 'Request has been submitted for review',
      [AFTStatus.PENDING_DAO]: 'Awaiting review by Designated Authorizing Official',
      [AFTStatus.PENDING_APPROVER]: 'Awaiting security review by ISSM',
      [AFTStatus.PENDING_CPSO]: 'Awaiting contractor security review',
      [AFTStatus.APPROVED]: 'Request has been approved for transfer',
      [AFTStatus.REJECTED]: 'Request has been rejected',
      [AFTStatus.PENDING_DTA]: 'Awaiting Data Transfer Agent assignment',
      [AFTStatus.ACTIVE_TRANSFER]: 'Data transfer is in progress',
      [AFTStatus.PENDING_SME_SIGNATURE]: 'Awaiting SME digital signature',
      [AFTStatus.PENDING_SME]: 'Awaiting Subject Matter Expert review',
      [AFTStatus.PENDING_MEDIA_CUSTODIAN]: 'Awaiting media disposition',
      [AFTStatus.COMPLETED]: 'Transfer completed successfully',
      [AFTStatus.DISPOSED]: 'Media has been properly disposed',
      [AFTStatus.CANCELLED]: 'Request has been cancelled'
    };
    
    return descriptions[status] || 'Status update';
  }
  
  // Get default assignee for each status
  private static getDefaultAssignee(status: string): string {
    const assignees: Record<string, string> = {
      [AFTStatus.DRAFT]: 'Requestor',
      [AFTStatus.SUBMITTED]: 'System',
      [AFTStatus.PENDING_DAO]: 'DAO Team',
      [AFTStatus.PENDING_APPROVER]: 'ISSM Team',
      [AFTStatus.PENDING_CPSO]: 'CPSO Team',
      [AFTStatus.APPROVED]: 'System',
      [AFTStatus.PENDING_DTA]: 'DTA Team',
      [AFTStatus.ACTIVE_TRANSFER]: 'Assigned DTA',
      [AFTStatus.PENDING_SME_SIGNATURE]: 'SME Team',
      [AFTStatus.PENDING_SME]: 'SME Team',
      [AFTStatus.PENDING_MEDIA_CUSTODIAN]: 'Media Custodian',
      [AFTStatus.COMPLETED]: 'System',
      [AFTStatus.DISPOSED]: 'Media Custodian'
    };
    
    return assignees[status] || 'System';
  }
  
  // Calculate duration for a step
  private static calculateStepDuration(
    status: string, 
    auditEntries: RequestAuditEntry[], 
    request: any
  ): number | undefined {
    const statusEntry = auditEntries.find(e => e.new_status === status);
    if (!statusEntry) return undefined;
    
    // Find the next status change after this one
    const nextEntry = auditEntries.find(e => 
      e.created_at > statusEntry.created_at && e.action === 'status_change'
    );
    
    if (nextEntry) {
      const durationMs = (nextEntry.created_at - statusEntry.created_at) * 1000;
      return durationMs / (1000 * 60 * 60); // Convert to hours
    }
    
    // If this is the current status, calculate time since status change
    if (status === request.status) {
      const now = Date.now() / 1000;
      const durationMs = (now - statusEntry.created_at) * 1000;
      return durationMs / (1000 * 60 * 60);
    }
    
    return undefined;
  }
  
  // Estimate completion time based on current status
  private static estimateCompletion(currentStatus: AFTStatusType): number | undefined {
    // Average processing times in hours for each status
    const averageTimes: Record<string, number> = {
      [AFTStatus.DRAFT]: 24,
      [AFTStatus.SUBMITTED]: 2,
      [AFTStatus.PENDING_DAO]: 48,
      [AFTStatus.PENDING_APPROVER]: 72,
      [AFTStatus.PENDING_CPSO]: 48,
      [AFTStatus.APPROVED]: 1,
      [AFTStatus.PENDING_DTA]: 24,
      [AFTStatus.ACTIVE_TRANSFER]: 168, // 1 week
      [AFTStatus.PENDING_SME_SIGNATURE]: 24,
      [AFTStatus.PENDING_SME]: 48,
      [AFTStatus.PENDING_MEDIA_CUSTODIAN]: 72,
      [AFTStatus.COMPLETED]: 0,
      [AFTStatus.DISPOSED]: 0
    };
    
    const flow = this.getStatusFlow(currentStatus as AFTStatusType);
    const currentIndex = flow.indexOf(currentStatus);
    
    if (currentIndex < 0) return undefined;
    
    // Sum remaining times
    let totalHours = 0;
    for (let i = currentIndex; i < flow.length; i++) {
      const status = flow[i];
      if (status) {
        totalHours += averageTimes[status] || 0;
      }
    }
    
    const now = Date.now();
    return Math.floor((now + (totalHours * 60 * 60 * 1000)) / 1000);
  }
  
  // Add audit entry for request changes
  static addAuditEntry(
    requestId: number,
    userId: number,
    action: string,
    oldStatus?: string,
    newStatus?: string,
    changes?: string,
    notes?: string
  ): void {
    const db = getDb();
    
    db.query(`
      INSERT INTO aft_audit_log (
        request_id, user_id, action, old_status, new_status, changes, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(requestId, userId, action, oldStatus || null, newStatus || null, changes || null, notes || null);
    
    // Update request updated_at timestamp
    db.query(`
      UPDATE aft_requests 
      SET updated_at = unixepoch() 
      WHERE id = ?
    `).run(requestId);
  }
  
  // Update request status with audit trail
  static updateRequestStatus(
    requestId: number,
    userId: number,
    newStatus: AFTStatusType,
    notes?: string
  ): boolean {
    const db = getDb();
    
    try {
      // Get current status
      const request = db.query('SELECT status FROM aft_requests WHERE id = ?').get(requestId) as any;
      if (!request) return false;
      
      const oldStatus = request.status;
      
      // Update status
      db.query(`
        UPDATE aft_requests 
        SET status = ?, updated_at = unixepoch() 
        WHERE id = ?
      `).run(newStatus, requestId);
      
      // Add audit entry
      this.addAuditEntry(
        requestId,
        userId,
        'status_change',
        oldStatus,
        newStatus,
        JSON.stringify({ from: oldStatus, to: newStatus }),
        notes
      );
      
      return true;
    } catch (error) {
      console.error('Failed to update request status:', error);
      return false;
    }
  }
  
  // Get requests with timeline summary for table display
  static getRequestsWithTimeline(
    filters?: {
      status?: string;
      requestor_id?: number;
      dta_id?: number;
      limit?: number;
      offset?: number;
    }
  ): Array<any> {
    const db = getDb();
    
    let query = `
      SELECT 
        r.id, r.request_number, r.requestor_name, r.status, r.created_at, 
        r.updated_at, r.transfer_type, r.classification,
        COUNT(al.id) as audit_count,
        MAX(al.created_at) as last_activity
      FROM aft_requests r
      LEFT JOIN aft_audit_log al ON r.id = al.request_id
    `;
    
    const conditions: string[] = [];
    const params: any[] = [];
    
    if (filters?.status) {
      conditions.push('r.status = ?');
      params.push(filters.status);
    }
    
    if (filters?.requestor_id) {
      conditions.push('r.requestor_id = ?');
      params.push(filters.requestor_id);
    }
    
    if (filters?.dta_id) {
      conditions.push('r.dta_id = ?');
      params.push(filters.dta_id);
    }
    
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    
    query += `
      GROUP BY r.id, r.request_number, r.requestor_name, r.status, 
               r.created_at, r.updated_at, r.transfer_type, r.classification
      ORDER BY r.updated_at DESC
    `;
    
    if (filters?.limit) {
      query += ` LIMIT ${filters.limit}`;
      if (filters?.offset) {
        query += ` OFFSET ${filters.offset}`;
      }
    }
    
    const requests = db.query(query).all(...params) as any[];
    
    // Add timeline progress for each request
    return requests.map(request => {
      const flow = this.getStatusFlow(request.status);
      const currentIndex = flow.indexOf(request.status);
      const progress = currentIndex >= 0 ? Math.round(((currentIndex + 1) / flow.length) * 100) : 0;
      
      return {
        ...request,
        timeline_progress: progress,
        total_steps: flow.length,
        current_step: currentIndex + 1,
        is_terminal: [AFTStatus.COMPLETED, AFTStatus.DISPOSED, AFTStatus.REJECTED, AFTStatus.CANCELLED].includes(request.status)
      };
    });
  }
}
