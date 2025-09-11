// Request Review Page - Detailed view for approving/rejecting individual requests
import { ComponentBuilder, Templates } from "../components/ui/server-components";
import { ApproverNavigation, type ApproverUser } from "./approver-nav";
import { getDb } from "../lib/database-bun";
import { FileTextIcon, UserIcon, CalendarIcon, ShieldIcon, ServerIcon, CheckCircleIcon, XCircleIcon, AlertTriangleIcon, ClockIcon } from "../components/icons";

export class RequestReviewPage {
  static async render(user: ApproverUser, requestId: string): Promise<string> {
    const db = getDb();
    
    // Get request details with complete information
    const request = db.query(`
      SELECT 
        r.*, 
        u.email as requestor_email,
        u.first_name || ' ' || u.last_name as requestor_name,
        u.organization as requestor_org,
        u.phone as requestor_phone,
        du.first_name || ' ' || du.last_name as dta_name,
        du.email as dta_email,
        du.phone as dta_phone,
        md.serial_number as drive_serial,
        md.type as drive_type,
        md.model as drive_model,
        md.status as drive_status
      FROM aft_requests r
      LEFT JOIN users u ON r.requestor_id = u.id
      LEFT JOIN users du ON r.dta_id = du.id
      LEFT JOIN media_drives md ON r.selected_drive_id = md.id
      WHERE r.id = ?
    `).get(requestId) as any;

    if (!request) {
      return this.renderNotFound(user);
    }

    // Get request history
    const history = db.query(`
      SELECT * FROM aft_request_history 
      WHERE request_id = ? 
      ORDER BY created_at DESC
    `).all(requestId) as any[];

    const content = `
      <div class="space-y-6">
        <!-- Status Banner -->
        ${this.renderStatusBanner(request)}
        
        <!-- Main Content Grid -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <!-- Left Column - Request Details -->
          <div class="lg:col-span-2 space-y-6">
            ${this.renderRequestDetails(request)}
            ${this.renderDestinations(request)}
            ${this.renderFileInformation(request)}
            ${this.renderJustification(request)}
            ${this.renderHistory(history)}
          </div>
          
          <!-- Right Column - Actions & Info -->
          <div class="space-y-6">
            ${this.renderApprovalActions(request)}
            ${this.renderRequestorInfo(request)}
            ${this.renderMetadata(request)}
          </div>
        </div>
      </div>
    `;

    return ApproverNavigation.renderLayout(
      'Request Review',
      `Request #${request.request_number || requestId}`,
      user,
      '/approver/request',
      content
    );
  }

  private static renderStatusBanner(request: any): string {
    const statusConfig = {
      pending_approver: {
        icon: ClockIcon({ size: 20 }),
        text: 'Pending Approval',
        class: 'bg-[var(--warning)] border-[var(--warning)] text-[var(--warning-foreground)]'
      },
      pending_cpso: {
        icon: ClockIcon({ size: 20 }),
        text: 'Pending CPSO Review',
        class: 'bg-[var(--warning)] border-[var(--warning)] text-[var(--warning-foreground)]'
      },
      submitted: {
        icon: ClockIcon({ size: 20 }),
        text: 'Submitted - Pending Review',
        class: 'bg-[var(--info)] border-[var(--info)] text-[var(--info-foreground)]'
      },
      approved: {
        icon: CheckCircleIcon({ size: 20 }),
        text: 'Approved',
        class: 'bg-[var(--success)] border-[var(--success)] text-[var(--success-foreground)]'
      },
      rejected: {
        icon: XCircleIcon({ size: 20 }),
        text: 'Rejected',
        class: 'bg-[var(--destructive)] border-[var(--destructive)] text-[var(--destructive-foreground)]'
      }
    };

    const statusKey = (['pending_approver','pending_cpso','submitted','approved','rejected'] as const).includes(request.status)
      ? (request.status as 'pending_approver'|'pending_cpso'|'submitted'|'approved'|'rejected')
      : 'submitted';
    const config = statusConfig[statusKey];

    return `
      <div class="rounded-lg border-2 ${config.class} p-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            ${config.icon}
            <span class="font-semibold">${config.text}</span>
          </div>
          ${request.priority === 'urgent' ? `
            <span class="flex items-center gap-2 px-3 py-1 bg-[var(--destructive)] text-[var(--destructive-foreground)] rounded-full text-sm font-medium">
              ${AlertTriangleIcon({ size: 16 })}
              Urgent Request
            </span>
          ` : ''}
        </div>
      </div>
    `;
  }

