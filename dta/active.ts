// DTA Active Transfers - Simplified Section 4 Workflow
import { ComponentBuilder } from "../components/ui/server-components";
import { DTANavigation, type DTAUser } from "./dta-nav";
import { getDb } from "../lib/database-bun";

export class DTAActiveTransfers {
  static async render(user: DTAUser, userId: number): Promise<string> {
    const db = getDb();
    
    // Get active transfers
    const activeTransfers = db.query(`
      SELECT 
        id, request_number, requestor_name, requestor_email,
        source_system, source_location, classification,
        origination_scan_status, origination_files_scanned,
        destination_scan_status, destination_files_scanned,
        transfer_completed_date, dta_signature_date,
        created_at, updated_at
      FROM aft_requests
      WHERE status = 'active_transfer'
      ORDER BY updated_at DESC
    `).all() as any[];

    const content = `
      <div class="space-y-6">
        ${ComponentBuilder.sectionHeader({
          title: 'Active Transfers - Section 4 Procedures',
          description: 'Record AV scan results, perform transfers, and complete DTA signature workflow'
        })}
        
        ${this.buildActiveTransfersTable(activeTransfers)}
      </div>
    `;

    return DTANavigation.renderLayout(
      'Active Transfers',
      'Section 4 Transfer Procedures',
      user,
      '/dta/active',
      content
    );
  }

  private static buildActiveTransfersTable(transfers: any[]): string {
    if (transfers.length === 0) {
      return `
        <div class="bg-[var(--card)] p-8 rounded-lg border border-[var(--border)] text-center">
          <div class="text-4xl mb-4">🔄</div>
          <h3 class="text-lg font-medium text-[var(--foreground)] mb-2">No Active Transfers</h3>
          <p class="text-[var(--muted-foreground)] mb-4">No transfers are currently in active status.</p>
        </div>
      `;
    }

    // Transform transfers data for simplified table
    const tableData = transfers.map(transfer => ({
      id: transfer.id,
      request_number: transfer.request_number,
      requestor_name: transfer.requestor_name || transfer.requestor_email,
      source_system: transfer.source_system,
      source_location: transfer.source_location,
      classification: transfer.classification || 'UNCLASSIFIED',
      origination_scan_status: transfer.origination_scan_status || 'pending',
      origination_files_scanned: transfer.origination_files_scanned,
      destination_scan_status: transfer.destination_scan_status || 'pending',
      destination_files_scanned: transfer.destination_files_scanned,
      transfer_completed: transfer.transfer_completed_date ? true : false,
      dta_signature: transfer.dta_signature_date ? true : false
    }));

    // Simplified table columns per requirements
    const columns = [
      {
        key: 'request_number',
        label: 'Request',
        render: (value: any, row: any) => `
          <div>
            <div class="font-medium text-[var(--foreground)]">${row.request_number}</div>
            <div class="text-xs text-[var(--muted-foreground)]">${row.requestor_name}</div>
          </div>
        `
      },
      {
        key: 'systems',
        label: 'Transfer Route',
        render: (value: any, row: any) => `
          <div class="text-sm text-[var(--foreground)]">${row.source_system || 'Source'} → ${row.source_location || 'Destination'}</div>
          <div class="text-xs text-[var(--muted-foreground)]">${row.classification}</div>
        `
      },
      {
        key: 'av_scan_workflow',
        label: 'AV Scan Workflow',
        render: (value: any, row: any) => {
          return `
            <div class="space-y-2">
              <div class="grid grid-cols-2 gap-2 text-xs">
                <div class="flex items-center gap-1">
                  <span class="${row.origination_scan_status === 'clean' ? 'text-[var(--success)]' : row.origination_scan_status === 'infected' ? 'text-[var(--destructive)]' : 'text-[var(--warning)]'}">
                    ${row.origination_scan_status === 'clean' ? '✓' : row.origination_scan_status === 'infected' ? '✗' : '○'}
                  </span>
                  <span>Origin${row.origination_files_scanned ? ` (${row.origination_files_scanned})` : ''}</span>
                </div>
                <div class="flex items-center gap-1">
                  <span class="${row.destination_scan_status === 'clean' ? 'text-[var(--success)]' : row.destination_scan_status === 'infected' ? 'text-[var(--destructive)]' : 'text-[var(--warning)]'}">
                    ${row.destination_scan_status === 'clean' ? '✓' : row.destination_scan_status === 'infected' ? '✗' : '○'}
                  </span>
                  <span>Dest${row.destination_files_scanned ? ` (${row.destination_files_scanned})` : ''}</span>
                </div>
              </div>
              <div class="flex gap-1">
                <input type="number" 
                       placeholder="Files" 
                       class="w-16 text-xs border border-[var(--border)] rounded px-1 py-0.5 bg-[var(--background)]"
                       data-files-count="${row.id}"
                       min="0">
                <select class="flex-1 text-xs border border-[var(--border)] rounded p-1 bg-[var(--background)]" 
                        onchange="updateScanStatus(${row.id}, this.value)" 
                        data-request-id="${row.id}">
                  <option value="">Select AV Scan Result...</option>
                  <option value="record-origin-clean">Origin Media - Clean</option>
                  <option value="record-origin-infected">Origin Media - Infected</option>
                  <option value="record-destination-clean">Destination Media - Clean</option>
                  <option value="record-destination-infected">Destination Media - Infected</option>
                </select>
              </div>
            </div>
          `;
        }
      },
      {
        key: 'transfer_workflow',
        label: 'Transfer Workflow',
        render: (value: any, row: any) => {
          const canTransfer = row.origination_scan_status === 'clean' && row.destination_scan_status === 'clean';
          const transferComplete = row.transfer_completed;
          const dtaSigned = row.dta_signature;
          
          if (dtaSigned) {
            return `<div class="text-xs text-[var(--success)]">✓ Signed - Awaiting SME</div>`;
          } else if (transferComplete) {
            return `
              <button class="w-full text-xs bg-[var(--primary)] text-[var(--primary-foreground)] px-2 py-1 rounded hover:bg-[var(--primary)]/80" 
                      onclick="signTransfer(${row.id})">
                Sign DTA (Section 4)
              </button>
            `;
          } else if (canTransfer) {
            return `
              <button class="w-full text-xs bg-[var(--success)] text-white px-2 py-1 rounded hover:bg-[var(--success)]/80" 
                      onclick="performTransfer(${row.id})">
                Perform Transfer
              </button>
            `;
          } else {
            return `<div class="text-xs text-[var(--muted-foreground)]">Awaiting AV Scans</div>`;
          }
        }
      }
    ];

    // Create simplified table
    const table = ComponentBuilder.table({
      columns,
      rows: tableData,
      emptyMessage: 'No active transfers found',
      compact: false
    });

    return ComponentBuilder.tableContainer({
      title: 'Active Transfers - Section 4 Procedures',
      description: 'Record AV scan results, perform transfers, and complete DTA signature workflow',
      table,
      className: 'bg-[var(--card)] rounded-lg border border-[var(--border)]'
    });
  }

