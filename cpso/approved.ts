// Approved Requests Page - Shows all requests that have been approved
import { ComponentBuilder, Templates } from "../components/ui/server-components";
import { CPSONavigation, type CPSOUser } from "./cpso-nav";
import { getDb } from "../lib/database-bun";
import { CheckCircleIcon, CalendarIcon, DownloadIcon, FilterIcon } from "../components/icons";

export class CPSOApprovedRequestsPage {
  static async render(user: CPSOUser, userId: number): Promise<string> {
    const db = getDb();
    
    // Get all approved requests by this CPSO
    const approvedRequests = db.query(`
      SELECT 
        r.*,
        u.email as requestor_email,
        u.first_name || ' ' || u.last_name as requestor_name,
        a.email as approver_email,
        a.first_name || ' ' || a.last_name as approver_name
      FROM aft_requests r
      LEFT JOIN users u ON r.requestor_id = u.id
      LEFT JOIN users a ON r.approver_id = a.id
      WHERE r.status = 'approved' AND r.approver_email = ?
      ORDER BY r.updated_at DESC
    `).all(user.email) as any[];

    // Calculate statistics
    const todayCount = approvedRequests.filter(r => {
      const updatedDate = new Date(r.updated_at * 1000);
      const today = new Date();
      return updatedDate.toDateString() === today.toDateString();
    }).length;

    const weekCount = approvedRequests.filter(r => {
      const updatedDate = new Date(r.updated_at * 1000);
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      return updatedDate >= weekAgo;
    }).length;

    const tableData = approvedRequests.map(request => ({
      id: request.id,
      request_number: request.request_number,
      requestor_name: request.requestor_name,
      requestor_email: request.requestor_email,
      source_system: request.source_system,
      destination_system: request.destination_system,
      classification: request.classification,
      updated_at: request.updated_at,
    }));

    const columns = [
      { key: 'request_number', label: 'Request ID' },
      { key: 'requestor_name', label: 'Requestor' },
      {
        key: 'systems',
        label: 'Systems',
        render: (value: any, row: any) => `${row.source_system} → ${row.destination_system}`,
      },
      {
        key: 'updated_at',
        label: 'Approved Date',
        render: (value: any, row: any) => new Date(row.updated_at * 1000).toLocaleDateString(),
      },
      {
        key: 'status',
        label: 'Status',
        render: () => ComponentBuilder.statusBadge('Approved', 'success'),
      },
      {
        key: 'actions',
        label: 'Actions',
        render: (value: any, row: any) => ComponentBuilder.tableCellActions([
          { label: 'View Details', onClick: `viewRequest(${row.id})`, variant: 'secondary' },
        ]),
      },
    ];

    const table = ComponentBuilder.table({ columns, rows: tableData, emptyMessage: 'No approved requests found.' });

    const tableContainer = ComponentBuilder.tableContainer({
      title: 'CPSO Approved Requests',
      description: 'A log of all requests you have given final approval to.',
      table,
    });

    const content = `
      <div class="space-y-6">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div class="bg-[var(--card)] p-4 rounded-lg border border-[var(--border)]">
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-sm text-[var(--muted-foreground)]">Total Approved</p>
                  <p class="text-2xl font-bold text-[var(--foreground)]">${approvedRequests.length}</p>
                </div>
                <div class="text-[var(--success)]">${CheckCircleIcon({ size: 32 })}</div>
              </div>
            </div>
            <div class="bg-[var(--card)] p-4 rounded-lg border border-[var(--border)]">
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-sm text-[var(--muted-foreground)]">Today</p>
                  <p class="text-2xl font-bold text-[var(--foreground)]">${todayCount}</p>
                </div>
                <div class="text-[var(--primary)]">${CalendarIcon({ size: 32 })}</div>
              </div>
            </div>
            <div class="bg-[var(--card)] p-4 rounded-lg border border-[var(--border)]">
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-sm text-[var(--muted-foreground)]">This Week</p>
                  <p class="text-2xl font-bold text-[var(--foreground)]">${weekCount}</p>
                </div>
                <div class="text-[var(--primary)]">${CalendarIcon({ size: 32 })}</div>
              </div>
            </div>
        </div>
        ${tableContainer}
      </div>
    `;

    return CPSONavigation.renderLayout('Approved Requests', 'View all CPSO approved AFT requests', user, '/cpso/approved', content);
  }

  static getScript(): string {
    return `
      function viewRequest(requestId) {
        window.location.href = '/cpso/review/' + requestId;
      }
    `;
  }
}