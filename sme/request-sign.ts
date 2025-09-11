// SME Request Signing Page - Detailed view for SME to sign requests after DTA process
import { ComponentBuilder, Templates } from "../components/ui/server-components";
import { SMENavigation, type SMEUser } from "./sme-nav";
import { getDb } from "../lib/database-bun";
import { FileTextIcon, UserIcon, CalendarIcon, ShieldIcon, ServerIcon, CheckCircleIcon, XCircleIcon, AlertTriangleIcon, ClockIcon, EditIcon } from "../components/icons";

export class SMERequestSignPage {
  static async render(user: SMEUser, requestId: string): Promise<string> {
    const db = getDb();
    
    // Get comprehensive request details including DTA data
    const request = db.query(`
      SELECT 
        r.*, 
        u.email as requestor_email,
        u.first_name || ' ' || u.last_name as requestor_name,
        u.organization as requestor_org,
        du.first_name || ' ' || du.last_name as dta_name,
        du.email as dta_email,
        md.serial_number as drive_serial,
        md.type as drive_type,
        md.capacity,
        md.model as drive_model
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

    // Drive tracking is now handled through the media_drives table
    const driveTracking: any[] = [];

    const content = `
      <div class="space-y-6">
        <!-- SME Signature Status Banner -->
        ${this.renderSignatureStatusBanner(request)}
        
        <!-- Main Content Grid -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <!-- Left Column - Complete Request Details -->
          <div class="lg:col-span-2 space-y-6">
            ${this.renderRequestDetails(request)}
            ${this.renderDTAProcessData(request, driveTracking)}
            ${this.renderDestinations(request)}
            ${this.renderFileInformation(request)}
            ${this.renderJustification(request)}
            ${this.renderHistory(history)}
          </div>
          
          <!-- Right Column - Signing Actions & Info -->
          <div class="space-y-6">
            ${this.renderSigningActions(request)}
            ${this.renderRequestorInfo(request)}
            ${this.renderDTAInfo(request)}
            ${this.renderMetadata(request)}
          </div>
        </div>
      </div>
    `;

    return SMENavigation.renderLayout(
      'Request Signature',
      `Sign Request #${request.request_number || requestId}`,
      user,
      '/sme/sign',
      content
    );
  }