  static getScript(): string {
    return `
      function updateScanStatus(requestId, action) {
        if (!action) return;
        
        const [operation, media, result] = action.split('-');
        
        if (operation !== 'record' || !media || !result) {
          alert('Invalid scan action selected');
          return;
        }
        
        const scanType = media; // 'origin' or 'destination'
        const scanResult = result; // 'clean' or 'infected'
        
        // Get the files count from the input field
        const filesInput = document.querySelector(\`input[data-files-count="\${requestId}"]\`);
        const filesScanned = filesInput ? parseInt(filesInput.value) || 0 : 0;
        
        if (filesScanned === 0) {
          alert('Please enter the number of files scanned');
          const select = document.querySelector(\`select[data-request-id="\${requestId}"]\`);
          if (select) select.value = '';
          return;
        }
        
        if (confirm(\`Record \${scanType} media scan as \${scanResult.toUpperCase()} with \${filesScanned} files scanned?\`)) {
          fetch(\`/api/dta/requests/\${requestId}/scan\`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              scanType: scanType === 'origin' ? 'origination' : 'destination',
              result: scanResult,
              filesScanned: filesScanned,
              notes: \`\${scanType.charAt(0).toUpperCase() + scanType.slice(1)} media AV scan: \${scanResult} (\${filesScanned} files scanned)\`
            })
          })
          .then(response => response.json())
          .then(data => {
            if (data.success) {
              alert(\`\${scanType.charAt(0).toUpperCase() + scanType.slice(1)} scan recorded as \${scanResult}!\`);
              window.location.reload();
            } else {
              alert('Failed to record scan: ' + data.error);
            }
          })
          .catch(error => {
            console.error('Error recording scan:', error);
            alert('Failed to record scan. Please try again.');
          });
        }
        
        // Reset dropdown and files input
        const select = document.querySelector(\`select[data-request-id="\${requestId}"]\`);
        if (select) select.value = '';
        if (filesInput) filesInput.value = '';
      }
      
      function performTransfer(requestId) {
        if (confirm('Perform the file transfer? This will mark the transfer as complete and ready for DTA signature.')) {
          fetch(\`/api/dta/requests/\${requestId}/complete\`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              notes: 'Transfer completed by DTA per Section 4 procedures'
            })
          })
          .then(response => response.json())
          .then(data => {
            if (data.success) {
              alert('Transfer completed successfully! Ready for DTA signature.');
              window.location.reload();
            } else {
              alert('Failed to complete transfer: ' + data.error);
            }
          })
          .catch(error => {
            console.error('Error completing transfer:', error);
            alert('Failed to complete transfer. Please try again.');
          });
        }
      }
      
      function signTransfer(requestId) {
        if (confirm('Sign this transfer as DTA? This will move the request to SME signature for Two-Person Integrity verification.')) {
          fetch(\`/api/dta/requests/\${requestId}/sign\`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              notes: 'DTA signature completed per Section 4 requirements'
            })
          })
          .then(response => response.json())
          .then(data => {
            if (data.success) {
              alert('DTA signature recorded! Request moved to SME for Two-Person Integrity verification.');
              window.location.reload();
            } else {
              alert('Failed to record DTA signature: ' + data.error);
            }
          })
          .catch(error => {
            console.error('Error recording DTA signature:', error);
            alert('Failed to record DTA signature. Please try again.');
          });
        }
      }
    `;
  }
}