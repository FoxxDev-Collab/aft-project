// Media Custodian Requests Management Interface
import { ComponentBuilder } from "../components/ui/server-components";
import { getDb } from "../lib/database-bun";
import { MediaCustodianNavigation, type MediaCustodianUser } from "./media-custodian-nav";
import { RequestTrackingService } from "../lib/request-tracking";
import { AFT_STATUS_LABELS } from "../lib/database-bun";

export class MediaCustodianRequests {
  
  static async renderRequestsPage(user: MediaCustodianUser, userId: number, viewMode: 'table' | 'timeline' = 'table'): Promise<string> {
    const db = getDb();
    
    // Get request statistics for all requests (media custodian sees all)
    const totalRequests = db.query("SELECT COUNT(*) as count FROM aft_requests").get() as any;
    const pendingRequests = db.query("SELECT COUNT(*) as count FROM aft_requests WHERE status NOT IN ('completed', 'rejected', 'cancelled')").get() as any;
    
    // Get all requests with timeline data
    const requestsWithTimeline = RequestTrackingService.getRequestsWithTimeline({ limit: 100 });

    // Transform requests data for table
    const tableData = requestsWithTimeline.map((request: any) => ({
      id: request.id,
      request_number: request.request_number,
      requestor_name: request.requestor_name,
      requestor_email: request.requestor_email,
      status: request.status,
      transfer_type: request.transfer_type || 'Unknown',
      classification: request.classification || 'Unknown',
      created_at: request.created_at,
      updated_at: request.updated_at,
      timeline_progress: request.timeline_progress,
      current_step: request.current_step,
      total_steps: request.total_steps,
      is_terminal: request.is_terminal
    }));

    // Define table columns
    const columns = [
      {
        key: 'request_number',
        label: 'Request Number',
        render: (_value: any, row: any) => `
          <div>
            <div class="font-medium text-[var(--foreground)]">${row.request_number}</div>
            <div class="text-sm text-[var(--muted-foreground)]">ID: ${row.id}</div>
          </div>
        `
      },
      {
        key: 'requestor_info',
        label: 'Requestor',
        render: (_value: any, row: any) => `
          <div>
            <div class="font-medium text-[var(--foreground)]">${row.requestor_name || 'Unknown'}</div>
            <div class="text-sm text-[var(--muted-foreground)]">${row.requestor_email || 'No email'}</div>
          </div>
        `
      },
      {
        key: 'updated_at',
        label: 'Last Updated',
        render: (_value: any, row: any) => `
          <div class="text-sm text-[var(--foreground)]">${new Date(row.updated_at * 1000).toLocaleDateString()}</div>
        `
      },
      {
        key: 'transfer_type',
        label: 'Type',
        render: (_value: any, row: any) => `
          <div class="text-sm text-[var(--foreground)]">${row.transfer_type}</div>
        `
      },
      {
        key: 'classification',
        label: 'Classification',
        render: (_value: any, row: any) => `
          <div class="text-xs px-2 py-1 rounded-full bg-[var(--warning)]/10 text-[var(--warning)] border border-[var(--warning)]/20 font-medium text-center">
            ${row.classification}
          </div>
        `
      },
      {
        key: 'status',
        label: 'Status & Progress',
        render: (_value: any, row: any) => {
          const statusVariant: { [key: string]: 'default' | 'info' | 'success' | 'error' | 'warning' } = {
            'draft': 'default',
            'submitted': 'info',
            'pending_dao': 'warning',
            'pending_approver': 'warning',
            'pending_cpso': 'warning',
            'approved': 'success',
            'rejected': 'error',
            'pending_dta': 'info',
            'active_transfer': 'info',
            'pending_sme_signature': 'warning',
            'pending_sme': 'warning',
            'pending_media_custodian': 'warning',
            'completed': 'success',
            'disposed': 'success',
            'cancelled': 'default'
          };
          
          const variant = statusVariant[row.status] || 'default';
          
          return `
            <div class="space-y-2">
              ${ComponentBuilder.timelineStatusBadge(
                row.status, 
                variant, 
                true, 
                { current: row.current_step, total: row.total_steps }
              )}
              <div class="w-full bg-[var(--muted)] rounded-full h-1.5">
                <div class="bg-[var(--primary)] h-1.5 rounded-full transition-all duration-300" style="width: ${row.timeline_progress}%"></div>
              </div>
            </div>
          `;
        }
      },
      {
        key: 'actions',
        label: 'Actions',
        render: (_value: any, row: any) => {
          const actions: Array<{
            label: string;
            onClick: string;
            variant: 'primary' | 'secondary' | 'destructive';
          }> = [
            { label: 'View', onClick: `viewRequest(${row.id})`, variant: 'secondary' },
            { label: 'Timeline', onClick: `viewTimeline(${row.id})`, variant: 'secondary' }
          ];

          // Add process action for pending requests
          if (['submitted', 'pending_dao', 'pending_approver', 'pending_cpso', 'pending_media_custodian'].includes(row.status)) {
            actions.push({ label: 'Process', onClick: `processRequest(${row.id})`, variant: 'primary' });
          }

          return ComponentBuilder.tableCellActions(actions);
        }
      }
    ];

    // Create table
    const table = ComponentBuilder.table({
      columns,
      rows: tableData,
      emptyMessage: 'No requests found',
      compact: false
    });

    // Build statistics cards
    const statsCards = this.buildStatsCards(totalRequests?.count || 0, pendingRequests?.count || 0, tableData);

    const tableContainer = ComponentBuilder.tableContainer({
        title: 'All Requests',
        description: 'Monitor and process all Assured File Transfer requests.',
        table
    });

    const content = `
        <div class="space-y-6">
          ${statsCards}
          ${tableContainer}
        </div>
    `;

    return MediaCustodianNavigation.renderLayout(
        'All Requests',
        'Manage and oversee all AFT requests',
        user,
        '/media-custodian/requests',
        content
    );
  }


