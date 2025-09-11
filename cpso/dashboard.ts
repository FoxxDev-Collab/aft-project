// CPSO Dashboard - Main CPSO landing page
import { ComponentBuilder, Templates } from "../components/ui/server-components";
import { CPSONavigation, type CPSOUser } from "./cpso-nav";
import { getDb, AFTStatus } from "../lib/database-bun";

export class CPSODashboard {
  static async render(user: CPSOUser, userId: number): Promise<string> {
    const db = getDb();

    // CPSO-centric metrics - only pending_cpso requests
    const pendingCount = db.query(`
      SELECT COUNT(*) as count FROM aft_requests 
      WHERE status = 'pending_cpso'
    `).get() as any;

    const approved7d = db.query(`
      SELECT COUNT(*) as count FROM aft_requests 
      WHERE status = 'approved' AND approver_email = ? AND updated_at >= (unixepoch() - 7*24*60*60)
    `).get(user.email) as any;

    const rejected7d = db.query(`
      SELECT COUNT(*) as count FROM aft_requests 
      WHERE status = 'rejected' AND approver_email = ? AND updated_at >= (unixepoch() - 7*24*60*60)
    `).get(user.email) as any;

    // Pending queue - only requests awaiting CPSO approval
    const pendingQueue = db.query(`
      SELECT r.id, r.request_number, r.requestor_id, r.transfer_type, r.classification, r.status, r.created_at, r.updated_at,
             u.first_name || ' ' || u.last_name as requestor_name,
             u.email as requestor_email
      FROM aft_requests r
      LEFT JOIN users u ON r.requestor_id = u.id
      WHERE r.status = 'pending_cpso'
      ORDER BY r.updated_at DESC
      LIMIT 25
    `).all() as any[];

    // Recently approved by this CPSO
    const recentApproved = db.query(`
      SELECT r.id, r.request_number, r.transfer_type, r.classification, r.updated_at
      FROM aft_requests r
      WHERE r.status = 'approved' AND r.approver_email = ?
      ORDER BY r.updated_at DESC
      LIMIT 10
    `).all(user.email) as any[];

    // KPI stats
    const statsCard = CPSONavigation.renderQuickStats([
      { label: 'Pending CPSO Review', value: pendingCount?.count || 0, status: (pendingCount?.count || 0) > 0 ? 'warning' : 'operational' },
      { label: 'Approved (7d)', value: approved7d?.count || 0, status: 'operational' },
      { label: 'Rejected (7d)', value: rejected7d?.count || 0, status: 'operational' },
      { label: 'SLA Risk', value: this.getAgingRisk(pendingQueue), status: 'warning' }
    ]);

    const content = `
      <div class="space-y-8">
        ${ComponentBuilder.sectionHeader({
          title: 'CPSO Dashboard',
          description: 'Final review and approval of AFT requests'
        })}

        <div>
          <h3 class="text-xl font-semibold text-[var(--foreground)] mb-6">Key Metrics</h3>
          ${statsCard}
        </div>

        <div>
          <h3 class="text-xl font-semibold text-[var(--foreground)] mb-4">Pending CPSO Reviews</h3>
          ${this.buildPendingTable(pendingQueue)}
        </div>

        <div>
          <h3 class="text-xl font-semibold text-[var(--foreground)] mb-4">Recently Approved</h3>
          ${this.buildApprovedTable(recentApproved)}
        </div>
      </div>
    `;

    return CPSONavigation.renderLayout(
      'Dashboard',
      'CPSO Operations and Final Review',
      user,
      '/cpso',
      content
    );
  }

