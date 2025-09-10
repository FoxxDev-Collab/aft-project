// Media Custodian Routes - Handle all media custodian-related requests
import { MediaCustodianDashboard } from '../../media-custodian/dashboard';
import { MediaCustodianRequests } from '../../media-custodian/requests';
import { MediaCustodianInventory } from '../../media-custodian/inventory';
import { MediaCustodianAPI } from '../api/media-custodian-api';
import { getDb } from '../../lib/database-bun';
import { createHtmlPage } from '../utils';

// Export handler function for main server
export async function handleMediaCustodianRoutes(request: Request, path: string, ipAddress: string): Promise<Response> {
  // Extract user from session/auth
  const user = { id: 1, email: 'media-custodian@aft.gov', role: 'media-custodian' }; // TODO: Get from auth
  
  if (path === '/media-custodian' || path === '/media-custodian/') {
    return MediaCustodianRoutes.handleDashboard(request, user);
  } else if (path === '/media-custodian/requests') {
    return MediaCustodianRoutes.handleRequestsPage(request, user);
  } else if (path.match(/^\/media-custodian\/requests\/(\d+)$/)) {
    const requestId = path.split('/').pop()!;
    return MediaCustodianRoutes.handleRequestDetailPage(request, user, requestId);
  } else if (path === '/media-custodian/inventory') {
    return MediaCustodianRoutes.handleInventory(request, user);
  } else if (path === '/media-custodian/reports') {
    return MediaCustodianRoutes.handleReportsPage(request, user);
  } else if (path === '/media-custodian/help') {
    return MediaCustodianRoutes.handleHelpPage(request, user);
  } else if (path.startsWith('/media-custodian/api/')) {
    const endpoint = path.replace('/media-custodian/api/', '');
    return MediaCustodianRoutes.handleAPI(request, user, endpoint);
  }
  
  return new Response('Not Found', { status: 404 });
}

export class MediaCustodianRoutes {
  
  // Dashboard route
  static async handleDashboard(request: Request, user: any): Promise<Response> {
    try {
      const content = await MediaCustodianDashboard.render(user, user.id);
      const script = MediaCustodianDashboard.getScript();
      
      return new Response(createHtmlPage(
        "AFT Media Custodian - Dashboard",
        content,
        script
      ), {
        headers: { 'Content-Type': 'text/html' }
      });
    } catch (error) {
      console.error('Error rendering media custodian dashboard:', error);
      return new Response('Internal Server Error', { status: 500 });
    }
  }
  
  // Inventory route
  static async handleInventory(request: Request, user: any): Promise<Response> {
    try {
      const content = await MediaCustodianInventory.render(user, user.id);
      const script = MediaCustodianInventory.getScript();
      
      return new Response(createHtmlPage(
        "AFT Media Custodian - Media Inventory",
        content,
        script
      ), {
        headers: { 'Content-Type': 'text/html' }
      });
    } catch (error) {
      console.error('Error rendering media custodian inventory:', error);
      return new Response('Internal Server Error', { status: 500 });
    }
  }
  
  // All requests page
  static async handleRequestsPage(request: Request, user: any): Promise<Response> {
    try {
      const url = new URL(request.url);
      const viewMode = url.searchParams.get('view') as 'table' | 'timeline' || 'table';
      
      const content = await MediaCustodianRequests.renderRequestsPage(user, user.id, viewMode);
      const script = MediaCustodianRequests.getScript();
      
      return new Response(createHtmlPage(
        "AFT Media Custodian - All Requests",
        content,
        script
      ), {
        headers: { 'Content-Type': 'text/html' }
      });
    } catch (error) {
      console.error('Error rendering media custodian requests page:', error);
      return new Response('Internal Server Error', { status: 500 });
    }
  }
  
  // Individual request detail page
  static async handleRequestDetailPage(request: Request, user: any, requestId: string): Promise<Response> {
    try {
      const id = parseInt(requestId);
      if (isNaN(id)) {
        return new Response('Invalid request ID', { status: 400 });
      }
      
      const content = await MediaCustodianRequests.renderRequestDetail(user, id);
      const script = MediaCustodianRequests.getScript();
      
      return new Response(createHtmlPage(
        "AFT Media Custodian - Request Details",
        content,
        script
      ), {
        headers: { 'Content-Type': 'text/html' }
      });
    } catch (error) {
      console.error('Error rendering request detail page:', error);
      return new Response('Internal Server Error', { status: 500 });
    }
  }
    