  private static renderRequestDetails(request: any): string {
    return ComponentBuilder.card({
      children: `
        <div class="p-6 pb-4">
          <h3 class="text-lg font-semibold leading-none tracking-tight text-[var(--card-foreground)] flex items-center gap-2">
            ${FileTextIcon({ size: 20 })}
            Transfer Details
          </h3>
        </div>
        <div class="p-6 pt-0 space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="text-xs text-[var(--muted-foreground)] uppercase tracking-wide">Source System</label>
              <p class="text-base font-medium text-[var(--foreground)] flex items-center gap-2 mt-1">
                ${ServerIcon({ size: 16 })}
                ${request.source_system || 'Not specified'}
              </p>
            </div>
            <div>
              <label class="text-xs text-[var(--muted-foreground)] uppercase tracking-wide">Destination System</label>
              <p class="text-base font-medium text-[var(--foreground)] flex items-center gap-2 mt-1">
                ${ServerIcon({ size: 16 })}
                ${request.dest_system || 'Not specified'}
              </p>
            </div>
            <div>
              <label class="text-xs text-[var(--muted-foreground)] uppercase tracking-wide">Classification</label>
              <p class="text-base font-medium text-[var(--foreground)] flex items-center gap-2 mt-1">
                ${ShieldIcon({ size: 16 })}
                ${request.classification || 'UNCLASSIFIED'}
              </p>
            </div>
            <div>
              <label class="text-xs text-[var(--muted-foreground)] uppercase tracking-wide">Transfer Type</label>
              <p class="text-base font-medium text-[var(--foreground)]">${request.transfer_type || 'Standard'}</p>
            </div>
          </div>
        </div>
      `
    });
  }

  private static renderDestinations(request: any): string {
    // Parse transfer_data.destinations if present
    let destinations: any[] = [];
    try {
      const td = request.transfer_data ? JSON.parse(request.transfer_data) : null;
      destinations = Array.isArray(td?.destinations) ? td.destinations : [];
    } catch {}

    if (!request.dest_system && destinations.length === 0) return '';

    // Ensure primary appears first
    const list = [] as Array<{ is: string; classification?: string; primary?: boolean }>;
    if (request.dest_system) {
      list.push({ is: request.dest_system, classification: destinations[0]?.classification, primary: true });
    }
    // Add extras (skip first if it duplicates primary)
    const extras = request.dest_system ? destinations.slice(1) : destinations;
    extras.forEach((d: any) => list.push({ is: d?.is || '', classification: d?.classification || '' }));

    return ComponentBuilder.card({
      children: `
        <div class="p-6 pb-4">
          <h3 class="text-lg font-semibold leading-none tracking-tight text-[var(--card-foreground)] flex items-center gap-2">
            ${ServerIcon({ size: 18 })}
            Destination Systems
          </h3>
        </div>
        <div class="p-6 pt-0 space-y-2">
          ${list.map(d => `
            <div class="flex items-center justify-between p-3 bg-[var(--muted)] rounded">
              <div class="font-medium ${d.primary ? 'text-[var(--primary)]' : ''}">${d.is || '(unspecified)'}</div>
              <div class="text-xs text-[var(--muted-foreground)]">${d.classification || ''}</div>
            </div>
          `).join('')}
        </div>
      `
    });
  }

  private static renderFileInformation(request: any): string {
    let files: any[] = [];
    try {
      files = request.files_list ? JSON.parse(request.files_list) : [];
      if (!Array.isArray(files)) files = [];
    } catch { files = []; }

    return ComponentBuilder.card({
      children: `
        <div class="p-6 pb-4">
          <h3 class="text-lg font-semibold leading-none tracking-tight text-[var(--card-foreground)] flex items-center gap-2">
            ${FileTextIcon({ size: 20 })}
            Files to Transfer
          </h3>
        </div>
        <div class="p-6 pt-0 space-y-2">
          ${files.length > 0 ? files.map((file: any) => {
            const base = (file?.name || '').toString();
            const ext = (file?.type || '').toString().replace(/^\./, '');
            const fullName = base && ext ? `${base}.${ext}` : base || '(unnamed)';
            const size = (file?.size || '').toString().trim();
            const sizeDisplay = size ? size : 'Size not specified';
            const classification = file?.classification || 'No classification';
            return `
              <div class="flex items-center justify-between p-3 bg-[var(--muted)] rounded">
                <div>
                  <div class="font-medium">${fullName}</div>
                  <div class="text-xs text-[var(--muted-foreground)]">${sizeDisplay}</div>
                </div>
                <div class="text-sm text-[var(--muted-foreground)]">${classification}</div>
              </div>
            `;
          }).join('') : '<p class="text-[var(--muted-foreground)]">No files specified</p>'}
        </div>
      `
    });
  }

