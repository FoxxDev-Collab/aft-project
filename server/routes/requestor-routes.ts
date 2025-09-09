// Requestor page routes
import { getDb, UserRole } from "../../lib/database-bun";
import { RoleMiddleware } from "../../middleware/role-middleware";
import { RequestorDashboard } from "../../requestor/dashboard";
import { RequestorRequests } from "../../requestor/requests";
import { RequestWizard } from "../../requestor/request-wizard";
import { createHtmlPage } from "../utils";

const db = getDb();

// Requestor Routes Handler
export async function handleRequestorRoutes(request: Request, path: string): Promise<Response> {
  const authResult = await RoleMiddleware.checkAuthAndRole(request, UserRole.REQUESTOR);
  if (authResult.response) return authResult.response;
  
  const user = { 
    email: authResult.session.email, 
    role: authResult.session.activeRole || authResult.session.primaryRole 
  };
  
  switch (path) {
    case '/requestor':
      const dashboardHtml = await RequestorDashboard.render(user, authResult.session.userId);
      return new Response(createHtmlPage(
        "AFT - Requestor Dashboard",
        dashboardHtml,
        RequestorDashboard.getScript()
      ), {
        headers: { "Content-Type": "text/html" }
      });

    case '/requestor/requests':
      const requestsUrl = new URL(request.url);
      const viewMode = (requestsUrl.searchParams.get('view') as 'table' | 'timeline') || 'table';
      const requestsHtml = await RequestorRequests.renderRequestsPage(user, authResult.session.userId, viewMode);
      return new Response(createHtmlPage(
        "AFT - My Requests",
        requestsHtml,
        RequestorRequests.getScript()
      ), {
        headers: { "Content-Type": "text/html" }
      });

    case '/requestor/new-request':
      const url = new URL(request.url);
      const draftId = url.searchParams.get('draft') ? parseInt(url.searchParams.get('draft')!) : undefined;
      const wizardHtml = await RequestWizard.render(user, authResult.session.userId, draftId);
      return new Response(createHtmlPage(
        "AFT - New Request",
        wizardHtml,
        RequestWizard.getScript()
      ), {
        headers: { "Content-Type": "text/html" }
      });

    default:
      // Handle individual request routes like /requestor/requests/123
      if (path.startsWith('/requestor/requests/')) {
        const requestId = path.split('/')[3];
        if (requestId && !isNaN(parseInt(requestId))) {
          return await handleRequestDetailPage(request, parseInt(requestId), user, authResult.session.userId);
        }
      }
      return Response.redirect("/requestor", 302);
  }
}