  private static buildPendingTable(rows: any[]): string {
    if (rows.length === 0) {
      return `
        <div class="bg-[var(--card)] p-8 rounded-lg border border-[var(--border)] text-center">
          <div class="text-4xl mb-4">✅</div>
          <h3 class="text-lg font-medium text-[var(--foreground)] mb-2">No Pending Items</h3>
          <p class="text-[var(--muted-foreground)] mb-4">You're all caught up.</p>
        </div>
      `;
    }

    // Transform for table
    const tableData = rows.map(r => ({
      id: r.id,
      request_number: r.request_number,
      requestor: r.requestor_name || r.requestor_email,
      status: r.status,
      transfer_type: r.transfer_type || 'Unknown',
      classification: r.classification || 'UNCLASSIFIED',
      created_at: r.created_at,
      age_days: Math.max(0, Math.floor((Date.now()/1000 - (r.created_at || r.updated_at)) / (24*60*60)))
    }));

    // Define table columns
    const columns = [
      {
        key: 'request_number',
        label: 'Request Number',
        render: (value: any, row: any) => `
          <div>
            <div class="font-medium text-[var(--foreground)]">${row.request_number}</div>
            <div class="text-xs text-[var(--muted-foreground)]">ID: ${row.id}</div>
          </div>
        `
      },
      {
        key: 'requestor',
        label: 'Requestor',
        render: (_: any, row: any) => `<div class="text-sm text-[var(--foreground)]">${row.requestor}</div>`
      },
      {
        key: 'transfer_type',
        label: 'Type',
        render: (value: any, row: any) => `
          <div class="text-sm text-[var(--foreground)]">${row.transfer_type}</div>
        `
      },
      {
        key: 'classification',
        label: 'Class',
        render: (_: any, row: any) => `<div class="text-sm text-[var(--foreground)]">${row.classification}</div>`
      },
      {
        key: 'age_days',
        label: 'Age (days)',
        render: (_: any, row: any) => `<div class="text-sm text-[var(--foreground)]">${row.age_days}</div>`
      },
      {
        key: 'status',
        label: 'Status',
        render: (value: any, row: any) => {
          const statusVariant = {
            'draft': 'default',
            'submitted': 'info',
            'pending_dao': 'warning',
            'pending_approver': 'warning',
            'pending_cpso': 'warning',
            'approved': 'success',
            'rejected': 'error',
            'completed': 'success',
            'cancelled': 'default'
          } as const;
          
          const variant = statusVariant[row.status as keyof typeof statusVariant] || 'default';
          
          return ComponentBuilder.statusBadge(
            row.status.replace('_', ' ').toUpperCase(), 
            variant
          );
        }
      },
      {
        key: 'created_at',
        label: 'Submitted',
        render: (value: any, row: any) => `
          <div class="text-sm text-[var(--foreground)]">${new Date(row.created_at * 1000).toLocaleDateString()}</div>
        `
      },
      {
        key: 'actions',
        label: 'Actions',
        render: (_: any, row: any) => ComponentBuilder.tableCellActions([
          { label: 'Review', onClick: `reviewRequest(${row.id})`, variant: 'secondary' }
        ])
      }
    ];

    // Create table
    const table = ComponentBuilder.table({
      columns,
      rows: tableData,
      emptyMessage: 'No recent requests found',
      compact: true
    });

    return ComponentBuilder.tableContainer({
      table,
      className: 'bg-[var(--card)] rounded-lg border border-[var(--border)]'
    });
  }

  private static buildApprovedTable(rows: any[]): string {
    if (rows.length === 0) {
      return `<div class=\"text-sm text-[var(--muted-foreground)]\">No approvals yet</div>`;
    }
    const list = rows.map(r => `
      <div class=\"flex items-center justify-between py-2 border-b border-[var(--border)] last:border-0\">
        <div>
          <div class=\"font-medium\">${r.request_number}</div>
          <div class=\"text-xs text-[var(--muted-foreground)]\">${r.transfer_type || 'Unknown'} • ${r.classification || ''}</div>
        </div>
        <div class=\"text-xs text-[var(--muted-foreground)]\">${new Date(r.updated_at * 1000).toLocaleDateString()}</div>
      </div>
    `).join('');
    return `<div class=\"bg-[var(--card)] rounded-lg border border-[var(--border)] p-4\">${list}</div>`;
  }

  private static getAgingRisk(rows: any[]): string {
    if (!rows || rows.length === 0) return '0 at risk';
    const nowSec = Math.floor(Date.now()/1000);
    const atRisk = rows.filter(r => (nowSec - (r.updated_at || r.created_at)) > (5*24*60*60)).length; // >5 days
    return `${atRisk} at risk`;
  }

  static getScript(): string {
    return `
      function reviewRequest(requestId) {
        window.location.href = '/cpso/request/' + requestId;
      }
    `;
  }
}