  private static renderSignatureStatusBanner(request: any): string {
    const statusConfig = {
      pending_sme_signature: {
        icon: EditIcon({ size: 20 }),
        text: 'Ready for SME Signature - Two-Person Integrity Check Required',
        class: 'bg-[var(--warning)] border-[var(--warning)] text-[var(--warning-foreground)]'
      },
      pending_media_custodian: {
        icon: CheckCircleIcon({ size: 20 }),
        text: 'SME Signed - Forwarded to Media Custodian',
        class: 'bg-[var(--success)] border-[var(--success)] text-[var(--success-foreground)]'
      }
    };

    const statusKey = request.status === 'pending_media_custodian' ? 'pending_media_custodian' : 'pending_sme_signature';
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

  private static renderDTAProcessData(request: any, driveTracking: any[]): string {
    return ComponentBuilder.card({
      children: `
        <div class="p-6 pb-4">
          <h3 class="text-lg font-semibold leading-none tracking-tight text-[var(--card-foreground)] flex items-center gap-2">
            ${ShieldIcon({ size: 20 })}
            DTA Process & Drive Information
          </h3>
        </div>
        <div class="p-6 pt-0 space-y-4">
          ${request.dta_name ? `
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="text-xs text-[var(--muted-foreground)] uppercase tracking-wide">Assigned DTA</label>
                <p class="text-sm font-medium text-[var(--foreground)] mt-1">${request.dta_name}</p>
                <p class="text-xs text-[var(--muted-foreground)]">${request.dta_email}</p>
              </div>
              <div>
                <label class="text-xs text-[var(--muted-foreground)] uppercase tracking-wide">DTA Status</label>
                <p class="text-sm text-[var(--success)] mt-1">✓ Process Completed</p>
              </div>
            </div>
          ` : ''}
          
          ${request.drive_serial ? `
            <div class="bg-[var(--muted)] p-4 rounded-lg">
              <h4 class="font-medium text-[var(--foreground)] mb-3">Selected Drive</h4>
              <div class="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span class="text-[var(--muted-foreground)]">Serial Number:</span>
                  <span class="font-mono ml-2">${request.drive_serial}</span>
                </div>
                <div>
                  <span class="text-[var(--muted-foreground)]">Type:</span>
                  <span class="ml-2">${request.drive_type || 'N/A'}</span>
                </div>
                <div>
                  <span class="text-[var(--muted-foreground)]">Capacity:</span>
                  <span class="ml-2">${request.capacity || 'N/A'}</span>
                </div>
                <div>
                  <span class="text-[var(--muted-foreground)]">Classification:</span>
                  <span class="ml-2">${request.drive_classification || 'N/A'}</span>
                </div>
              </div>
            </div>
          ` : ''}
          
          ${driveTracking.length > 0 ? `
            <div>
              <h4 class="font-medium text-[var(--foreground)] mb-2">Drive Tracking History</h4>
              <div class="space-y-2 max-h-32 overflow-y-auto">
                ${driveTracking.map(track => `
                  <div class="text-xs p-2 bg-[var(--muted)] rounded">
                    <div class="flex justify-between">
                      <span class="font-medium">${track.action}</span>
                      <span class="text-[var(--muted-foreground)]">${new Date(track.created_at).toLocaleString()}</span>
                    </div>
                    ${track.notes ? `<div class="text-[var(--muted-foreground)] mt-1">${track.notes}</div>` : ''}
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}
        </div>
      `
    });
  }

  private static renderDestinations(request: any): string {
    let destinations: any[] = [];
    try {
      const td = request.transfer_data ? JSON.parse(request.transfer_data) : null;
      destinations = Array.isArray(td?.destinations) ? td.destinations : [];
    } catch {}

    if (!request.dest_system && destinations.length === 0) return '';

    const list = [] as Array<{ is: string; classification?: string; primary?: boolean }>;
    if (request.dest_system) {
      list.push({ is: request.dest_system, classification: destinations[0]?.classification, primary: true });
    }
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
    if (!history || history.length === 0) return '';

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

  private static renderSigningActions(request: any): string {
    if (request.status === 'pending_media_custodian') {
      return ComponentBuilder.card({
        children: `
          <div class="p-6 pb-0">
            <h3 class="text-lg font-semibold leading-none tracking-tight text-[var(--card-foreground)]">Signature Status</h3>
          </div>
          <div class="text-center py-4">
            <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[var(--success)]/10 mb-4">
              ${CheckCircleIcon({ size: 32, color: 'var(--success)' })}
            </div>
            <p class="text-sm text-[var(--muted-foreground)] mb-4">
              This request has been signed and forwarded to the Media Custodian.
            </p>
            ${ComponentBuilder.button({
              children: 'Back to Requests',
              onClick: 'window.location.href=\'/sme/requests\'',
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
          <h3 class="text-lg font-semibold leading-none tracking-tight text-[var(--card-foreground)]">SME Signature Required</h3>
        </div>
        <div class="p-6 pt-4 space-y-4">
          <div class="bg-[var(--info)]/10 border border-[var(--info)]/20 rounded-lg p-4">
            <p class="text-sm text-[var(--info)] font-medium mb-2">Two-Person Integrity Check</p>
            <p class="text-xs text-[var(--muted-foreground)]">
              As the Subject Matter Expert, your signature confirms that the DTA has properly processed this transfer request and all security requirements have been met.
            </p>
          </div>
          
          <div>
            <label for="signature-notes" class="text-sm font-medium text-[var(--foreground)] mb-2 block">
              Signature Notes (Optional)
            </label>
            <textarea
              id="signature-notes"
              rows="3"
              class="w-full px-3 py-2 bg-[var(--background)] border border-[var(--border)] rounded-md text-[var(--foreground)] placeholder-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
              placeholder="Add any notes about your signature..."
            ></textarea>
          </div>
          
          <div class="space-y-2">
            ${ComponentBuilder.primaryButton({
              children: `${EditIcon({ size: 16 })} Sign Request`,
              onClick: `signRequest(${request.id})`,
              className: 'w-full justify-center'
            })}
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

  private static renderDTAInfo(request: any): string {
    if (!request.dta_name) return '';

    return ComponentBuilder.card({
      children: `
        <div class="p-6 pb-4">
          <h3 class="text-lg font-semibold leading-none tracking-tight text-[var(--card-foreground)]">DTA Information</h3>
        </div>
        <div class="p-6 pt-0 space-y-3">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-full bg-[var(--success)]/10 flex items-center justify-center">
              ${CheckCircleIcon({ size: 20, color: 'var(--success)' })}
            </div>
            <div>
              <p class="text-sm font-medium text-[var(--foreground)]">${request.dta_name}</p>
              <p class="text-xs text-[var(--muted-foreground)]">${request.dta_email}</p>
            </div>
          </div>
          <div class="text-xs text-[var(--success)] bg-[var(--success)]/10 p-2 rounded">
            ✓ DTA process completed successfully
          </div>
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

  private static renderNotFound(user: SMEUser): string {
    const content = `
      <div class="bg-[var(--card)] rounded-lg border border-[var(--border)] p-12 text-center">
        <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[var(--muted)] mb-4">
          ${AlertTriangleIcon({ size: 32, color: 'var(--destructive)' })}
        </div>
        <h3 class="text-xl font-semibold text-[var(--foreground)] mb-2">Request Not Found</h3>
        <p class="text-[var(--muted-foreground)] mb-6">The requested AFT request could not be found.</p>
        ${ComponentBuilder.primaryButton({
          children: 'Back to Requests',
          onClick: 'window.location.href=\'/sme/requests\''
        })}
      </div>
    `;

    return SMENavigation.renderLayout(
      'Request Not Found',
      '',
      user,
      '/sme/sign',
      content
    );
  }

  static getScript(): string {
    return `
      function signRequest(requestId) {
        const notes = document.getElementById('signature-notes').value;
        
        if (confirm('Are you sure you want to sign this request? This completes the Two-Person Integrity check and forwards the request to the Media Custodian.')) {
          fetch('/api/sme/requests/' + requestId + '/sign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ notes })
          })
          .then(response => response.json())
          .then(data => {
            if (data.success) {
              alert('Request signed successfully! It has been forwarded to the Media Custodian.');
              window.location.href = '/sme/requests';
            } else {
              alert('Error signing request: ' + data.error);
            }
          })
          .catch(error => {
            console.error('Error signing request:', error);
            alert('Failed to sign request. Please try again.');
          });
        }
      }
    `;
  }
}
