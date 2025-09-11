// Request Review Page - Detailed view for approving/rejecting individual requests
import { ComponentBuilder, Templates } from "../components/ui/server-components";
import { DTANavigation, type DTAUser } from "./dta-nav";
import { getDb } from "../lib/database-bun";
import { FileTextIcon, UserIcon, CalendarIcon, ShieldIcon, ServerIcon, CheckCircleIcon, XCircleIcon, AlertTriangleIcon, ClockIcon } from "../components/icons";

export class DTARequestReviewPage {
  static async render(user: DTAUser, requestId: string, userId: number): Promise<string> {
    const db = getDb();
    
    // Get request details
    const request = db.query(`
      SELECT 
        r.*, 
        u.email as requestor_email,
        u.first_name || ' ' || u.last_name as requestor_name,
        u.organization as requestor_org,
        du.first_name || ' ' || du.last_name as dta_name
      FROM aft_requests r
      LEFT JOIN users u ON r.requestor_id = u.id
      LEFT JOIN users du ON r.dta_id = du.id
      WHERE r.id = ? AND r.dta_id = ?
    `).get(requestId, userId) as any;

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
            ${this.renderDTAActions(request)}
            ${this.renderRequestorInfo(request)}
            ${this.renderMetadata(request)}
          </div>
        </div>
      </div>
    `;

    return DTANavigation.renderLayout(
      'Request Review',
      `Request #${request.request_number || requestId}`,
      user,
      '/dta/request',
      content
    );
  }

  private static renderStatusBanner(request: any): string {
    const statusConfig = {
      pending_dta: {
        icon: ClockIcon({ size: 20 }),
        text: 'Pending DTA Action',
        class: 'bg-[var(--warning)] border-[var(--warning)] text-[var(--warning-foreground)]'
      },
      active_transfer: {
        icon: ClockIcon({ size: 20 }),
        text: 'Active Transfer - Section 4',
        class: 'bg-[var(--info)] border-[var(--info)] text-[var(--info-foreground)]'
      },
      pending_sme_signature: {
        icon: CheckCircleIcon({ size: 20 }),
        text: 'Pending SME Signature',
        class: 'bg-[var(--success)] border-[var(--success)] text-[var(--success-foreground)]'
      },
      completed: {
        icon: CheckCircleIcon({ size: 20 }),
        text: 'Transfer Complete',
        class: 'bg-[var(--success)] border-[var(--success)] text-[var(--success-foreground)]'
      },
      cancelled: {
        icon: XCircleIcon({ size: 20 }),
        text: 'Transfer Cancelled',
        class: 'bg-[var(--destructive)] border-[var(--destructive)] text-[var(--destructive-foreground)]'
      }
    };

    const statusKey = (['pending_dta','active_transfer','pending_sme_signature','completed','cancelled'] as const).includes(request.status)
      ? (request.status as 'pending_dta'|'active_transfer'|'pending_sme_signature'|'completed'|'cancelled')
      : 'pending_dta';
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
                ${request.source_system}
              </p>
            </div>
            <div>
              <label class="text-xs text-[var(--muted-foreground)] uppercase tracking-wide">Destination System</label>
              <p class="text-base font-medium text-[var(--foreground)] flex items-center gap-2 mt-1">
                ${ServerIcon({ size: 16 })}
                ${request.dest_system || 'Not specified'}
              </p>
            </div>
            ${request.dta_name ? `
            <div class="col-span-2">
              <label class="text-xs text-[var(--muted-foreground)] uppercase tracking-wide">Assigned DTA</label>
              <p class="text-sm text-[var(--foreground)] mt-1">${request.dta_name}</p>
            </div>
            ` : ''}
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
          
          ${(request.data_description || request.description) ? `
            <div>
              <label class="text-xs text-[var(--muted-foreground)] uppercase tracking-wide">Description</label>
              <p class="text-sm text-[var(--foreground)] mt-1">${request.data_description || request.description}</p>
            </div>
          ` : ''}
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
        <div class="p-6 pt-0 prose prose-sm max-w-none text-[var(--foreground)]">
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

  private static renderDTAActions(request: any): string {
    if (['completed', 'cancelled', 'pending_sme_signature'].includes(request.status)) {
      return ComponentBuilder.card({
        children: `
          <div class="p-6 pb-0">
            <h3 class="text-lg font-semibold leading-none tracking-tight text-[var(--card-foreground)]">Actions</h3>
          </div>
          <div class="text-center py-4">
            <p class="text-sm text-[var(--muted-foreground)] mb-4">
              ${request.status === 'completed' ? 'This transfer has been completed.' : 
                request.status === 'cancelled' ? 'This transfer was cancelled.' :
                'This request is awaiting SME signature.'}
            </p>
            ${ComponentBuilder.button({
              children: 'Back to Requests',
              onClick: 'window.location.href=\'/dta/requests\'',
              variant: 'secondary',
              className: 'w-full'
            })}
          </div>
        `
      });
    }

    if (request.status === 'active_transfer') {
      return ComponentBuilder.card({
        children: `
          <div class="p-6 pb-0">
            <h3 class="text-lg font-semibold leading-none tracking-tight text-[var(--card-foreground)]">Transfer Management</h3>
          </div>
          <div class="p-6 pt-4 space-y-4">
            <div class="bg-[var(--info)]/10 border border-[var(--info)]/20 p-4 rounded-lg">
              <p class="text-sm text-[var(--foreground)] mb-2">Active transfer in progress. Section 4 procedures in effect.</p>
              <p class="text-xs text-[var(--muted-foreground)]">Conduct AV scans, complete transfer, and sign off.</p>
            </div>
            ${ComponentBuilder.primaryButton({
              children: 'Manage Transfer',
              onClick: `manageTransfer(${request.id})`,
              className: 'w-full justify-center'
            })}
          </div>
        `
      });
    }

    // pending_dta status
    return ComponentBuilder.card({
      children: `
        <div class="p-6 pb-0">
          <h3 class="text-lg font-semibold leading-none tracking-tight text-[var(--card-foreground)]">DTA Actions</h3>
        </div>
        <div class="p-6 pt-4 space-y-4">
          <div class="bg-[var(--warning)]/10 border border-[var(--warning)]/20 p-4 rounded-lg">
            <p class="text-sm text-[var(--foreground)] mb-2">This request is ready for DTA action.</p>
            <p class="text-xs text-[var(--muted-foreground)]">Review the transfer details and initiate the transfer process.</p>
          </div>
          ${ComponentBuilder.primaryButton({
            children: 'Initiate Transfer',
            onClick: `initiateTransfer(${request.id})`,
            className: 'w-full justify-center'
          })}
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
        <div class="p-6 pt-0 space-y-3">
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

  private static renderNotFound(user: DTAUser): string {
    const content = `
      <div class="bg-[var(--card)] rounded-lg border border-[var(--border)] p-12 text-center">
        <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[var(--muted)] mb-4">
          ${AlertTriangleIcon({ size: 32, color: 'var(--destructive)' })}
        </div>
        <h3 class="text-xl font-semibold text-[var(--foreground)] mb-2">Request Not Found</h3>
        <p class="text-[var(--muted-foreground)] mb-6">The requested AFT request could not be found.</p>
        ${ComponentBuilder.primaryButton({
          children: 'Back to Requests',
          onClick: 'window.location.href=\'/dta/requests\''
        })}
      </div>
    `;

    return DTANavigation.renderLayout(
      'Request Not Found',
      '',
      user,
      '/dta/request',
      content
    );
  }

  static getScript(): string {
    return `
      function initiateTransfer(requestId) {
        if (confirm('Are you sure you want to initiate this transfer? This will activate Section 4 procedures.')) {
          fetch('/api/dta/requests/' + requestId + '/activate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
          })
          .then(response => response.json())
          .then(data => {
            if (data.success) {
              alert('Transfer initiated successfully! Moving to active transfer.');
              window.location.reload();
            } else {
              alert('Error initiating transfer: ' + data.error);
            }
          })
          .catch(error => {
            console.error('Error:', error);
            alert('Failed to initiate transfer. Please try again.');
          });
        }
      }
      
      function manageTransfer(requestId) {
        // Navigate to transfer management (could be a dedicated page or modal)
        fetch('/api/dta/requests/' + requestId + '/transfer-status')
          .then(response => response.json())
          .then(data => {
            if (data.success) {
              showTransferManagementModal(data.request, data.transferStatus);
            } else {
              alert('Failed to load transfer status: ' + data.error);
            }
          })
          .catch(error => {
            console.error('Error:', error);
            alert('Failed to load transfer status.');
          });
      }
      
      function showTransferManagementModal(request, transferStatus) {
        const modalBackdrop = document.createElement('div');
        modalBackdrop.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
        modalBackdrop.onclick = (e) => {
          if (e.target === modalBackdrop) {
            document.body.removeChild(modalBackdrop);
          }
        };
        
        const modalContent = document.createElement('div');
        modalContent.className = 'bg-[var(--background)] rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-auto';
        
        modalContent.innerHTML = \`
          <div class="p-6">
            <div class="flex items-center justify-between mb-6">
              <div>
                <h2 class="text-2xl font-bold text-[var(--foreground)]">Transfer Management</h2>
                <p class="text-[var(--muted-foreground)]">Request #\${request.request_number} - Section 4 Procedures</p>
              </div>
              <button onclick="this.closest('.fixed').remove()" class="text-[var(--muted-foreground)] hover:text-[var(--foreground)] text-2xl font-bold">&times;</button>
            </div>
            
            <div class="space-y-6">
              <div class="bg-[var(--card)] p-4 rounded-lg border border-[var(--border)]">
                <h3 class="font-medium text-[var(--foreground)] mb-4">Section 4: Anti-Virus Scanning</h3>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label class="text-sm font-medium text-[var(--muted-foreground)]">Origination Scan</label>
                    <div class="flex items-center gap-2 mt-1">
                      <span class="\${transferStatus.origination_scan_performed ? 'text-[var(--success)]' : 'text-[var(--muted-foreground)]'}">
                        \${transferStatus.origination_scan_performed ? '✓ Completed' : '○ Pending'}
                      </span>
                      \${!transferStatus.origination_scan_performed ? \`
                        <button onclick="recordScan(\${request.id}, 'origination')" 
                                class="text-xs bg-[var(--primary)] text-[var(--primary-foreground)] px-2 py-1 rounded">
                          Record Scan
                        </button>
                      \` : ''}
                    </div>
                  </div>
                  <div>
                    <label class="text-sm font-medium text-[var(--muted-foreground)]">Destination Scan</label>
                    <div class="flex items-center gap-2 mt-1">
                      <span class="\${transferStatus.destination_scan_performed ? 'text-[var(--success)]' : 'text-[var(--muted-foreground)]'}">
                        \${transferStatus.destination_scan_performed ? '✓ Completed' : '○ Pending'}
                      </span>
                      \${!transferStatus.destination_scan_performed ? \`
                        <button onclick="recordScan(\${request.id}, 'destination')" 
                                class="text-xs bg-[var(--primary)] text-[var(--primary-foreground)] px-2 py-1 rounded">
                          Record Scan
                        </button>
                      \` : ''}
                    </div>
                  </div>
                </div>
              </div>
              
              <div class="bg-[var(--card)] p-4 rounded-lg border border-[var(--border)]">
                <h3 class="font-medium text-[var(--foreground)] mb-4">Transfer Completion</h3>
                <div class="space-y-3">
                  <div>
                    <label class="text-sm font-medium text-[var(--muted-foreground)]">Transfer Status</label>
                    <div class="text-[var(--foreground)]">\${transferStatus.transfer_completed ? 'Completed' : 'In Progress'}</div>
                  </div>
                  \${transferStatus.origination_scan_performed && transferStatus.destination_scan_performed && !transferStatus.transfer_completed ? \`
                    <button onclick="completeTransfer(\${request.id})" 
                            class="bg-[var(--success)] text-white px-4 py-2 rounded-md font-medium">
                      Mark Transfer Complete
                    </button>
                  \` : ''}
                </div>
              </div>
              
              <div class="bg-[var(--card)] p-4 rounded-lg border border-[var(--border)]">
                <h3 class="font-medium text-[var(--foreground)] mb-4">DTA Signature</h3>
                <div class="space-y-3">
                  <div>
                    <label class="text-sm font-medium text-[var(--muted-foreground)]">DTA Approval</label>
                    <div class="text-[var(--foreground)]">\${transferStatus.dta_signature ? 'Signed' : 'Pending'}</div>
                  </div>
                  \${transferStatus.transfer_completed && !transferStatus.dta_signature ? \`
                    <button onclick="signDTA(\${request.id})" 
                            class="bg-[var(--primary)] text-[var(--primary-foreground)] px-4 py-2 rounded-md font-medium">
                      Sign as DTA
                    </button>
                  \` : ''}
                </div>
              </div>
            </div>
            
            <div class="flex justify-end gap-2 mt-6">
              <button onclick="this.closest('.fixed').remove()" 
                      class="px-4 py-2 border border-[var(--border)] rounded-md text-[var(--foreground)] hover:bg-[var(--muted)]">
                Close
              </button>
            </div>
          </div>
        \`;
        
        modalBackdrop.appendChild(modalContent);
        document.body.appendChild(modalBackdrop);
      }
      
      function recordScan(requestId, scanType) {
        const filesScanned = prompt('How many files were scanned?', '0');
        const threatsFound = prompt('How many threats were found?', '0');
        
        if (filesScanned !== null && threatsFound !== null) {
          fetch('/api/dta/requests/' + requestId + '/scan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              scanType, 
              filesScanned: parseInt(filesScanned) || 0, 
              threatsFound: parseInt(threatsFound) || 0 
            })
          })
          .then(response => response.json())
          .then(data => {
            if (data.success) {
              alert(scanType.charAt(0).toUpperCase() + scanType.slice(1) + ' scan recorded successfully!');
              window.location.reload();
            } else {
              alert('Failed to record scan: ' + data.error);
            }
          })
          .catch(error => {
            console.error('Error:', error);
            alert('Failed to record scan.');
          });
        }
      }
      
      function completeTransfer(requestId) {
        if (confirm('Are you sure you want to mark this transfer as complete?')) {
          const filesTransferred = prompt('How many files were transferred?');
          const smeUserId = prompt('Enter SME User ID for Two-Person Integrity:');
          
          if (filesTransferred && smeUserId) {
            fetch('/api/dta/requests/' + requestId + '/complete', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                filesTransferred: parseInt(filesTransferred) || 0,
                smeUserId: parseInt(smeUserId),
                tpiMaintained: true
              })
            })
            .then(response => response.json())
            .then(data => {
              if (data.success) {
                alert('Transfer marked as complete!');
                window.location.reload();
              } else {
                alert('Failed to complete transfer: ' + data.error);
              }
            })
            .catch(error => {
              console.error('Error:', error);
              alert('Failed to complete transfer.');
            });
          }
        }
      }
      
      function signDTA(requestId) {
        if (confirm('Are you sure you want to sign this request as DTA? This will move the request to SME signature.')) {
          fetch('/api/dta/requests/' + requestId + '/sign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
          })
          .then(response => response.json())
          .then(data => {
            if (data.success) {
              alert('DTA signature recorded! Request moved to SME signature.');
              window.location.reload();
            } else {
              alert('Failed to record DTA signature: ' + data.error);
            }
          })
          .catch(error => {
            console.error('Error:', error);
            alert('Failed to record DTA signature.');
          });
        }
      }
    `;
  }
}