// Request Review Page - Detailed view for approving/rejecting individual requests
import { ComponentBuilder, Templates } from "../components/ui/server-components";
import { ApproverNavigation, type ApproverUser } from "./approver-nav";
import { getDb } from "../lib/database-bun";
import { FileTextIcon, UserIcon, CalendarIcon, ShieldIcon, ServerIcon, CheckCircleIcon, XCircleIcon, AlertTriangleIcon, ClockIcon } from "../components/icons";

export class RequestReviewPage {
  static async render(user: ApproverUser, requestId: string): Promise<string> {
    const db = getDb();
    
    // Get request details
    const request = db.query(`
      SELECT 
        r.*,
        u.email as requestor_email,
        u.first_name || ' ' || u.last_name as requestor_name,
        u.organization as requestor_org
      FROM aft_requests r
      LEFT JOIN users u ON r.requestor_id = u.id
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

    return `
      ${ApproverNavigation.renderPageHeader('Request Review', `Request #${requestId}`, user, '/approver/request')}
      
      <div class="max-w-7xl mx-auto px-3 sm:px-5 lg:px-6 py-6">
        <div class="space-y-6">
          <!-- Status Banner -->
          ${this.renderStatusBanner(request)}
          
          <!-- Main Content Grid -->
          <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <!-- Left Column - Request Details -->
            <div class="lg:col-span-2 space-y-6">
              ${this.renderRequestDetails(request)}
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
      </div>
    `;
  }

  private static renderStatusBanner(request: any): string {
    const statusConfig = {
      pending_approval: {
        icon: ClockIcon({ size: 20 }),
        text: 'Pending Approval',
        class: 'bg-yellow-50 border-yellow-200 text-yellow-800'
      },
      approved: {
        icon: CheckCircleIcon({ size: 20 }),
        text: 'Approved',
        class: 'bg-green-50 border-green-200 text-green-800'
      },
      rejected: {
        icon: XCircleIcon({ size: 20 }),
        text: 'Rejected',
        class: 'bg-red-50 border-red-200 text-red-800'
      }
    };

    const config = statusConfig[request.status] || statusConfig.pending_approval;

    return `
      <div class="rounded-lg border-2 ${config.class} p-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            ${config.icon}
            <span class="font-semibold">${config.text}</span>
          </div>
          ${request.priority === 'urgent' ? `
            <span class="flex items-center gap-2 px-3 py-1 bg-red-100 text-red-800 rounded-full text-sm font-medium">
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
      title: `${FileTextIcon({ size: 20 })} Transfer Details`,
      children: `
        <div class="space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="text-xs text-[var(--muted-foreground)] uppercase tracking-wide">Source System</label>
              <p class="text-base font-medium text-[var(--foreground)] flex items-center gap-2 mt-1">
                ${ServerIcon({ size: 16 })}
                ${request.source_system}
              </p>
            </div>
            <div>
              <label class="text-xs text-[var(--muted-foreground)] uppercase tracking-wide">Destination System</label>
              <p class="text-base font-medium text-[var(--foreground)] flex items-center gap-2 mt-1">
                ${ServerIcon({ size: 16 })}
                ${request.destination_system}
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
          
          ${request.description ? `
            <div>
              <label class="text-xs text-[var(--muted-foreground)] uppercase tracking-wide">Description</label>
              <p class="text-sm text-[var(--foreground)] mt-1">${request.description}</p>
            </div>
          ` : ''}
        </div>
      `
    });
  }

  private static renderFileInformation(request: any): string {
    return ComponentBuilder.card({
      title: `${FileTextIcon({ size: 20 })} File Information`,
      children: `
        <div class="space-y-3">
          <div>
            <label class="text-xs text-[var(--muted-foreground)] uppercase tracking-wide">File Name</label>
            <p class="text-sm font-mono text-[var(--foreground)] mt-1">${request.file_name || 'Not specified'}</p>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="text-xs text-[var(--muted-foreground)] uppercase tracking-wide">File Size</label>
              <p class="text-sm text-[var(--foreground)] mt-1">${request.file_size || 'Unknown'}</p>
            </div>
            <div>
              <label class="text-xs text-[var(--muted-foreground)] uppercase tracking-wide">File Type</label>
              <p class="text-sm text-[var(--foreground)] mt-1">${request.file_type || 'Unknown'}</p>
            </div>
          </div>
          ${request.file_hash ? `
            <div>
              <label class="text-xs text-[var(--muted-foreground)] uppercase tracking-wide">File Hash</label>
              <p class="text-xs font-mono text-[var(--foreground)] mt-1 break-all">${request.file_hash}</p>
            </div>
          ` : ''}
        </div>
      `
    });
  }

  private static renderJustification(request: any): string {
    return ComponentBuilder.card({
      title: 'Business Justification',
      children: `
        <div class="prose prose-sm max-w-none text-[var(--foreground)]">
          ${request.justification || '<p class="text-[var(--muted-foreground)]">No justification provided</p>'}
        </div>
      `
    });
  }

  private static renderHistory(history: any[]): string {
    if (!history || history.length === 0) {
      return '';
    }

    return ComponentBuilder.card({
      title: 'Request History',
      children: `
        <div class="space-y-3">
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
    if (request.status !== 'pending_approval') {
      return ComponentBuilder.card({
        title: 'Actions',
        children: `
          <div class="text-center py-4">
            <p class="text-sm text-[var(--muted-foreground)] mb-4">
              This request has already been ${request.status === 'approved' ? 'approved' : 'rejected'}.
            </p>
            ${ComponentBuilder.button({
              children: 'Back to Pending',
              onClick: 'window.location.href=\'/approver/pending\'',
              variant: 'outline',
              className: 'w-full'
            })}
          </div>
        `
      });
    }

    return ComponentBuilder.card({
      title: 'Approval Actions',
      children: `
        <div class="space-y-4">
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
      title: 'Requestor Information',
      children: `
        <div class="space-y-3">
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
        </div>
      `
    });
  }

  private static renderMetadata(request: any): string {
    return ComponentBuilder.card({
      title: 'Request Metadata',
      children: `
        <div class="space-y-3">
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
    return `
      ${ApproverNavigation.renderPageHeader('Request Not Found', '', user, '/approver/request')}
      
      <div class="max-w-7xl mx-auto px-3 sm:px-5 lg:px-6 py-6">
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
      </div>
    `;
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