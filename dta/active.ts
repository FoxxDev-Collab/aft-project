// DTA Active Transfers - Monitor and manage active transfer operations
import { ComponentBuilder, Templates } from "../components/ui/server-components";
import { DTANavigation, type DTAUser } from "./dta-nav";
import { getDb } from "../lib/database-bun";
import { RequestTrackingService } from "../lib/request-tracking";

export class DTAActiveTransfers {
  static async render(user: DTAUser, userId: number): Promise<string> {
    const db = getDb();
    
    // Get active transfers
    const activeTransfers = db.query(`
      SELECT *
      FROM aft_requests
      WHERE status = 'active_transfer'
      ORDER BY updated_at DESC
    `).all() as any[];

    // Get transfer statistics
    const transferStats = db.query(`
      SELECT 
        COUNT(*) as total_active,
        COUNT(CASE WHEN origination_scan_performed = 1 THEN 1 END) as scanned_origination,
        COUNT(CASE WHEN destination_scan_performed = 1 THEN 1 END) as scanned_destination,
        COUNT(CASE WHEN transfer_completed_date IS NOT NULL THEN 1 END) as completed_transfers
      FROM aft_requests 
      WHERE status = 'active_transfer'
    `).get() as any;

    // Build active transfers table
    const activeTransfersTable = this.buildActiveTransfersTable(activeTransfers);

    // Build statistics cards
    const statsCard = DTANavigation.renderQuickStats([
      { label: 'Active Transfers', value: transferStats?.total_active || 0, status: transferStats?.total_active > 0 ? 'info' : 'operational' },
      { label: 'Origination Scanned', value: transferStats?.scanned_origination || 0, status: 'operational' },
      { label: 'Destination Scanned', value: transferStats?.scanned_destination || 0, status: 'operational' },
      { label: 'Ready for Completion', value: transferStats?.completed_transfers || 0, status: transferStats?.completed_transfers > 0 ? 'warning' : 'operational' }
    ]);

    const content = `
      <div class="space-y-8">
        ${ComponentBuilder.sectionHeader({
          title: 'Active Transfer Operations',
          description: 'Monitor and manage ongoing file transfer operations and Section 4 procedures'
        })}
        
        <div>
          <h3 class="text-xl font-semibold text-[var(--foreground)] mb-6">Transfer Statistics</h3>
          ${statsCard}
        </div>
        
        <div>
          <h3 class="text-xl font-semibold text-[var(--foreground)] mb-6">Active Transfers</h3>
          ${activeTransfersTable}
        </div>
      </div>
    `;

    return DTANavigation.renderLayout(
      'Active Transfers',
      'Monitor and Manage Active Transfer Operations',
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

    // Transform transfers data for table
    const tableData = transfers.map(transfer => ({
      id: transfer.id,
      request_number: transfer.request_number,
      requestor_name: transfer.requestor_name || transfer.requestor_email,
      transfer_type: transfer.transfer_type || 'Unknown',
      classification: transfer.classification || 'Unknown',
      origination_scan_performed: transfer.origination_scan_performed,
      destination_scan_performed: transfer.destination_scan_performed,
      transfer_completed: transfer.transfer_completed_date ? true : false,
      dta_signature: transfer.dta_signature_date ? true : false,
      created_at: transfer.created_at,
      updated_at: transfer.updated_at
    }));

    // Define table columns
    const columns = [
      {
        key: 'request_number',
        label: 'Request',
        render: (value: any, row: any) => `
          <div>
            <div class="font-medium text-[var(--foreground)]">${row.request_number}</div>
            <div class="text-sm text-[var(--muted-foreground)]">ID: ${row.id}</div>
          </div>
        `
      },
      {
        key: 'requestor_name',
        label: 'Requestor',
        render: (value: any, row: any) => `
          <div class="text-sm text-[var(--foreground)]">${row.requestor_name}</div>
        `
      },
      {
        key: 'transfer_type',
        label: 'Type',
        render: (value: any, row: any) => `
          <div class="text-sm text-[var(--foreground)]">${row.transfer_type}</div>
        `
      },
      {
        key: 'section4_progress',
        label: 'Section 4 Progress',
        render: (value: any, row: any) => {
          const progress = [
            { label: 'Origin Scan', completed: row.origination_scan_performed },
            { label: 'Dest Scan', completed: row.destination_scan_performed },
            { label: 'Transfer Complete', completed: row.transfer_completed },
            { label: 'DTA Signed', completed: row.dta_signature }
          ];
          
          const completedSteps = progress.filter(p => p.completed).length;
          const progressPercent = Math.round((completedSteps / progress.length) * 100);
          
          return `
            <div class="space-y-2">
              <div class="flex items-center gap-2">
                <div class="w-full bg-[var(--muted)] rounded-full h-2">
                  <div class="bg-[var(--primary)] h-2 rounded-full transition-all duration-300" 
                       style="width: ${progressPercent}%"></div>
                </div>
                <span class="text-xs font-mono text-[var(--muted-foreground)]">${progressPercent}%</span>
              </div>
              <div class="flex gap-1">
                ${progress.map(step => `
                  <div class="flex items-center gap-1 text-xs">
                    <span class="${step.completed ? 'text-[var(--success)]' : 'text-[var(--muted-foreground)]'}">
                      ${step.completed ? '✓' : '○'}
                    </span>
                  </div>
                `).join('')}
              </div>
            </div>
          `;
        }
      },
      {
        key: 'updated_at',
        label: 'Last Updated',
        render: (value: any, row: any) => `
          <div class="text-sm text-[var(--foreground)]">${new Date(row.updated_at * 1000).toLocaleDateString()}</div>
        `
      },
      {
        key: 'actions',
        label: 'Actions',
        render: (value: any, row: any) => {
          const actions: { label: string; onClick: string; variant: 'primary' | 'secondary' | 'destructive' }[] = [
            { label: 'Manage', onClick: `manageActiveTransfer(${row.id})`, variant: 'primary' },
            { label: 'View Details', onClick: `viewTransferDetails(${row.id})`, variant: 'secondary' }
          ];
          
          // Add quick actions based on current state
          if (!row.origination_scan_performed || !row.destination_scan_performed) {
            actions.push({ label: 'Record Scan', onClick: `quickRecordScan(${row.id})`, variant: 'secondary' });
          } else if (row.origination_scan_performed && row.destination_scan_performed && !row.transfer_completed) {
            actions.push({ label: 'Complete Transfer', onClick: `quickCompleteTransfer(${row.id})`, variant: 'primary' });
          } else if (row.transfer_completed && !row.dta_signature) {
            actions.push({ label: 'Sign DTA', onClick: `quickSignDTA(${row.id})`, variant: 'secondary' });
          }
          
          return ComponentBuilder.tableCellActions(actions.slice(0, 3)); // Limit to 3 actions for space
        }
      }
    ];

    // Create table
    const table = ComponentBuilder.table({
      columns,
      rows: tableData,
      emptyMessage: 'No active transfers found',
      compact: false
    });

    // Create search and filters
    const search = ComponentBuilder.tableSearch({
      placeholder: 'Search active transfers...',
      onSearch: 'filterActiveTransfers'
    });

    const filters = ComponentBuilder.tableFilters({
      filters: [
        {
          key: 'progress',
          label: 'All Progress',
          options: [
            { value: 'scan-pending', label: 'Scan Pending' },
            { value: 'scan-complete', label: 'Scans Complete' },
            { value: 'ready-completion', label: 'Ready for Completion' },
            { value: 'ready-signature', label: 'Ready for DTA Signature' }
          ],
          onChange: 'filterByProgress'
        },
        {
          key: 'type',
          label: 'All Types',
          options: [
            { value: 'high-to-low', label: 'High to Low' },
            { value: 'low-to-high', label: 'Low to High' },
            { value: 'peer-to-peer', label: 'Peer to Peer' }
          ],
          onChange: 'filterByType'
        }
      ]
    });

    const actions = ComponentBuilder.tableActions({
      primary: {
        label: 'Bulk Operations',
        onClick: 'showBulkOperations()'
      },
      secondary: [
        { label: 'Refresh Status', onClick: 'refreshTransferStatus()' },
        { label: 'Export Report', onClick: 'exportActiveTransfers()' }
      ]
    });

    return ComponentBuilder.tableContainer({
      title: 'Active Transfers',
      description: 'Monitor Section 4 procedures and transfer completion status',
      search,
      filters,
      actions,
      table,
      className: 'bg-[var(--card)] rounded-lg border border-[var(--border)]'
    });
  }

  static getScript(): string {
    return `
      function manageActiveTransfer(transferId) {
        // Show transfer management modal (reuse from requests page)
        fetch(\`/api/dta/requests/\${transferId}/transfer-status\`)
          .then(response => response.json())
          .then(data => {
            if (data.success) {
              showTransferManagementModal(data.request, data.transferStatus);
            } else {
              alert('Failed to load transfer status: ' + data.error);
            }
          })
          .catch(error => {
            console.error('Error fetching transfer status:', error);
            alert('Failed to load transfer status. Please try again.');
          });
      }
      
      function viewTransferDetails(transferId) {
        // Show detailed transfer information modal
        fetch(\`/api/dta/requests/\${transferId}\`)
          .then(response => response.json())
          .then(data => {
            if (data.success) {
              showTransferDetailsModal(data.request);
            } else {
              alert('Failed to load transfer details: ' + data.error);
            }
          })
          .catch(error => {
            console.error('Error fetching transfer details:', error);
            alert('Failed to load transfer details. Please try again.');
          });
      }
      
      function quickRecordScan(transferId) {
        const scanType = prompt('Record scan for:\\n\\n1. Origination\\n2. Destination\\n\\nEnter 1 or 2:');
        if (scanType === '1' || scanType === '2') {
          const scanTypeName = scanType === '1' ? 'origination' : 'destination';
          recordScan(transferId, scanTypeName);
        }
      }
      
      function quickCompleteTransfer(transferId) {
        if (confirm('Mark this transfer as complete?')) {
          completeTransfer(transferId);
        }
      }
      
      function quickSignDTA(transferId) {
        if (confirm('Sign this transfer as DTA? This will move it to SME signature for TPI.')) {
          signDTA(transferId);
        }
      }
      
      function showBulkOperations() {
        alert('Bulk operations interface would be displayed here.\\n\\nThis would allow:\\n- Bulk scan recording\\n- Bulk completion\\n- Bulk signature operations');
      }
      
      function refreshTransferStatus() {
        window.location.reload();
      }
      
      function exportActiveTransfers() {
        alert('Export functionality would generate a report of all active transfers with their Section 4 status.');
      }
      
      function filterActiveTransfers(searchTerm) {
        const rows = document.querySelectorAll('tbody tr');
        const term = searchTerm.toLowerCase();
        
        rows.forEach(row => {
          const text = row.textContent.toLowerCase();
          row.style.display = text.includes(term) ? '' : 'none';
        });
      }
      
      function filterByProgress(progress) {
        const rows = document.querySelectorAll('tbody tr');
        
        rows.forEach(row => {
          if (!progress) {
            row.style.display = '';
            return;
          }
          
          // This is a simplified filter - in a real implementation, 
          // you'd check the actual progress data
          row.style.display = '';
        });
      }
      
      function filterByType(type) {
        const rows = document.querySelectorAll('tbody tr');
        
        rows.forEach(row => {
          if (!type) {
            row.style.display = '';
          } else {
            const typeCell = row.querySelector('td:nth-child(3)');
            if (typeCell) {
              const typeText = typeCell.textContent.toLowerCase();
              row.style.display = typeText.includes(type.toLowerCase()) ? '' : 'none';
            }
          }
        });
      }
      
      // Reuse functions from requests page
      function recordScan(requestId, scanType) {
        fetch(\`/api/dta/requests/\${requestId}/scan\`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scanType })
        })
        .then(response => response.json())
        .then(data => {
          if (data.success) {
            alert(\`\${scanType.charAt(0).toUpperCase() + scanType.slice(1)} scan recorded successfully!\`);
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
      
      function completeTransfer(requestId) {
        fetch(\`/api/dta/requests/\${requestId}/complete\`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        })
        .then(response => response.json())
        .then(data => {
          if (data.success) {
            alert('Transfer marked as complete successfully!');
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
      
      function signDTA(requestId) {
        fetch(\`/api/dta/requests/\${requestId}/sign\`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        })
        .then(response => response.json())
        .then(data => {
          if (data.success) {
            alert('DTA signature recorded! The request will now proceed to SME signature for Two-Person Integrity.');
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
      
      // Modal functions (simplified versions)
      function showTransferManagementModal(request, transferStatus) {
        // Redirect to requests page for full modal
        window.location.href = '/dta/requests';
      }
      
      function showTransferDetailsModal(request) {
        // Simple details modal
        alert('Transfer Details:\\n\\n' + 
              'Request: ' + request.request_number + '\\n' +
              'Requestor: ' + request.requestor_name + '\\n' +
              'Type: ' + request.transfer_type + '\\n' +
              'Status: ' + request.status);
      }
    `;
  }
}