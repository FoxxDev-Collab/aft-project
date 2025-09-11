// Media Custodian Routes - Handle all media custodian-related requests
import { MediaCustodianDashboard } from '../../media-custodian/dashboard';
import { MediaCustodianRequests } from '../../media-custodian/requests';
import { MediaCustodianInventory } from '../../media-custodian/inventory';
import { MediaCustodianReports } from '../../media-custodian/reports';
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
    
  // Reports page
  static async handleReportsPage(request: Request, user: any): Promise<Response> {
    try {
      const content = await MediaCustodianReports.renderReportsPage(user);
      const script = MediaCustodianReports.getScript();
      
      return new Response(createHtmlPage(
        "AFT Media Custodian - Reports",
        content,
        script
      ), {
        headers: { 'Content-Type': 'text/html' }
      });
    } catch (error) {
      console.error('Error rendering media custodian reports:', error);
      return new Response('Internal Server Error', { status: 500 });
    }
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