  private static buildStatsCards(total: number, pending: number, requests: any[]): string {
    const approved = requests.filter(r => r.status === 'approved').length;
    const rejected = requests.filter(r => r.status === 'rejected').length;
    const completed = requests.filter(r => r.status === 'completed').length;

    return ComponentBuilder.grid({
      cols: 4,
      gap: 'md',
      responsive: true,
      children: [
        ComponentBuilder.statusCard({
          title: 'Total Requests',
          items: [{ label: 'All Time', value: total.toString(), status: 'operational' }]
        }),
        ComponentBuilder.statusCard({
          title: 'Pending Review',
          items: [{ label: 'Awaiting Action', value: pending.toString(), status: pending > 0 ? 'warning' : 'operational' }]
        }),
        ComponentBuilder.statusCard({
          title: 'Approved',
          items: [{ label: 'Ready for Transfer', value: approved.toString(), status: 'operational' }]
        }),
        ComponentBuilder.statusCard({
          title: 'Completed',
          items: [{ label: 'Successfully Processed', value: completed.toString(), status: 'operational' }]
        })
      ].join('')
    });
  }

  static async renderRequestDetail(user: MediaCustodianUser, requestId: number): Promise<string> {
    const db = getDb();
    
    // Get request details
    const request = db.query(`
      SELECT r.*, u.email as requestor_email, u.first_name || ' ' || u.last_name as requestor_name
      FROM aft_requests r
      LEFT JOIN users u ON r.requestor_id = u.id
      WHERE r.id = ?
    `).get(requestId) as any;

    if (!request) {
      return `
        ${MediaCustodianNavigation.renderPageHeader('Request Not Found', 'The requested AFT request could not be found', user, '/media-custodian/requests')}
        <div class="max-w-4xl mx-auto px-3 sm:px-5 lg:px-6 py-6">
          <div class="text-center">
            <h2 class="text-2xl font-bold text-[var(--foreground)] mb-4">Request Not Found</h2>
            <p class="text-[var(--muted-foreground)] mb-6">The request you're looking for doesn't exist or you don't have permission to view it.</p>
            <button onclick="window.location.href='/media-custodian/requests'" class="px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md">
              Back to Requests
            </button>
          </div>
        </div>
      `;
    }

    // Parse files list
    let files = [];
    if (request.files_list) {
      try {
        files = JSON.parse(request.files_list);
      } catch {
        files = [];
      }
    }

    // Get timeline data
    const timeline = RequestTrackingService.getRequestTimeline(requestId);

    // Build request details view
    const requestDetails = this.buildRequestDetailsView(request, files);
    const timelineView = this.buildTimelineView(timeline?.timeline_steps || []);

    return `
      ${MediaCustodianNavigation.renderPageHeader(`Request ${request.request_number}`, 'View and manage AFT request details', user, '/media-custodian/requests')}
      
      <div class="max-w-6xl mx-auto px-3 sm:px-5 lg:px-6 py-6">
        <div class="space-y-6">
          ${MediaCustodianNavigation.renderBreadcrumb('/media-custodian/requests/' + requestId)}
          
          <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div class="lg:col-span-2">
              ${requestDetails}
            </div>
            <div>
              ${timelineView}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private static buildRequestDetailsView(request: any, files: any[]): string {
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

    const variant = statusVariant[request.status as keyof typeof statusVariant] || 'default';

    return `
      <div class="bg-[var(--card)] rounded-lg border border-[var(--border)] p-6 space-y-6">
        <div class="flex justify-between items-start">
          <div>
            <h2 class="text-2xl font-bold text-[var(--foreground)]">${request.request_number}</h2>
            <p class="text-[var(--muted-foreground)]">Submitted by ${request.requestor_name || request.requestor_email}</p>
          </div>
          ${ComponentBuilder.statusBadge(request.status.replace('_', ' ').toUpperCase(), variant)}
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h3 class="font-semibold text-[var(--foreground)] mb-3">Transfer Details</h3>
            <dl class="space-y-2 text-sm">
              <div><dt class="font-medium">Media Type:</dt><dd>${request.media_type || 'Not specified'}</dd></div>
              <div><dt class="font-medium">Transfer Type:</dt><dd>${request.transfer_type || 'Not specified'}</dd></div>
              <div><dt class="font-medium">Classification:</dt><dd>${request.classification || 'Not specified'}</dd></div>
              <div><dt class="font-medium">Media Disposition:</dt><dd>${request.media_disposition || 'Not specified'}</dd></div>
            </dl>
          </div>

          <div>
            <h3 class="font-semibold text-[var(--foreground)] mb-3">System Information</h3>
            <dl class="space-y-2 text-sm">
              <div><dt class="font-medium">Source System:</dt><dd>${request.source_system || 'Not specified'}</dd></div>
              <div><dt class="font-medium">Source Classification:</dt><dd>${request.source_classification || 'Not specified'}</dd></div>
              <div><dt class="font-medium">Destination System:</dt><dd>${request.dest_system || 'Not specified'}</dd></div>
              <div><dt class="font-medium">Destination Classification:</dt><dd>${request.destination_classification || 'Not specified'}</dd></div>
            </dl>
          </div>
        </div>

        <div>
          <h3 class="font-semibold text-[var(--foreground)] mb-3">Justification</h3>
          <p class="text-sm text-[var(--muted-foreground)] bg-[var(--muted)] p-3 rounded-md">
            ${request.transfer_purpose || 'No justification provided'}
          </p>
        </div>

        ${files.length > 0 ? `
          <div>
            <h3 class="font-semibold text-[var(--foreground)] mb-3">Files (${files.length})</h3>
            <div class="space-y-2">
              ${files.map(file => `
                <div class="flex justify-between items-center p-2 bg-[var(--muted)] rounded text-sm">
                  <span class="font-medium">${file.name}</span>
                  <span class="text-[var(--muted-foreground)]">${file.type} - ${file.classification}</span>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <div class="flex justify-between items-center pt-4 border-t border-[var(--border)]">
          <div class="text-sm text-[var(--muted-foreground)]">
            Created: ${new Date(request.created_at * 1000).toLocaleString()}
            <br>
            Updated: ${new Date(request.updated_at * 1000).toLocaleString()}
          </div>
          <div class="flex space-x-2">
            <button onclick="window.location.href='/media-custodian/requests'" class="px-4 py-2 text-sm border border-[var(--border)] rounded-md hover:bg-[var(--muted)]">
              Back to Requests
            </button>
            <button onclick="processRequest(${request.id})" class="px-4 py-2 text-sm bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md hover:opacity-90">
              Process Request
            </button>
          </div>
        </div>
      </div>
    `;
  }

  private static buildTimelineView(timeline: any[]): string {
    return `
      <div class="bg-[var(--card)] rounded-lg border border-[var(--border)] p-6">
        <h3 class="font-semibold text-[var(--foreground)] mb-4">Request Timeline</h3>
        <div class="space-y-4">
          ${timeline.map((event, index) => `
            <div class="flex items-start space-x-3">
              <div class="flex-shrink-0 w-3 h-3 rounded-full ${event.completed ? 'bg-[var(--success)]' : 'bg-[var(--muted)]'} mt-1"></div>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-[var(--foreground)]">${event.step_name}</p>
                <p class="text-xs text-[var(--muted-foreground)]">${event.description || 'No description'}</p>
                ${event.completed_at ? `
                  <p class="text-xs text-[var(--muted-foreground)] mt-1">
                    ${new Date(event.completed_at * 1000).toLocaleString()}
                  </p>
                ` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  static getScript(): string {
    return `
      function toggleViewMode(mode) {
        const tableBtn = document.getElementById('table-view-btn');
        const timelineBtn = document.getElementById('timeline-view-btn');
        
        if (mode === 'table') {
          tableBtn.className = 'px-3 py-2 text-sm font-medium rounded-md transition-colors bg-[var(--primary)] text-[var(--primary-foreground)]';
          timelineBtn.className = 'px-3 py-2 text-sm font-medium rounded-md transition-colors text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)]';
        } else {
          timelineBtn.className = 'px-3 py-2 text-sm font-medium rounded-md transition-colors bg-[var(--primary)] text-[var(--primary-foreground)]';
          tableBtn.className = 'px-3 py-2 text-sm font-medium rounded-md transition-colors text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)]';
        }
        
        // TODO: Implement actual view switching
        console.log('Switching to', mode, 'view');
      }
      
      function applyFilters() {
        const status = document.getElementById('status-filter').value;
        const classification = document.getElementById('classification-filter').value;
        const search = document.getElementById('search-input').value;
        
        console.log('Applying filters:', { status, classification, search });
        // TODO: Implement actual filtering
      }
      
      function clearFilters() {
        document.getElementById('status-filter').value = '';
        document.getElementById('classification-filter').value = '';
        document.getElementById('search-input').value = '';
        applyFilters();
      }
      
      function viewRequest(requestId) {
        window.location.href = '/media-custodian/requests/' + requestId;
      }
      
      function processRequest(requestId) {
        window.location.href = '/media-custodian/requests/' + requestId + '/process';
      }
      
      function viewTimeline(requestId) {
        // Show timeline modal - reuse from requestor implementation
        showTimelineModal(requestId);
      }
      
      async function showTimelineModal(requestId) {
        try {
          const response = await fetch('/api/requests/' + requestId + '/timeline');
          if (!response.ok) throw new Error('Failed to fetch timeline');
          
          const timeline = await response.json();
          
          const modal = document.createElement('div');
          modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4';
          modal.innerHTML = \`
            <div class="bg-[var(--card)] rounded-lg border border-[var(--border)] max-w-2xl w-full max-h-[80vh] overflow-y-auto">
              <div class="p-6 border-b border-[var(--border)] flex justify-between items-center">
                <h3 class="text-lg font-semibold text-[var(--foreground)]">Request Timeline</h3>
                <button onclick="this.closest('.fixed').remove()" class="text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
                  <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                  </svg>
                </button>
              </div>
              <div class="p-6">
                <div class="space-y-4">
                  \${timeline.map(event => \`
                    <div class="flex items-start space-x-4">
                      <div class="flex-shrink-0 w-4 h-4 rounded-full \${event.completed ? 'bg-[var(--success)]' : 'bg-[var(--muted)]'} mt-1"></div>
                      <div class="flex-1">
                        <div class="flex items-center justify-between">
                          <h4 class="font-medium text-[var(--foreground)]">\${event.step_name}</h4>
                          \${event.completed ? '<span class="text-xs text-[var(--success)]">✓ Completed</span>' : '<span class="text-xs text-[var(--muted-foreground)]">Pending</span>'}
                        </div>
                        <p class="text-sm text-[var(--muted-foreground)] mt-1">\${event.description || 'No description available'}</p>
                        \${event.completed_at ? \`<p class="text-xs text-[var(--muted-foreground)] mt-2">\${new Date(event.completed_at * 1000).toLocaleString()}</p>\` : ''}
                      </div>
                    </div>
                  \`).join('')}
                </div>
              </div>
            </div>
          \`;
          
          document.body.appendChild(modal);
          modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
          });
        } catch (error) {
          console.error('Error fetching timeline:', error);
          alert('Failed to load request timeline. Please try again.');
        }
      }
    `;
  }
}
