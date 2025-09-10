// DTA Dashboard - Main DTA landing page
import { ComponentBuilder, Templates } from "../components/ui/server-components";
import { DTANavigation, type DTAUser } from "./dta-nav";
import { getDb, AFTStatus } from "../lib/database-bun";

export class DTADashboard {
  static async render(user: DTAUser, userId: number): Promise<string> {
    const db = getDb();
    
    // Get DTA statistics
    const allRequests = db.query("SELECT COUNT(*) as count FROM aft_requests").get() as any;
    const dtaPendingRequests = db.query(`
      SELECT COUNT(*) as count FROM aft_requests 
      WHERE status = 'pending_dta'
    `).get() as any;
    const activeTransfers = db.query(`
      SELECT COUNT(*) as count FROM aft_requests 
      WHERE status = 'active_transfer'
    `).get() as any;
    const recentRequests = db.query(`
      SELECT * FROM aft_requests 
      WHERE status IN ('pending_dta', 'active_transfer', 'completed')
      ORDER BY updated_at DESC 
      LIMIT 5
    `).all() as any[];

    // Build action cards using Templates.adminCard
    const pendingRequestsCard = Templates.adminCard({
      title: 'Pending DTA Approval',
      description: 'Requests waiting for data transfer administrator review',
      primaryAction: { label: 'Review Pending', onClick: 'window.location.href=\'/dta/requests?filter=pending_dta\'' },
      secondaryAction: { label: 'Bulk Process', onClick: 'showBulkProcessModal()' },
      status: { label: 'Pending', value: dtaPendingRequests?.count?.toString() || '0', status: dtaPendingRequests?.count > 0 ? 'warning' : 'operational' }
    });

    const activeTransfersCard = Templates.adminCard({
      title: 'Active Transfers',
      description: 'Currently processing data transfers',
      primaryAction: { label: 'Monitor Transfers', onClick: 'window.location.href=\'/dta/active\'' },
      secondaryAction: { label: 'Performance', onClick: 'window.location.href=\'/dta/reports/performance\'' },
      status: { label: 'Active', value: activeTransfers?.count?.toString() || '0', status: activeTransfers?.count > 0 ? 'info' : 'operational' }
    });

    const dataManagementCard = Templates.adminCard({
      title: 'Data Management',
      description: 'Manage transfer data, storage, and cleanup processes',
      primaryAction: { label: 'Data Center', onClick: 'window.location.href=\'/dta/data\'' },
      secondaryAction: { label: 'Storage Reports', onClick: 'window.location.href=\'/dta/reports/storage\'' },
      status: { label: 'Storage', value: this.getStorageStatus(), status: 'operational' }
    });


    // Build recent requests table
    const recentRequestsTable = this.buildRecentRequestsTable(recentRequests);

    // Get anti-virus scan statistics for dashboard
    const scanStats = db.query(`
      SELECT 
        COUNT(CASE WHEN origination_scan_performed = 1 THEN 1 END) as origination_scans,
        COUNT(CASE WHEN destination_scan_performed = 1 THEN 1 END) as destination_scans,
        SUM(COALESCE(origination_threats_found, 0) + COALESCE(destination_threats_found, 0)) as total_threats
      FROM aft_requests
      WHERE status IN ('active_transfer', 'pending_sme_signature', 'completed', 'disposed')
    `).get() as any;

    const totalScans = (scanStats?.origination_scans || 0) + (scanStats?.destination_scans || 0);
    const threatsFound = scanStats?.total_threats || 0;

    // Build statistics card using DTANavigation.renderQuickStats
    const statsCard = DTANavigation.renderQuickStats([
      { label: 'Total Requests', value: allRequests?.count || 0, status: 'operational' },
      { label: 'Pending DTA', value: dtaPendingRequests?.count || 0, status: dtaPendingRequests?.count > 0 ? 'warning' : 'operational' },
      { label: 'Active Transfers', value: activeTransfers?.count || 0, status: activeTransfers?.count > 0 ? 'info' : 'operational' },
      { label: 'AV Scans', value: totalScans, status: threatsFound > 0 ? 'warning' : 'operational' }
    ]);

    const content = `
      <div class="space-y-8">
        ${ComponentBuilder.sectionHeader({
          title: 'Data Transfer Administration',
          description: 'Monitor and manage assured file transfers across the system'
        })}
        
        ${ComponentBuilder.grid({
          cols: 3,
          gap: 'lg',
          responsive: true,
          children: [pendingRequestsCard, activeTransfersCard, dataManagementCard].join('')
        })}
        
        <div>
          <h3 class="text-xl font-semibold text-[var(--foreground)] mb-6">DTA Statistics</h3>
          ${statsCard}
        </div>
        
        <div>
          <h3 class="text-xl font-semibold text-[var(--foreground)] mb-6">Recent Activity</h3>
          ${recentRequestsTable}
        </div>
      </div>
    `;

    return DTANavigation.renderLayout(
      'Dashboard',
      'Data Transfer Administrator Portal',
      user,
      '/dta',
      content
    );
  }

