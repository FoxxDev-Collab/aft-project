// Requestor Requests Management Interface
import { ComponentBuilder } from "../components/ui/server-components";
import { getDb } from "../lib/database-bun";
import { RequestorNavigation, type RequestorUser } from "./requestor-nav";
import { RequestTrackingService } from "../lib/request-tracking";
import { AFT_STATUS_LABELS } from "../lib/database-bun";

export class RequestorRequests {
  
  static async renderRequestsPage(user: RequestorUser, userId: number, viewMode: 'table' | 'timeline' = 'table'): Promise<string> {
    const db = getDb();
    
    // Get request statistics for this requestor only
    const totalRequests = db.query("SELECT COUNT(*) as count FROM aft_requests WHERE requestor_id = ?").get(userId) as any;
    const pendingRequests = db.query("SELECT COUNT(*) as count FROM aft_requests WHERE requestor_id = ? AND status NOT IN ('completed', 'rejected', 'cancelled')").get(userId) as any;
    
    // Get requests with timeline data for this requestor
    const requestsWithTimeline = RequestTrackingService.getRequestsWithTimeline({ requestor_id: userId, limit: 50 });

    // Transform requests data for table
    const tableData = requestsWithTimeline.map((request: any) => ({
      id: request.id,
      request_number: request.request_number,
      requestor_name: request.requestor_name,
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
        key: 'updated_at',
        label: 'Last Updated',
        render: (_value: any, row: any) => {
          const ts = row.updated_at || row.created_at;
          return `
            <div class="text-sm text-[var(--foreground)]">${ts ? new Date(ts * 1000).toLocaleDateString() : '-'}</div>
          `;
        }
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
        render: (_value: any, row: any) => `
          <div class="text-sm text-[var(--foreground)]">${new Date(row.created_at * 1000).toLocaleDateString()}</div>
        `
      },
      {
        key: 'actions',
        label: 'Actions',
        render: (_value: any, row: any) => {
          const canEdit = ['draft', 'submitted'].includes(row.status);
          const actions: Array<{ label: string; onClick: string; variant: 'secondary' | 'primary' | 'destructive' }> = [
            { label: 'View', onClick: `viewRequest(${row.id})`, variant: 'secondary' },
            { label: 'Timeline', onClick: `viewTimeline(${row.id})`, variant: 'secondary' }
          ];
          if (canEdit) {
            actions.push({ label: 'Edit', onClick: `editRequest(${row.id})`, variant: 'secondary' });
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
        { label: 'Export My Requests', onClick: 'exportRequests()' }
      ]
    });

    // Create timeline view content
    const timelineContent = viewMode === 'timeline' ? this.renderTimelineView(tableData) : '';

    // Create table container with view toggle
    const tableContainer = ComponentBuilder.tableContainer({
      title: 'My AFT Requests',
      description: 'View and manage your Assured File Transfer requests with live status timeline',
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

    return `
      ${RequestorNavigation.renderPageHeader('My Requests', 'View and manage your AFT requests', user, '/requestor/requests')}
      
      <div class="max-w-7xl mx-auto px-3 sm:px-5 lg:px-6 py-6">
        <div class="space-y-6">
          <!-- Stats Cards -->
          <div class="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div class="bg-[var(--card)] p-4 rounded-lg border border-[var(--border)]">
              <div class="text-2xl font-bold text-[var(--primary)]">${totalRequests?.count || 0}</div>
              <div class="text-sm text-[var(--muted-foreground)]">My Requests</div>
            </div>
            <div class="bg-[var(--card)] p-4 rounded-lg border border-[var(--border)]">
              <div class="text-2xl font-bold text-[var(--warning)]">${pendingRequests?.count || 0}</div>
              <div class="text-sm text-[var(--muted-foreground)]">Pending Review</div>
            </div>
            <div class="bg-[var(--card)] p-4 rounded-lg border border-[var(--border)]">
              <div class="text-2xl font-bold text-[var(--success)]">${Math.round(((totalRequests?.count || 1) - (pendingRequests?.count || 0)) / (totalRequests?.count || 1) * 100)}%</div>
              <div class="text-sm text-[var(--muted-foreground)]">Success Rate</div>
            </div>
            <div class="bg-[var(--card)] p-4 rounded-lg border border-[var(--border)]">
              <div class="text-2xl font-bold text-[var(--info)]">${tableData.filter(r => r.created_at > (Date.now() - 86400000) / 1000).length}</div>
              <div class="text-sm text-[var(--muted-foreground)]">Today's Requests</div>
            </div>
          </div>

          ${tableContainer}
        </div>
      </div>
    `;
  }

  // Render timeline view for requests
  private static renderTimelineView(tableData: any[]): string {
    return `
      <div class="space-y-4">
        ${tableData.map(request => {
          const timelineData = RequestTrackingService.getRequestTimeline(request.id);
          if (!timelineData) return '';
          
          const currentStep = timelineData.timeline_steps.find(step => step.status === 'current');
          const completedSteps = timelineData.timeline_steps.filter(step => step.status === 'completed').length;
          const totalSteps = timelineData.timeline_steps.length;
          
          return `
            <div class="bg-[var(--card)] border border-[var(--border)] rounded-lg p-4 hover:shadow-md transition-shadow">
              <div class="flex items-start justify-between mb-3">
                <div>
                  <h3 class="text-lg font-semibold text-[var(--foreground)]">${request.request_number}</h3>
                  <p class="text-sm text-[var(--muted-foreground)]">Type: ${request.transfer_type} | Classification: ${request.classification}</p>
                  <p class="text-xs text-[var(--muted-foreground)]">Created: ${new Date(request.created_at * 1000).toLocaleDateString()}</p>
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
                    <button onclick="viewTimeline(${request.id})" class="action-btn secondary" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;">Timeline</button>
                    ${['draft', 'submitted'].includes(request.status) ? 
                      `<button onclick="editRequest(${request.id})" class="action-btn secondary" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;">Edit</button>` : 
                      ''
                    }
                  </div>
                </div>
              </div>
              
              <div class="mb-3">
                ${ComponentBuilder.statusProgress({
                  currentStatus: request.status,
                  allStatuses: timelineData.timeline_steps.map(step => step.id),
                  statusLabels: AFT_STATUS_LABELS
                })}
              </div>
              
              <!-- Compact Timeline Summary -->
              <div class="border border-[var(--border)] rounded-lg">
                <button 
                  onclick="toggleTimelineDetails('timeline-${request.id}')" 
                  class="w-full flex items-center justify-between p-3 text-left hover:bg-[var(--muted)] transition-colors"
                >
                  <div class="flex items-center gap-3">
                    <div class="text-sm font-medium text-[var(--foreground)]">
                      Timeline Details (${completedSteps}/${totalSteps} steps completed)
                    </div>
                    ${currentStep ? `<div class="text-xs text-[var(--muted-foreground)]">Current: ${currentStep.title}</div>` : ''}
                  </div>
                  <svg class="w-4 h-4 text-[var(--muted-foreground)] timeline-chevron" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                  </svg>
                </button>
                
                <div id="timeline-${request.id}" class="timeline-details hidden border-t border-[var(--border)] p-3 bg-[var(--muted)]/30">
                  ${ComponentBuilder.timeline({
                    steps: timelineData.timeline_steps,
                    orientation: 'vertical',
                    showTimestamps: true,
                    showDuration: false,
                    compact: true
                  })}
                </div>
              </div>
            </div>
          `;
        }).filter(Boolean).join('')}
      </div>
    `;
  }

  static getScript(): string {
    return `
      function createRequest() {
        window.location.href = '/requestor/new-request';
      }
      
      function viewRequest(requestId) {
        window.location.href = '/requestor/requests/' + requestId;
      }
      
      function editRequest(requestId) {
        window.location.href = '/requestor/requests/' + requestId + '/edit';
      }
      
      function exportRequests() {
        alert('Export functionality will be implemented soon');
      }
      
      function viewTimeline(requestId) {
        // Get timeline data for the specific request
        fetch(\`/api/requests/\${requestId}/timeline\`)
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
      
      function showTimelineModal(request, timelineData) {
        // Create modal backdrop
        const modalBackdrop = document.createElement('div');
        modalBackdrop.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
        modalBackdrop.onclick = (e) => {
          if (e.target === modalBackdrop) {
            document.body.removeChild(modalBackdrop);
          }
        };
        
        // Create modal content
        const modalContent = document.createElement('div');
        modalContent.className = 'bg-[var(--background)] rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden';
        
        // Generate timeline HTML using existing components
        const timelineHtml = \`
          <div class="p-6">
            <div class="flex items-center justify-between mb-6">
              <div>
                <h2 class="text-2xl font-bold text-[var(--foreground)]">Request Timeline</h2>
                <p class="text-[var(--muted-foreground)]">Request #\${request.request_number}</p>
              </div>
              <button onclick="this.closest('.fixed').remove()" class="text-[var(--muted-foreground)] hover:text-[var(--foreground)] text-2xl font-bold">&times;</button>
            </div>
            
            <div class="mb-6 p-4 bg-[var(--muted)] rounded-lg">
              <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span class="font-medium text-[var(--muted-foreground)]">Requestor:</span>
                  <div class="text-[var(--foreground)]">\${request.requestor_name}</div>
                </div>
                <div>
                  <span class="font-medium text-[var(--muted-foreground)]">Status:</span>
                  <div class="text-[var(--foreground)]">\${request.status.replace('_', ' ').toUpperCase()}</div>
                </div>
                <div>
                  <span class="font-medium text-[var(--muted-foreground)]">Transfer Type:</span>
                  <div class="text-[var(--foreground)]">\${request.transfer_type || 'Unknown'}</div>
                </div>
                <div>
                  <span class="font-medium text-[var(--muted-foreground)]">Created:</span>
                  <div class="text-[var(--foreground)]">\${new Date(request.created_at * 1000).toLocaleDateString()}</div>
                </div>
              </div>
            </div>
            
            <div class="max-h-[60vh] overflow-y-auto">
              <div class="space-y-4">
                \${timelineData.timeline_steps.map((step, index) => \`
                  <div class="flex items-start space-x-4 pb-4 \${index < timelineData.timeline_steps.length - 1 ? 'border-b border-[var(--border)]' : ''}">
                    <div class="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium \${getStepStatusClasses(step.status)}">
                      \${getStepStatusIcon(step.status)}
                    </div>
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center justify-between">
                        <h4 class="text-sm font-medium text-[var(--foreground)]">\${step.title}</h4>
                        \${step.timestamp ? \`<time class="text-xs text-[var(--muted-foreground)]">\${formatTimestamp(step.timestamp)}</time>\` : ''}
                      </div>
                      \${step.description ? \`<p class="text-sm text-[var(--muted-foreground)] mt-1">\${step.description}</p>\` : ''}
                      \${step.assignedTo ? \`<p class="text-xs text-[var(--muted-foreground)] mt-1">Assigned to: \${step.assignedTo}</p>\` : ''}
                      \${step.notes ? \`<p class="text-xs text-[var(--muted-foreground)] mt-2 p-2 bg-[var(--muted)] rounded">\${step.notes}</p>\` : ''}
                    </div>
                  </div>
                \`).join('')}
              </div>
            </div>
          </div>
        \`;
        
        modalContent.innerHTML = timelineHtml;
        modalBackdrop.appendChild(modalContent);
        document.body.appendChild(modalBackdrop);
      }
      
      function getStepStatusClasses(status) {
        const classes = {
          'completed': 'bg-[var(--success)] text-white',
          'current': 'bg-[var(--primary)] text-white',
          'pending': 'bg-[var(--muted)] text-[var(--muted-foreground)]',
          'skipped': 'bg-[var(--warning)] text-white',
          'error': 'bg-[var(--destructive)] text-white'
        };
        return classes[status] || classes.pending;
      }
      
      function getStepStatusIcon(status) {
        const icons = {
          'completed': '✓',
          'current': '●',
          'pending': '○',
          'skipped': '⊘',
          'error': '✗'
        };
        return icons[status] || icons.pending;
      }
      
      function formatTimestamp(timestamp) {
        const date = new Date(timestamp * 1000);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        
        if (diffDays === 0) {
          return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } else if (diffDays === 1) {
          return 'Yesterday at ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } else if (diffDays < 7) {
          return \`\${diffDays} days ago\`;
        } else {
          return date.toLocaleDateString() + ' at ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
      }
      
      function toggleView(newView) {
        const url = new URL(window.location);
        url.searchParams.set('view', newView);
        window.location.href = url.toString();
      }
      
      function switchView(newView) {
        const url = new URL(window.location);
        url.searchParams.set('view', newView);
        window.location.href = url.toString();
      }
      
      function toggleTimelineDetails(timelineId) {
        const timelineElement = document.getElementById(timelineId);
        const chevron = timelineElement.previousElementSibling.querySelector('.timeline-chevron');
        
        if (timelineElement.classList.contains('hidden')) {
          timelineElement.classList.remove('hidden');
          chevron.style.transform = 'rotate(180deg)';
        } else {
          timelineElement.classList.add('hidden');
          chevron.style.transform = 'rotate(0deg)';
        }
      }
      
      function filterByStatus(status) {
        const url = new URL(window.location);
        if (status) {
          url.searchParams.set('status', status);
        } else {
          url.searchParams.delete('status');
        }
        window.location.href = url.toString();
      }
      
      function filterByType(type) {
        const url = new URL(window.location);
        if (type) {
          url.searchParams.set('type', type);
        } else {
          url.searchParams.delete('type');
        }
        window.location.href = url.toString();
      }
      
      function searchRequests(query) {
        const url = new URL(window.location);
        if (query) {
          url.searchParams.set('search', query);
        } else {
          url.searchParams.delete('search');
        }
        window.location.href = url.toString();
      }
    `;
  }
}