  private static renderJustification(request: any): string {
    return ComponentBuilder.card({
      children: `
        <div class="p-6 pb-4">
          <h3 class="text-lg font-semibold leading-none tracking-tight text-[var(--card-foreground)]">Business Justification</h3>
        </div>
        <div class="p-6 pt-0">
          <div class="text-sm text-[var(--foreground)] whitespace-pre-wrap">
            ${request.transfer_purpose || request.justification || 'No justification provided'}
          </div>
        </div>
      `
    });
  }

  private static renderHistory(history: any[]): string {
    if (!history || history.length === 0) {
      return '';
    }

    return ComponentBuilder.card({
      children: `
        <div class="p-6 pb-4">
          <h3 class="text-lg font-semibold leading-none tracking-tight text-[var(--card-foreground)]">Request History</h3>
        </div>
        <div class="p-6 pt-0 space-y-3">
          ${history.map(entry => `
            <div class="flex items-start gap-3 pb-3 border-b border-[var(--border)] last:border-0">
              <div class="w-2 h-2 rounded-full bg-[var(--primary)] mt-2"></div>
              <div class="flex-1">
                <div class="flex items-center gap-2 mb-1">
                  <span class="text-sm font-medium text-[var(--foreground)]">${entry.action}</span>
                  <span class="text-xs text-[var(--muted-foreground)]">${new Date(entry.created_at).toLocaleString()}</span>
                </div>
                ${entry.notes ? `<p class="text-sm text-[var(--muted-foreground)]">${entry.notes}</p>` : ''}
                <p class="text-xs text-[var(--muted-foreground)]">by ${entry.user_email}</p>
              </div>
            </div>
          `).join('')}
        </div>
      `
    });
  }

  private static renderApprovalActions(request: any): string {
    if (['approved', 'rejected', 'completed', 'cancelled'].includes(request.status)) {
      return ComponentBuilder.card({
        children: `
          <div class="p-6 pb-0">
            <h3 class="text-lg font-semibold leading-none tracking-tight text-[var(--card-foreground)]">Actions</h3>
          </div>
          <div class="text-center py-4">
            <p class="text-sm text-[var(--muted-foreground)] mb-4">
              This request has already been ${request.status === 'approved' ? 'approved' : request.status}.
            </p>
            ${ComponentBuilder.button({
              children: 'Back to Pending',
              onClick: 'window.location.href=\'/approver/pending\'',
              variant: 'secondary',
              className: 'w-full'
            })}
          </div>
        `
      });
    }

    return ComponentBuilder.card({
      children: `
        <div class="p-6 pb-0">
          <h3 class="text-lg font-semibold leading-none tracking-tight text-[var(--card-foreground)]">Approval Actions</h3>
        </div>
        <div class="p-6 pt-4 space-y-4">
          <div>
            <label class="text-sm font-medium text-[var(--foreground)] mb-2 block">Decision</label>
            <div class="space-y-2">
              ${ComponentBuilder.primaryButton({
                children: `${CheckCircleIcon({ size: 16 })} Approve Request`,
                onClick: `approveRequest(${request.id})`,
                className: 'w-full justify-center'
              })}
              ${ComponentBuilder.destructiveButton({
                children: `${XCircleIcon({ size: 16 })} Reject Request`,
                onClick: `showRejectDialog(${request.id})`,
                className: 'w-full justify-center'
              })}
            </div>
          </div>
          
          <div>
            <label for="approval-notes" class="text-sm font-medium text-[var(--foreground)] mb-2 block">
              Notes (Optional)
            </label>
            <textarea
              id="approval-notes"
              rows="4"
              class="w-full px-3 py-2 bg-[var(--background)] border border-[var(--border)] rounded-md text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
              placeholder="Add any notes about your decision..."
            ></textarea>
          </div>
        </div>
      `
    });
  }

