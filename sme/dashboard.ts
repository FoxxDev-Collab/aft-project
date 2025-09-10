// SME Dashboard - Main SME landing page
import { ComponentBuilder, Templates } from "../components/ui/server-components";
import { SMENavigation, type SMEUser } from "./sme-nav";
import { getDb } from "../lib/database-bun";

export class SMEDashboard {
  static async render(user: SMEUser, userId: number): Promise<string> {
    const db = getDb();

    const pendingSignatures = db.query(`
      SELECT COUNT(*) as count FROM aft_requests 
      WHERE status = 'pending_sme_signature'
    `).get() as any;

    const signedHistory = db.query(`
      SELECT COUNT(*) as count FROM aft_request_history
      WHERE user_email = ? AND action = 'sme_signed'
    `).get(user.email) as any;

    const recentActivity = db.query(`
      SELECT * FROM aft_requests
      WHERE status = 'pending_sme_signature' OR (status = 'completed' AND id IN (SELECT request_id FROM aft_request_history WHERE user_email = ? AND action = 'sme_signed'))
      ORDER BY updated_at DESC
      LIMIT 5
    `).all(user.email) as any[];

    const pendingCard = Templates.adminCard({
      title: 'Pending Signatures',
      description: 'Requests waiting for your Two-Person Integrity signature.',
      primaryAction: { label: 'Review Pending', onClick: 'window.location.href=\'/sme\'' },
      status: { label: 'Pending', value: pendingSignatures?.count?.toString() || '0', status: pendingSignatures?.count > 0 ? 'warning' : 'operational' }
    });

    const historyCard = Templates.adminCard({
      title: 'Signature History',
      description: 'View a log of all requests you have signed.',
      primaryAction: { label: 'View History', onClick: 'window.location.href=\'/sme/history\'' },
      status: { label: 'Signed', value: signedHistory?.count?.toString() || '0', status: 'operational' }
    });

    const recentActivityTable = this.buildRecentActivityTable(recentActivity);

    const content = `
      <div class="space-y-8">
        ${ComponentBuilder.sectionHeader({
          title: 'SME Signature Portal',
          description: 'Provide Two-Person Integrity for completed data transfers.'
        })}
        
        ${ComponentBuilder.grid({
          cols: 2,
          gap: 'lg',
          responsive: true,
          children: [pendingCard, historyCard].join('')
        })}
        
        <div>
          <h3 class="text-xl font-semibold text-[var(--foreground)] mb-6">Recent Activity</h3>
          ${recentActivityTable}
        </div>
      </div>
    `;

    return SMENavigation.renderLayout(
      'Dashboard',
      'SME Signature Portal',
      user,
      '/sme',
      content
    );
  }

  private static buildRecentActivityTable(requests: any[]): string {
    if (requests.length === 0) {
      return `<div class="bg-[var(--card)] p-8 rounded-lg border border-[var(--border)] text-center">
                <div class="text-4xl mb-4">✍️</div>
                <h3 class="text-lg font-medium text-[var(--foreground)] mb-2">No Recent Activity</h3>
                <p class="text-[var(--muted-foreground)] mb-4">There are no pending signatures or recent actions.</p>
              </div>`;
    }

    const tableData = requests.map(request => ({
      id: request.id,
      request_number: request.request_number,
      status: request.status,
      updated_at: request.updated_at
    }));

    const columns = [
      {
        key: 'request_number',
        label: 'Request',
        render: (value: any, row: any) => `<div>
                                            <div class="font-medium text-[var(--foreground)] text-sm">${row.request_number}</div>
                                            <div class="text-xs text-[var(--muted-foreground)]">ID: ${row.id}</div>
                                          </div>`
      },
      {
        key: 'status',
        label: 'Status',
        render: (value: any, row: any) => {
          const statusVariant = {
            'pending_sme_signature': 'warning',
            'completed': 'success'
          } as const;
          const variant = statusVariant[row.status as keyof typeof statusVariant] || 'default';
          return ComponentBuilder.statusBadge(row.status.replace(/_/g, ' ').toUpperCase(), variant);
        }
      },
      {
        key: 'updated_at',
        label: 'Last Updated',
        render: (value: any, row: any) => `<div class="text-xs text-[var(--foreground)]">${new Date(row.updated_at * 1000).toLocaleDateString()}</div>`
      },
      {
          key: 'actions',
          label: 'Actions',
          render: (value: any, row: any) => {
              if (row.status === 'pending_sme_signature') {
                  return ComponentBuilder.button({ children: 'Sign', onClick: `window.location.href='/sme/sign/${row.id}'`, variant: 'primary', size: 'sm' });
              }
              return ComponentBuilder.button({ children: 'View', onClick: `window.location.href='/sme/history/${row.id}'`, variant: 'secondary', size: 'sm' });
          }
      }
    ];

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

  static getScript(): string {
    return ``; // No scripts needed for this dashboard yet
  }
}