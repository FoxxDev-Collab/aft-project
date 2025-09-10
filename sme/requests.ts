// Admin Requests Management Interface
import { ComponentBuilder } from "../components/ui/server-components";
import { getDb } from "../lib/database-bun";
import { SMENavigation, type SMEUser } from "./sme-nav";
import { RequestTrackingService } from "../lib/request-tracking";
import { AFT_STATUS_LABELS } from "../lib/database-bun";

export class SMERequests {
  
  static async renderRequestsPage(user: SMEUser, viewMode: 'table' | 'timeline' = 'table'): Promise<string> {
    const db = getDb();
    
    // Get request statistics
    const totalRequests = db.query("SELECT COUNT(*) as count FROM aft_requests").get() as any;
    const pendingRequests = db.query("SELECT COUNT(*) as count FROM aft_requests WHERE status NOT IN ('completed', 'rejected', 'cancelled')").get() as any;
    
    // Get requests with timeline data
    const requestsWithTimeline = RequestTrackingService.getRequestsWithTimeline({ limit: 50 });

    // Transform requests data for table
    const tableData = requestsWithTimeline.map((request: any) => ({
      id: request.id,
      request_number: request.request_number,
      requestor_name: request.requestor_name,
      status: request.status,
      transfer_type: request.transfer_type || 'Unknown',
      classification: request.classification || 'Unknown',
      created_at: request.created_at,
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
        key: 'classification',
        label: 'Classification',
        render: (value: any, row: any) => `
          <div class="text-xs px-2 py-1 rounded-full bg-[var(--warning)]/10 text-[var(--warning)] border border-[var(--warning)]/20 font-medium text-center">
            ${row.classification}
          </div>
        `
      },
      {
        key: 'status',
        label: 'Status & Progress',
        render: (value: any, row: any) => {
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
          const statusLabel = AFT_STATUS_LABELS[row.status as keyof typeof AFT_STATUS_LABELS] || row.status;
          
          return `
            <div class="space-y-2">
              ${ComponentBuilder.timelineStatusBadge(
                row.status, 
                variant, 
                true, 
                { current: row.current_step, total: row.total_steps }
              )}
              <div class="w-full bg-[var(--muted)] rounded-full h-1.5">
                <div class="bg-[var(--primary)] h-1.5 rounded-full transition-all duration-300" 
                     style="width: ${row.timeline_progress}%"></div>
              </div>
              <div class="text-xs text-[var(--muted-foreground)] font-mono">
                ${row.timeline_progress}% Complete
              </div>
            </div>
          `;
        }
      },
      {
        key: 'created_at',
        label: 'Created',
        render: (value: any, row: any) => `
          <div class="text-sm text-[var(--foreground)]">${new Date(row.created_at * 1000).toLocaleDateString()}</div>
        `
      },
      {
        key: 'actions',
        label: 'Actions',
        render: (value: any, row: any) => {
          const actions: Array<{ label: string; onClick: string; variant: 'primary' | 'secondary' | 'destructive' }> = [
            { label: 'View', onClick: `viewSMERequest(${row.id})`, variant: 'secondary' },
            { label: 'Timeline', onClick: `viewTimeline(${row.id})`, variant: 'secondary' }
          ];

          // Add SME-specific actions based on status
          if (row.status === 'pending_sme_signature') {
            actions.push({ label: 'Sign Request', onClick: `signRequest(${row.id})`, variant: 'primary' });
          }
          
          return ComponentBuilder.tableCellActions(actions);
        }
      }
    ];

    // Create table
    const table = ComponentBuilder.table({
      columns,
      rows: tableData,
      emptyMessage: 'No AFT requests found'
    });

    // Create search component
    const search = ComponentBuilder.tableSearch({
      placeholder: 'Search requests...',
      onSearch: 'filterRequests'
    });

    // Create filters
    const filters = ComponentBuilder.tableFilters({
      filters: [
        {
          key: 'status',
          label: 'All Status',
          options: [
            { value: 'draft', label: 'Draft' },
            { value: 'submitted', label: 'Submitted' },
            { value: 'approved', label: 'Approved' },
            { value: 'rejected', label: 'Rejected' },
            { value: 'completed', label: 'Completed' },
            { value: 'cancelled', label: 'Cancelled' }
          ],
          onChange: 'filterByStatus'
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

    // Create table actions with view toggle
    const viewToggle = ComponentBuilder.viewToggle(viewMode);
    const actions = ComponentBuilder.tableActions({
      primary: {
        label: '+ New Request',
        onClick: 'createRequest()'
      },
      secondary: [
        { label: 'Export All', onClick: 'exportRequests()' },
        { label: 'Import', onClick: 'importRequests()' }
      ]
    });

    // Create timeline view content
    const timelineContent = viewMode === 'timeline' ? this.renderTimelineView(tableData) : '';

    // Create table container with view toggle
    const tableContainer = ComponentBuilder.tableContainer({
      title: 'AFT Requests',
      description: 'Manage and track all Assured File Transfer requests with live status timeline',
      search,
      filters,
      actions: `
        <div class="flex items-center justify-between">
          <div class="flex gap-2">
            ${actions}
          </div>
          ${viewToggle}
        </div>
      `,
      table: viewMode === 'table' ? table : timelineContent
    });

    const content = `
      <div class="space-y-6">
        <!-- Stats Cards -->
        <div class="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div class="bg-[var(--card)] p-4 rounded-lg border border-[var(--border)]">
            <div class="text-2xl font-bold text-[var(--primary)]">${totalRequests?.count || 0}</div>
            <div class="text-sm text-[var(--muted-foreground)]">Total Requests</div>
          </div>
          <div class="bg-[var(--card)] p-4 rounded-lg border border-[var(--border)]">
            <div class="text-2xl font-bold text-[var(--warning)]">${pendingRequests?.count || 0}</div>
            <div class="text-sm text-[var(--muted-foreground)]">Pending Review</div>
          </div>
          <div class="bg-[var(--card)] p-4 rounded-lg border border-[var(--border)]">
            <div class="text-2xl font-bold text-[var(--success)]">${Math.round(((totalRequests?.count || 1) - (pendingRequests?.count || 0)) / (totalRequests?.count || 1) * 100)}%</div>
            <div class="text-sm text-[var(--muted-foreground)]">Completion Rate</div>
          </div>
          <div class="bg-[var(--card)] p-4 rounded-lg border border-[var(--border)]">
            <div class="text-2xl font-bold text-[var(--info)]">${tableData.filter(r => r.created_at > (Date.now() - 86400000) / 1000).length}</div>
            <div class="text-sm text-[var(--muted-foreground)]">Today's Requests</div>
          </div>
        </div>

        ${tableContainer}
      </div>
    `;

    return SMENavigation.renderLayout(
      'Request Management',
      'Manage AFT requests and approvals',
      user,
      '/sme/requests',
      content
    );
  }

  // Render timeline view for requests
  private static renderTimelineView(tableData: any[]): string {
    return `
      <div class="space-y-6">
        ${tableData.map(request => {
          const timelineData = RequestTrackingService.getRequestTimeline(request.id);
          if (!timelineData) return '';
          
          const timeline = ComponentBuilder.timeline({
            steps: timelineData.timeline_steps,
            orientation: 'vertical',
            showTimestamps: true,
            showDuration: true,
            compact: false
          });
          
          return `
            <div class="bg-[var(--card)] border border-[var(--border)] rounded-lg p-6 hover:shadow-md transition-shadow">
              <div class="flex items-start justify-between mb-4">
                <div>
                  <h3 class="text-lg font-semibold text-[var(--foreground)]">${request.request_number}</h3>
                  <p class="text-sm text-[var(--muted-foreground)]">Requestor: ${request.requestor_name}</p>
                  <p class="text-xs text-[var(--muted-foreground)]">Type: ${request.transfer_type} | Classification: ${request.classification}</p>
                </div>
                <div class="flex items-center gap-2">
                  ${ComponentBuilder.timelineStatusBadge(
                    request.status, 
                    request.is_terminal ? 'success' : 'info',
                    true,
                    { current: request.current_step, total: request.total_steps }
                  )}
                  <div class="flex gap-1">
                    <button onclick="viewRequest(${request.id})" class="action-btn secondary" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;">View</button>
                    <button onclick="editRequest(${request.id})" class="action-btn secondary" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;">Edit</button>
                  </div>
                </div>
              </div>
              
              <div class="mb-4">
                ${ComponentBuilder.statusProgress({
                  currentStatus: request.status,
                  allStatuses: timelineData.timeline_steps.map(step => step.id),
                  statusLabels: AFT_STATUS_LABELS
                })}
              </div>
              
              <div class="border-t border-[var(--border)] pt-4">
                ${timeline}
              </div>
            </div>
          `;
        }).filter(Boolean).join('')}
      </div>
    `;
  }

  static getScript(): string {
    return `
      function viewSMERequest(requestId) {
        // Fetch request details and show SME review modal
        fetch('/api/sme/requests/' + requestId)
          .then(response => response.json())
          .then(data => {
            if (data.success) {
              showSMERequestModal(data.request);
            } else {
              alert('Failed to load request details: ' + data.error);
            }
          })
          .catch(error => {
            console.error('Error fetching request:', error);
            alert('Failed to load request details. Please try again.');
          });
      }
      
      function signRequest(requestId) {
        if (confirm('Are you sure you want to sign this request? This action completes the Two-Person Integrity check.')) {
          fetch('/api/sme/requests/' + requestId + '/sign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
          })
          .then(response => response.json())
          .then(data => {
            if (data.success) {
              alert('Request signed successfully!');
              window.location.reload();
            } else {
              alert('Failed to sign request: ' + data.error);
            }
          })
          .catch(error => {
            console.error('Error signing request:', error);
            alert('Failed to sign request. Please try again.');
          });
        }
      }
      
      function viewTimeline(requestId) {
        // Get timeline data for the specific request
        fetch('/api/requests/' + requestId + '/timeline')
          .then(response => response.json())
          .then(data => {
            if (data.success) {
              showTimelineModal(data.request, data.timeline);
            } else {
              alert('Failed to load timeline data: ' + data.error);
            }
          })
          .catch(error => {
            console.error('Error fetching timeline:', error);
            alert('Failed to load timeline data. Please try again.');
          });
      }
    `;
  }
}