  private static renderRequestorInfo(request: any): string {
    return ComponentBuilder.card({
      children: `
        <div class="p-6 pb-4">
          <h3 class="text-lg font-semibold leading-none tracking-tight text-[var(--card-foreground)]">Requestor Information</h3>
        </div>
        <div class="p-6 pt-0 space-y-4">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-full bg-[var(--muted)] flex items-center justify-center">
              ${UserIcon({ size: 20 })}
            </div>
            <div>
              <p class="text-sm font-medium text-[var(--foreground)]">${request.requestor_name || 'Unknown'}</p>
              <p class="text-xs text-[var(--muted-foreground)]">${request.requestor_email}</p>
            </div>
          </div>
          ${request.requestor_org ? `
            <div>
              <label class="text-xs text-[var(--muted-foreground)] uppercase tracking-wide">Organization</label>
              <p class="text-sm text-[var(--foreground)] mt-1">${request.requestor_org}</p>
            </div>
          ` : ''}
          ${request.dta_name ? `
            <div class="border-t border-[var(--border)] pt-4">
              <label class="text-xs text-[var(--muted-foreground)] uppercase tracking-wide">Assigned DTA</label>
              <div class="flex items-center gap-3 mt-2">
                <div class="w-8 h-8 rounded-full bg-[var(--primary)] text-[var(--primary-foreground)] flex items-center justify-center text-xs font-medium">
                  ${request.dta_name.split(' ').map((n: string) => n[0]).join('')}
                </div>
                <div>
                  <p class="text-sm font-medium text-[var(--foreground)]">${request.dta_name}</p>
                  <p class="text-xs text-[var(--muted-foreground)]">${request.dta_email || 'No email available'}</p>
                </div>
              </div>
              ${request.drive_serial ? `
                <div class="mt-3 p-3 bg-[var(--muted)] rounded-md">
                  <label class="text-xs text-[var(--muted-foreground)] uppercase tracking-wide">Assigned Drive</label>
                  <p class="text-sm font-medium text-[var(--foreground)] mt-1">${request.drive_serial}</p>
                  <p class="text-xs text-[var(--muted-foreground)]">${request.drive_type} ${request.drive_model} - ${request.drive_status}</p>
                </div>
              ` : ''}
            </div>
          ` : `
            <div class="border-t border-[var(--border)] pt-4">
              <p class="text-sm text-[var(--muted-foreground)]">No DTA assigned yet</p>
            </div>
          `}
        </div>
      `
    });
  }

  private static renderMetadata(request: any): string {
    return ComponentBuilder.card({
      children: `
        <div class="p-6 pb-4">
          <h3 class="text-lg font-semibold leading-none tracking-tight text-[var(--card-foreground)]">Request Metadata</h3>
        </div>
        <div class="p-6 pt-0 space-y-3">
          <div>
            <label class="text-xs text-[var(--muted-foreground)] uppercase tracking-wide">Request ID</label>
            <p class="text-sm font-mono text-[var(--foreground)] mt-1">#${request.id}</p>
          </div>
          <div>
            <label class="text-xs text-[var(--muted-foreground)] uppercase tracking-wide">Created</label>
            <p class="text-sm text-[var(--foreground)] mt-1 flex items-center gap-2">
              ${CalendarIcon({ size: 14 })}
              ${new Date(request.created_at).toLocaleString()}
            </p>
          </div>
          ${request.updated_at ? `
            <div>
              <label class="text-xs text-[var(--muted-foreground)] uppercase tracking-wide">Last Updated</label>
              <p class="text-sm text-[var(--foreground)] mt-1">${new Date(request.updated_at).toLocaleString()}</p>
            </div>
          ` : ''}
        </div>
      `
    });
  }

  private static renderNotFound(user: ApproverUser): string {
    const content = `
      <div class="bg-[var(--card)] rounded-lg border border-[var(--border)] p-12 text-center">
        <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[var(--muted)] mb-4">
          ${AlertTriangleIcon({ size: 32, color: 'var(--destructive)' })}
        </div>
        <h3 class="text-xl font-semibold text-[var(--foreground)] mb-2">Request Not Found</h3>
        <p class="text-[var(--muted-foreground)] mb-6">The requested AFT request could not be found.</p>
        ${ComponentBuilder.primaryButton({
          children: 'Back to Pending Requests',
          onClick: 'window.location.href=\'/approver/pending\''
        })}
      </div>
    `;

    return ApproverNavigation.renderLayout(
      'Request Not Found',
      '',
      user,
      '/approver/request',
      content
    );
  }

  static getScript(): string {
    return `
      function approveRequest(requestId) {
        const notes = document.getElementById('approval-notes').value;
        
        if (confirm('Are you sure you want to approve this request?')) {
          fetch('/api/approver/approve/' + requestId, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ notes })
          })
          .then(response => response.json())
          .then(data => {
            if (data.success) {
              alert('Request approved successfully!');
              window.location.href = '/approver/pending';
            } else {
              alert('Error approving request: ' + data.error);
            }
          });
        }
      }
      
      function showRejectDialog(requestId) {
        const reason = prompt('Please provide a reason for rejection:');
        
        if (reason) {
          const notes = document.getElementById('approval-notes').value;
          
          fetch('/api/approver/reject/' + requestId, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason, notes })
          })
          .then(response => response.json())
          .then(data => {
            if (data.success) {
              alert('Request rejected successfully.');
              window.location.href = '/approver/pending';
            } else {
              alert('Error rejecting request: ' + data.error);
            }
          });
        }
      }
    `;
  }
}