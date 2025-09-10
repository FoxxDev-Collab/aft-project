// DTA Data Tracking - Section 4 transfer history and anti-virus scan records
import { ComponentBuilder, Templates } from "../components/ui/server-components";
import { DTANavigation, type DTAUser } from "./dta-nav";
import { getDb } from "../lib/database-bun";

export class DTADataManagement {
  static async render(user: DTAUser, userId: number): Promise<string> {
    const db = getDb();
    
    // Get actual DTA transfer history and scan data
    const transferHistory = this.getTransferHistory(db);
    const scanStatistics = this.getScanStatistics(db);
    const recentTransfers = this.getRecentDTATransfers(db);

    // Build Section 4 tracking cards
    const transferHistoryCard = Templates.adminCard({
      title: 'Transfer History',
      description: 'View all transfers managed by DTA with Section 4 completion status',
      primaryAction: { label: 'View Full History', onClick: 'showTransferHistory()' },
      secondaryAction: { label: 'Export History', onClick: 'exportTransferHistory()' },
      status: { 
        label: 'Total Transfers', 
        value: transferHistory.totalTransfers.toString(), 
        status: 'operational' 
      }
    });

    const antivirusScanCard = Templates.adminCard({
      title: 'Anti-Virus Scan Records',
      description: 'Section 4 anti-virus scan tracking and threat detection history',
      primaryAction: { label: 'View Scan Records', onClick: 'showScanRecords()' },
      secondaryAction: { label: 'Scan Report', onClick: 'generateScanReport()' },
      status: { 
        label: 'Scans Performed', 
        value: scanStatistics.totalScans.toString(), 
        status: scanStatistics.threatsFound > 0 ? 'warning' : 'operational' 
      }
    });


    // Build transfer tracking table
    const transferTrackingTable = this.buildTransferTrackingTable(recentTransfers);

    // Build Section 4 statistics
    const statsCard = DTANavigation.renderQuickStats([
      { label: 'DTA Transfers', value: transferHistory.totalTransfers, status: 'operational' },
      { label: 'AV Scans Completed', value: scanStatistics.totalScans, status: 'operational' },
      { label: 'Threats Detected', value: scanStatistics.threatsFound, status: scanStatistics.threatsFound > 0 ? 'warning' : 'operational' },
      { label: 'Files Scanned', value: scanStatistics.originationScans + scanStatistics.destinationScans, status: 'operational' }
    ]);

    const content = `
      <div class="space-y-8">
        ${ComponentBuilder.sectionHeader({
          title: 'DTA Data Tracking',
          description: 'Section 4 transfer history, anti-virus scan records, and DTA signature tracking'
        })}
        
        ${ComponentBuilder.grid({
          cols: 2,
          gap: 'lg',
          responsive: true,
          children: [transferHistoryCard, antivirusScanCard].join('')
        })}
        
        <div>
          <h3 class="text-xl font-semibold text-[var(--foreground)] mb-6">DTA Statistics</h3>
          ${statsCard}
        </div>
        
        <div>
          <h3 class="text-xl font-semibold text-[var(--foreground)] mb-6">Transfer History</h3>
          ${transferTrackingTable}
        </div>
      </div>
    `;

    return DTANavigation.renderLayout(
      'Data Tracking',
      'Transfer History and Anti-Virus Scan Records',
      user,
      '/dta/data',
      content
    );
  }

  private static getTransferHistory(db: any) {
    // Get actual DTA transfer statistics
    const stats = db.query(`
      SELECT 
        COUNT(*) as total_transfers
      FROM aft_requests 
      WHERE status IN ('active_transfer', 'pending_sme_signature', 'completed', 'disposed')
    `).get() as any;

    return {
      totalTransfers: stats?.total_transfers || 0
    };
  }