// Handle individual request detail page
export async function handleRequestDetailPage(request: Request, requestId: number, user: any, userId: number): Promise<Response> {
  // Get request details - ensure requestor can only view their own requests
  const requestData = db.query(`
    SELECT ar.*, u.first_name || ' ' || u.last_name as requestor_name
    FROM aft_requests ar
    LEFT JOIN users u ON ar.requestor_id = u.id
    WHERE ar.id = ? AND ar.requestor_id = ?
  `).get(requestId, userId) as any;
  
  if (!requestData) {
    return new Response("Request not found or access denied", { status: 404 });
  }
  
  // Get timeline data
  const { RequestTrackingService } = await import('../../lib/request-tracking');
  const timelineData = RequestTrackingService.getRequestTimeline(requestId);
  
  // Parse files list
  let files = [];
  try {
    files = JSON.parse(requestData.files_list || '[]');
  } catch (e) {
    files = [];
  }
  
  const canSubmit = requestData.status === 'draft';
  const canEdit = ['draft', 'submitted'].includes(requestData.status);
  
  const detailHtml = `
    <div class="min-h-screen bg-[var(--background)]">
      <div class="container mx-auto px-4 py-8">
        <div class="mb-6">
          <div class="flex items-center gap-2 mb-4">
            <a href="/requestor/requests" class="text-[var(--primary)] hover:underline">← Back to My Requests</a>
          </div>
          <h1 class="text-3xl font-bold text-[var(--foreground)]">Request Details</h1>
          <p class="text-[var(--muted-foreground)]">Request #${requestData.request_number}</p>
        </div>
        
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <!-- Main Content -->
          <div class="lg:col-span-2 space-y-6">
            <!-- Request Information -->
            <div class="bg-[var(--card)] border border-[var(--border)] rounded-lg p-6">
              <h2 class="text-xl font-semibold mb-4">Request Information</h2>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label class="text-sm font-medium text-[var(--muted-foreground)]">Transfer Type</label>
                  <div class="text-[var(--foreground)]">${requestData.transfer_type || 'Not specified'}</div>
                </div>
                <div>
                  <label class="text-sm font-medium text-[var(--muted-foreground)]">Classification</label>
                  <div class="text-[var(--foreground)]">${requestData.classification || 'Not specified'}</div>
                </div>
                <div>
                  <label class="text-sm font-medium text-[var(--muted-foreground)]">Source System</label>
                  <div class="text-[var(--foreground)]">${requestData.source_system || 'Not specified'}</div>
                </div>
                <div>
                  <label class="text-sm font-medium text-[var(--muted-foreground)]">Destination System</label>
                  <div class="text-[var(--foreground)]">${requestData.dest_system || 'Not specified'}</div>
                </div>
                <div class="md:col-span-2">
                  <label class="text-sm font-medium text-[var(--muted-foreground)]">Transfer Purpose</label>
                  <div class="text-[var(--foreground)]">${requestData.transfer_purpose || 'Not specified'}</div>
                </div>
              </div>
            </div>
            
            <!-- Files List -->
            <div class="bg-[var(--card)] border border-[var(--border)] rounded-lg p-6">
              <h2 class="text-xl font-semibold mb-4">Files to Transfer</h2>
              ${files.length > 0 ? `
                <div class="space-y-2">
                  ${files.map((file: any) => `
                    <div class="flex items-center justify-between p-3 bg-[var(--muted)] rounded">
                      <div>
                        <div class="font-medium">${file.name}</div>
                        <div class="text-sm text-[var(--muted-foreground)]">${file.size || 'Size not specified'}</div>
                      </div>
                      <div class="text-sm text-[var(--muted-foreground)]">${file.classification || 'No classification'}</div>
                    </div>
                  `).join('')}
                </div>
              ` : '<p class="text-[var(--muted-foreground)]">No files specified</p>'}
            </div>
            
            ${canSubmit ? `
            <!-- Submission Section -->
            <div class="bg-[var(--card)] border border-[var(--border)] rounded-lg p-6">
              <h2 class="text-xl font-semibold mb-4">Submit Request</h2>
              <div class="space-y-4">
                <div class="p-4 bg-[var(--muted)] rounded-lg">
                  <h3 class="font-medium mb-2">Certification Statement</h3>
                  <p class="text-sm text-[var(--muted-foreground)]">
                    I certify that the above file(s)/media to be transferred to/from the IS are required to support 
                    the development and sustainment contractual efforts on the ACDS contract.
                  </p>
                </div>
                <div class="flex items-center gap-2">
                  <input type="checkbox" id="certify-checkbox" class="rounded">
                  <label for="certify-checkbox" class="text-sm">I agree to the certification statement above</label>
                </div>
                <button 
                  onclick="submitRequest(${requestId})" 
                  id="submit-btn"
                  disabled
                  class="action-btn primary disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Submit Request for Review
                </button>
              </div>
            </div>
            ` : ''}
          </div>
          
          <!-- Sidebar -->
          <div class="space-y-6">
            <!-- Status Card -->
            <div class="bg-[var(--card)] border border-[var(--border)] rounded-lg p-6">
              <h2 class="text-xl font-semibold mb-4">Status</h2>
              <div class="space-y-3">
                <div class="flex items-center justify-between">
                  <span class="text-sm text-[var(--muted-foreground)]">Current Status</span>
                  <span class="px-2 py-1 rounded text-xs font-medium bg-[var(--muted)] text-[var(--muted-foreground)]">
                    ${requestData.status.replace('_', ' ').toUpperCase()}
                  </span>
                </div>
                <div class="flex items-center justify-between">
                  <span class="text-sm text-[var(--muted-foreground)]">Created</span>
                  <span class="text-sm">${new Date(requestData.created_at * 1000).toLocaleDateString()}</span>
                </div>
                <div class="flex items-center justify-between">
                  <span class="text-sm text-[var(--muted-foreground)]">Last Updated</span>
                  <span class="text-sm">${new Date(requestData.updated_at * 1000).toLocaleDateString()}</span>
                </div>
              </div>
            </div>
            
            <!-- Actions -->
            <div class="bg-[var(--card)] border border-[var(--border)] rounded-lg p-6">
              <h2 class="text-xl font-semibold mb-4">Actions</h2>
              <div class="space-y-2">
                ${canEdit ? `<button onclick="editRequest(${requestId})" class="w-full action-btn secondary">Edit Request</button>` : ''}
                <button onclick="viewTimeline(${requestId})" class="w-full action-btn secondary">View Timeline</button>
                <button onclick="window.print()" class="w-full action-btn secondary">Print Request</button>
              </div>
            </div>
            
            ${timelineData ? `
            <!-- Timeline Summary -->
            <div class="bg-[var(--card)] border border-[var(--border)] rounded-lg p-6">
              <h2 class="text-xl font-semibold mb-4">Timeline Progress</h2>
              <div class="space-y-2">
                ${timelineData.timeline_steps.slice(0, 3).map(step => `
                  <div class="flex items-center gap-2">
                    <div class="w-4 h-4 rounded-full flex items-center justify-center text-xs ${
                      step.status === 'completed' ? 'bg-[var(--success)] text-white' :
                      step.status === 'current' ? 'bg-[var(--primary)] text-white' :
                      'bg-[var(--muted)] text-[var(--muted-foreground)]'
                    }">
                      ${step.status === 'completed' ? '✓' : step.status === 'current' ? '●' : '○'}
                    </div>
                    <span class="text-sm">${step.title}</span>
                  </div>
                `).join('')}
                ${timelineData.timeline_steps.length > 3 ? `
                  <button onclick="viewTimeline(${requestId})" class="text-xs text-[var(--primary)] hover:underline">
                    View all ${timelineData.timeline_steps.length} steps
                  </button>
                ` : ''}
              </div>
            </div>
            ` : ''}
          </div>
        </div>
      </div>
    </div>
  `;
  
  const script = `
    // Enable submit button when checkbox is checked
    const checkbox = document.getElementById('certify-checkbox');
    const submitBtn = document.getElementById('submit-btn');
    
    if (checkbox && submitBtn) {
      checkbox.addEventListener('change', function() {
        submitBtn.disabled = !this.checked;
      });
    }
    
    function submitRequest(requestId) {
      if (!document.getElementById('certify-checkbox').checked) {
        alert('Please certify the request before submitting.');
        return;
      }
      
      const signature = {
        timestamp: Date.now(),
        userAgent: navigator.userAgent
      };
      
      fetch('/api/requestor/submit-request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          requestId: requestId,
          signature: signature
        })
      })
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          alert('Request submitted successfully! It is now pending ISSM/ISSO review.');
          window.location.reload();
        } else {
          alert('Failed to submit request: ' + data.message);
        }
      })
      .catch(error => {
        console.error('Error submitting request:', error);
        alert('Failed to submit request. Please try again.');
      });
    }
    
    function editRequest(requestId) {
      window.location.href = '/requestor/new-request?draft=' + requestId;
    }
    
    function viewTimeline(requestId) {
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
      const modalBackdrop = document.createElement('div');
      modalBackdrop.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
      modalBackdrop.onclick = (e) => {
        if (e.target === modalBackdrop) {
          document.body.removeChild(modalBackdrop);
        }
      };
      
      const modalContent = document.createElement('div');
      modalContent.className = 'bg-[var(--background)] rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden';
      
      const timelineHtml = \`
        <div class="p-6">
          <div class="flex items-center justify-between mb-6">
            <div>
              <h2 class="text-2xl font-bold text-[var(--foreground)]">Request Timeline</h2>
              <p class="text-[var(--muted-foreground)]">Request #\${request.request_number}</p>
            </div>
            <button onclick="this.closest('.fixed').remove()" class="text-[var(--muted-foreground)] hover:text-[var(--foreground)] text-2xl font-bold">&times;</button>
          </div>
          
          <div class="max-h-[60vh] overflow-y-auto">
            <div class="space-y-4">
              \${timelineData.timeline_steps.map((step, index) => \`
                <div class="flex items-start space-x-4 pb-4 \${index < timelineData.timeline_steps.length - 1 ? 'border-b border-[var(--border)]' : ''}">
                  <div class="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium \${
                    step.status === 'completed' ? 'bg-[var(--success)] text-white' :
                    step.status === 'current' ? 'bg-[var(--primary)] text-white' :
                    'bg-[var(--muted)] text-[var(--muted-foreground)]'
                  }">
                    \${step.status === 'completed' ? '✓' : step.status === 'current' ? '●' : '○'}
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center justify-between">
                      <h4 class="text-sm font-medium text-[var(--foreground)]">\${step.title}</h4>
                      \${step.timestamp ? \`<time class="text-xs text-[var(--muted-foreground)]">\${new Date(step.timestamp * 1000).toLocaleString()}</time>\` : ''}
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
  `;
  
  return new Response(createHtmlPage(
    `AFT - Request #${requestData.request_number}`,
    detailHtml,
    script
  ), {
    headers: { "Content-Type": "text/html" }
  });
}