  // Reports page (placeholder)
  static async handleReportsPage(request: Request, user: any): Promise<Response> {
    try {
      const stats = await MediaCustodianAPI.getRequestStats();
      
      const content = `
        <div class="max-w-7xl mx-auto px-3 sm:px-5 lg:px-6 py-6">
          <div class="space-y-6">
            <div class="bg-[var(--card)] rounded-lg border border-[var(--border)] p-6">
              <h2 class="text-2xl font-bold text-[var(--foreground)] mb-4">Reports & Analytics</h2>
              <p class="text-[var(--muted-foreground)] mb-6">System statistics and reporting tools</p>
              
              <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                <div class="bg-[var(--muted)] p-4 rounded-lg text-center">
                  <div class="text-2xl font-bold text-[var(--foreground)]">${stats.total}</div>
                  <div class="text-sm text-[var(--muted-foreground)]">Total Requests</div>
                </div>
                <div class="bg-[var(--muted)] p-4 rounded-lg text-center">
                  <div class="text-2xl font-bold text-[var(--warning)]">${stats.pending}</div>
                  <div class="text-sm text-[var(--muted-foreground)]">Pending</div>
                </div>
                <div class="bg-[var(--muted)] p-4 rounded-lg text-center">
                  <div class="text-2xl font-bold text-[var(--success)]">${stats.completed}</div>
                  <div class="text-sm text-[var(--muted-foreground)]">Completed</div>
                </div>
                <div class="bg-[var(--muted)] p-4 rounded-lg text-center">
                  <div class="text-2xl font-bold text-[var(--info)]">${stats.recentActivity}</div>
                  <div class="text-sm text-[var(--muted-foreground)]">Last 30 Days</div>
                </div>
              </div>
              
              <div class="space-y-4">
                <h3 class="text-lg font-semibold text-[var(--foreground)]">Available Reports</h3>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <button onclick="generateReport('activity')" 
                          class="p-4 text-left bg-[var(--muted)] hover:bg-[var(--muted)]/80 rounded-lg transition-colors">
                    <h4 class="font-medium text-[var(--foreground)]">Activity Report</h4>
                    <p class="text-sm text-[var(--muted-foreground)]">Daily activity and submission trends</p>
                  </button>
                  <button onclick="generateReport('status')" 
                          class="p-4 text-left bg-[var(--muted)] hover:bg-[var(--muted)]/80 rounded-lg transition-colors">
                    <h4 class="font-medium text-[var(--foreground)]">Status Breakdown</h4>
                    <p class="text-sm text-[var(--muted-foreground)]">Requests by current status</p>
                  </button>
                  <button onclick="generateReport('classification')" 
                          class="p-4 text-left bg-[var(--muted)] hover:bg-[var(--muted)]/80 rounded-lg transition-colors">
                    <h4 class="font-medium text-[var(--foreground)]">Classification Report</h4>
                    <p class="text-sm text-[var(--muted-foreground)]">Breakdown by classification level</p>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
      
      return new Response(createHtmlPage(
        "AFT Media Custodian - Reports",
        content,
        `function generateReport(type) {
          alert('Generating ' + type + ' report... This feature will be fully implemented in future updates.');
        }`
      ), {
        headers: { 'Content-Type': 'text/html' }
      });
    } catch (error) {
      console.error('Error rendering reports page:', error);
      return new Response('Internal Server Error', { status: 500 });
    }
  }
  
  // Help page (placeholder)
  static async handleHelpPage(request: Request, user: any): Promise<Response> {
    const content = `
      <div class="max-w-4xl mx-auto px-3 sm:px-5 lg:px-6 py-6">
        <div class="space-y-6">
          <div class="bg-[var(--card)] rounded-lg border border-[var(--border)] p-6">
            <h2 class="text-2xl font-bold text-[var(--foreground)] mb-4">Media Custodian Help</h2>
            <p class="text-[var(--muted-foreground)] mb-6">Guide for media custodian operations</p>
            
            <div class="space-y-6">
              <div>
                <h3 class="text-lg font-semibold text-[var(--foreground)] mb-2">Request Processing</h3>
                <ul class="list-disc list-inside text-[var(--muted-foreground)] space-y-1">
                  <li>Review submitted requests for completeness and compliance</li>
                  <li>Approve or reject requests based on security policies</li>
                  <li>Track request progress through the approval workflow</li>
                  <li>Coordinate with requestors for any required clarifications</li>
                </ul>
              </div>
              
              <div>
                <h3 class="text-lg font-semibold text-[var(--foreground)] mb-2">Media Management</h3>
                <ul class="list-disc list-inside text-[var(--muted-foreground)] space-y-1">
                  <li>Maintain inventory of approved transfer media</li>
                  <li>Ensure proper sanitization and disposal procedures</li>
                  <li>Track media usage and lifecycle</li>
                  <li>Coordinate physical media transfers</li>
                </ul>
              </div>
              
              <div>
                <h3 class="text-lg font-semibold text-[var(--foreground)] mb-2">Reporting</h3>
                <ul class="list-disc list-inside text-[var(--muted-foreground)] space-y-1">
                  <li>Generate activity reports for management review</li>
                  <li>Monitor system usage and trends</li>
                  <li>Track compliance metrics</li>
                  <li>Export data for external reporting requirements</li>
                </ul>
              </div>
              
              <div class="bg-[var(--muted)] p-4 rounded-lg">
                <h4 class="font-medium text-[var(--foreground)] mb-2">Support Contact</h4>
                <p class="text-sm text-[var(--muted-foreground)]">
                  For technical support or policy questions:<br>
                  Email: aft-support@domain.mil<br>
                  Phone: (555) 123-4567<br>
                  Hours: Mon-Fri 8AM-5PM EST
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    
    return new Response(createHtmlPage(
      "AFT Media Custodian - Help",
      content
    ), {
      headers: { 'Content-Type': 'text/html' }
    });
  }
  
  // API endpoints for media custodian operations
  static async handleAPI(request: Request, user: any, endpoint: string): Promise<Response> {
    try {
      const method = request.method;
      const url = new URL(request.url);
      
      switch (endpoint) {
        case 'requests':
          if (method === 'GET') {
            const query = Object.fromEntries(url.searchParams.entries());
            const requests = await MediaCustodianAPI.getAllRequests(query);
            return new Response(JSON.stringify(requests), {
              headers: { 'Content-Type': 'application/json' }
            });
          }
          break;
          
        case 'stats':
          if (method === 'GET') {
            const stats = await MediaCustodianAPI.getRequestStats();
            return new Response(JSON.stringify(stats), {
              headers: { 'Content-Type': 'application/json' }
            });
          }
          break;
          
        case 'process':
          if (method === 'POST') {
            const body = await request.json() as {
              requestId: number;
              action: string;
              notes?: string;
            };
            const result = await MediaCustodianAPI.processRequest(
              body.requestId, 
              body.action, 
              user.id, 
              body.notes
            );
            return new Response(JSON.stringify(result), {
              headers: { 'Content-Type': 'application/json' }
            });
          }
          break;
          
        case 'inventory':
          if (method === 'GET') {
            const inventory = await MediaCustodianAPI.getMediaInventory();
            return new Response(JSON.stringify(inventory), {
              headers: { 'Content-Type': 'application/json' }
            });
          }
          break;
          
        case 'reports':
          if (method === 'POST') {
            const body = await request.json() as {
              type: string;
              params?: any;
            };
            const report = await MediaCustodianAPI.generateReport(body.type, body.params);
            return new Response(JSON.stringify(report), {
              headers: { 'Content-Type': 'application/json' }
            });
          }
          break;
          
        default:
          return new Response('Not Found', { status: 404 });
      }
      
      return new Response('Method Not Allowed', { status: 405 });
    } catch (error) {
      console.error('Media custodian API error:', error);
      return new Response(JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
}