  private static getScanStatistics(db: any) {
    // Get actual anti-virus scan statistics from Section 4 data
    const scanStats = db.query(`
      SELECT 
        COUNT(CASE WHEN origination_scan_performed = 1 THEN 1 END) as origination_scans,
        COUNT(CASE WHEN destination_scan_performed = 1 THEN 1 END) as destination_scans,
        SUM(COALESCE(origination_threats_found, 0) + COALESCE(destination_threats_found, 0)) as total_threats
      FROM aft_requests
      WHERE status IN ('active_transfer', 'pending_sme_signature', 'completed', 'disposed')
    `).get() as any;

    return {
      totalScans: (scanStats?.origination_scans || 0) + (scanStats?.destination_scans || 0),
      originationScans: scanStats?.origination_scans || 0,
      destinationScans: scanStats?.destination_scans || 0,
      threatsFound: scanStats?.total_threats || 0
    };
  }

  private static getRecentDTATransfers(db: any) {
    // Get recent transfers that DTA has handled
    return db.query(`
      SELECT 
        r.id,
        r.request_number,
        r.status,
        r.origination_scan_performed,
        r.destination_scan_performed,
        r.origination_threats_found,
        r.destination_threats_found,
        r.origination_files_scanned,
        r.destination_files_scanned,
        r.transfer_completed_date,
        r.dta_signature_date,
        r.created_at,
        r.updated_at,
        COALESCE(u.first_name || ' ' || u.last_name, u.email) as requestor_name
      FROM aft_requests r
      LEFT JOIN users u ON r.requestor_id = u.id
      WHERE r.status IN ('active_transfer', 'pending_sme_signature', 'completed', 'disposed')
      ORDER BY r.updated_at DESC
      LIMIT 20
    `).all() as any[];
  }