  private static buildRecentRequestsTable(requests: any[]): string {
    if (requests.length === 0) {
      return `
        <div class="bg-[var(--card)] p-8 rounded-lg border border-[var(--border)] text-center">
          <div class="text-4xl mb-4">📊</div>
          <h3 class="text-lg font-medium text-[var(--foreground)] mb-2">No Recent Activity</h3>
          <p class="text-[var(--muted-foreground)] mb-4">No transfer requests to display at this time.</p>
        </div>
      `;
    }

    // Transform requests data for table
    const tableData = requests.map(request => ({
      id: request.id,
      request_number: request.request_number,
      status: request.status,
      transfer_type: request.transfer_type || 'Unknown',
      created_at: request.created_at,
      updated_at: request.updated_at
    }));

    // Define compact table columns
    const columns = [
      {
        key: 'request_number',
        label: 'Request',
        render: (value: any, row: any) => `
          <div>
            <div class="font-medium text-[var(--foreground)] text-sm">${row.request_number}</div>
            <div class="text-xs text-[var(--muted-foreground)]">ID: ${row.id}</div>
          </div>
        `
      },
      {
        key: 'status',
        label: 'Status',
        render: (value: any, row: any) => {
          const statusVariant = {
            'pending_dta': 'warning',
            'active_transfer': 'info',
            'completed': 'success',
            'rejected': 'error'
          } as const;
          
          const variant = statusVariant[row.status as keyof typeof statusVariant] || 'default';
          
          return ComponentBuilder.statusBadge(
            row.status.replace('_', ' ').toUpperCase(), 
            variant
          );
        }
      },
      {
        key: 'transfer_type',
        label: 'Type',
        render: (value: any, row: any) => `
          <div class="text-sm text-[var(--foreground)]">${row.transfer_type}</div>
        `
      },
      {
        key: 'updated_at',
        label: 'Updated',
        render: (value: any, row: any) => `
          <div class="text-xs text-[var(--foreground)]">${new Date(row.updated_at * 1000).toLocaleDateString()}</div>
        `
      }
    ];

    // Create compact table
    const table = ComponentBuilder.table({
      columns,
      rows: tableData,
      emptyMessage: 'No recent activity',
      compact: true
    });

    return ComponentBuilder.tableContainer({
      table,
      className: 'bg-[var(--card)] rounded-lg border border-[var(--border)]'
    });
  }

  private static getStorageStatus(): string {
    // Simulated storage status
    return '82% Used';
  }

  private static getSuccessRate(total: number): string {
    if (total === 0) return '0%';
    // Simulated success rate calculation
    return '98.5%';
  }

  static getScript(): string {
    return `
      function showBulkProcessModal() {
        alert('Bulk processing interface would be displayed here.\\n\\nThis would allow DTA to process multiple pending requests at once.');
      }
    `;
  }
}