  private static buildTransferTrackingTable(transfers: any[]): string {
    if (transfers.length === 0) {
      return `
        <div class="bg-[var(--card)] p-8 rounded-lg border border-[var(--border)] text-center">
          <div class="text-4xl mb-4">📋</div>
          <h3 class="text-lg font-medium text-[var(--foreground)] mb-2">No DTA Activity</h3>
          <p class="text-[var(--muted-foreground)] mb-4">No transfers have been processed by DTA yet.</p>
        </div>
      `;
    }

    // Transform transfers data for table
    const tableData = transfers.map(transfer => ({
      id: transfer.id,
      request_number: transfer.request_number,
      requestor_name: transfer.requestor_name,
      status: transfer.status,
      origination_scan_performed: transfer.origination_scan_performed,
      destination_scan_performed: transfer.destination_scan_performed,
      origination_threats_found: transfer.origination_threats_found || 0,
      destination_threats_found: transfer.destination_threats_found || 0,
      origination_files_scanned: transfer.origination_files_scanned || 0,
      destination_files_scanned: transfer.destination_files_scanned || 0,
      transfer_completed_date: transfer.transfer_completed_date,
      dta_signature_date: transfer.dta_signature_date,
      created_at: transfer.created_at,
      updated_at: transfer.updated_at
    }));

    // Define table columns for Section 4 tracking
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
        key: 'av_scans',
        label: 'Anti-Virus Scans',
        render: (value: any, row: any) => `
          <div class="space-y-1">
            <div class="flex items-center gap-2 text-xs">
              <span class="${row.origination_scan_performed ? 'text-[var(--success)]' : 'text-[var(--muted-foreground)]'}">
                ${row.origination_scan_performed ? '✓' : '○'} Origin
              </span>
              ${row.origination_threats_found > 0 ? `<span class="text-[var(--destructive)]">${row.origination_threats_found} threats</span>` : ''}
            </div>
            <div class="flex items-center gap-2 text-xs">
              <span class="${row.destination_scan_performed ? 'text-[var(--success)]' : 'text-[var(--muted-foreground)]'}">
                ${row.destination_scan_performed ? '✓' : '○'} Dest
              </span>
              ${row.destination_threats_found > 0 ? `<span class="text-[var(--destructive)]">${row.destination_threats_found} threats</span>` : ''}
            </div>
          </div>
        `
      },
      {
        key: 'files_scanned',
        label: 'Files Scanned',
        render: (value: any, row: any) => `
          <div class="text-sm text-[var(--foreground)]">
            ${(row.origination_files_scanned || 0) + (row.destination_files_scanned || 0)} files
          </div>
        `
      },
      {
        key: 'status',
        label: 'Status',
        render: (value: any, row: any) => {
          const statusVariant = {
            'active_transfer': 'info',
            'pending_sme_signature': 'warning',
            'completed': 'success',
            'disposed': 'default'
          } as const;
          
          const variant = statusVariant[row.status as keyof typeof statusVariant] || 'default';
          
          return ComponentBuilder.statusBadge(
            row.status.replace('_', ' ').toUpperCase(), 
            variant
          );
        }
      },
      {
        key: 'actions',
        label: 'Actions',
        render: (value: any, row: any) => {
          const actions = [
            { label: 'View Details', onClick: `viewTransferDetails(${row.id})`, variant: 'secondary' },
            { label: 'Scan History', onClick: `viewScanHistory(${row.id})`, variant: 'secondary' }
          ];
          
          return ComponentBuilder.tableCellActions(actions);
        }
      }
    ];

    // Create table
    const table = ComponentBuilder.table({
      columns,
      rows: tableData,
      emptyMessage: 'No storage data found',
      compact: false
    });

    // Create search and filters for Section 4 data
    const search = ComponentBuilder.tableSearch({
      placeholder: 'Search transfer history...',
      onSearch: 'filterTransferHistory'
    });

    const filters = ComponentBuilder.tableFilters({
      filters: [
        {
          key: 'scan_status',
          label: 'All Scan Status',
          options: [
            { value: 'both_complete', label: 'Both Scans Complete' },
            { value: 'partial', label: 'Partial Scans' },
            { value: 'none', label: 'No Scans' },
            { value: 'threats_found', label: 'Threats Detected' }
          ],
          onChange: 'filterByScanStatus'
        },
        {
          key: 'section4_status',
          label: 'All Section 4 Status',
          options: [
            { value: 'in_progress', label: 'In Progress' },
            { value: 'scans_complete', label: 'Scans Complete' },
            { value: 'transfer_complete', label: 'Transfer Complete' },
            { value: 'dta_signed', label: 'DTA Signed' }
          ],
          onChange: 'filterBySection4Status'
        }
      ]
    });

    const actions = ComponentBuilder.tableActions({
      primary: {
        label: 'Section 4 Report',
        onClick: 'generateSection4Report()'
      },
      secondary: [
        { label: 'Export Scan Data', onClick: 'exportScanData()' },
        { label: 'Export Signatures', onClick: 'exportDTASignatures()' }
      ]
    });

    return ComponentBuilder.tableContainer({
      title: 'Transfer History',
      description: 'Track transfers and anti-virus scan results',
      search,
      filters,
      actions,
      table,
      className: 'bg-[var(--card)] rounded-lg border border-[var(--border)]'
    });
  }

  static getScript(): string {
    return `
      function showTransferHistory() {
        alert('Transfer History:\\n\\nThis would show a comprehensive view of all DTA transfers including:\\n• Complete Section 4 workflow history\\n• Anti-virus scan records\\n• Transfer completion timestamps\\n• DTA signature tracking\\n• Audit trail for compliance');
      }
      
      function exportTransferHistory() {
        alert('Exporting transfer history...\\n\\nThis would generate a comprehensive report including:\\n• All DTA-managed transfers\\n• Section 4 completion data\\n• Timeline information\\n• Compliance metrics');
      }
      
      function showScanRecords() {
        alert('Anti-Virus Scan Records:\\n\\nThis would display detailed scan information including:\\n• Origination and destination scan results\\n• Files scanned counts\\n• Threats detected and mitigated\\n• Scan timestamps and technician records\\n• Compliance with Section 4 requirements');
      }
      
      function generateScanReport() {
        alert('Generating scan report...\\n\\nThis would create a detailed anti-virus report including:\\n• Total scans performed\\n• Threat detection statistics\\n• Scan coverage metrics\\n• Section 4 compliance status');
      }
      
      function showDTASignatures() {
        alert('DTA Signatures:\\n\\nThis would show all DTA signatures including:\\n• Signature timestamps\\n• Request completion status\\n• Two-Person Integrity workflow\\n• Audit trail for compliance\\n• SME signature coordination');
      }
      
      function generateSignatureReport() {
        alert('Generating signature report...\\n\\nThis would create a report of all DTA signatures including:\\n• Signature completion rates\\n• Timeline metrics\\n• Compliance tracking\\n• Audit documentation');
      }
      
      function showComplianceDashboard() {
        alert('Section 4 Compliance Dashboard:\\n\\nThis would display comprehensive compliance metrics including:\\n• Section 4 completion rates\\n• Anti-virus scan compliance\\n• DTA signature compliance\\n• Two-Person Integrity tracking\\n• Audit readiness status');
      }
      
      function generateAuditReport() {
        alert('Generating audit report...\\n\\nThis would create a comprehensive audit report including:\\n• Section 4 compliance verification\\n• Anti-virus scan documentation\\n• DTA signature audit trail\\n• Process compliance metrics\\n• Regulatory compliance status');
      }
      
      function viewSection4Details(requestId) {
        alert('Section 4 Details for Request ' + requestId + ':\\n\\nThis would show comprehensive Section 4 information including:\\n• Anti-virus scan details\\n• Transfer completion status\\n• DTA signature information\\n• Two-Person Integrity workflow\\n• Compliance documentation');
      }
      
      function viewScanHistory(requestId) {
        alert('Scan History for Request ' + requestId + ':\\n\\nThis would show detailed scan information including:\\n• Origination scan results\\n• Destination scan results\\n• Files scanned counts\\n• Threats detected\\n• Scan timestamps and operators');
      }
      
      function generateSection4Report() {
        alert('Generating Section 4 Report...\\n\\nThis would create a comprehensive Section 4 report including:\\n• All transfer Section 4 data\\n• Anti-virus scan summary\\n• DTA signature tracking\\n• Compliance metrics\\n• Audit trail documentation');
      }
      
      function exportScanData() {
        alert('Exporting scan data...\\n\\nThis would export detailed anti-virus scan data including:\\n• Scan results by request\\n• Threat detection records\\n• File scan counts\\n• Compliance metrics');
      }
      
      function exportDTASignatures() {
        alert('Exporting DTA signatures...\\n\\nThis would export DTA signature data including:\\n• Signature timestamps\\n• Request completion data\\n• Two-Person Integrity records\\n• Compliance documentation');
      }
      
      function filterTransferHistory(searchTerm) {
        const rows = document.querySelectorAll('tbody tr');
        const term = searchTerm.toLowerCase();
        
        rows.forEach(row => {
          const text = row.textContent.toLowerCase();
          row.style.display = text.includes(term) ? '' : 'none';
        });
      }
      
      function filterByScanStatus(status) {
        const rows = document.querySelectorAll('tbody tr');
        
        rows.forEach(row => {
          if (!status) {
            row.style.display = '';
            return;
          }
          
          // This would filter based on actual scan status in a real implementation
          row.style.display = '';
        });
      }
      
      function filterBySection4Status(status) {
        const rows = document.querySelectorAll('tbody tr');
        
        rows.forEach(row => {
          if (!status) {
            row.style.display = '';
            return;
          }
          
          // This would filter based on Section 4 status in a real implementation
          row.style.display = '';
        });
      }
    `;
  }
}