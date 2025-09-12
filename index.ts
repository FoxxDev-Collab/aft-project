// AFT Server - Modular implementation
import { initializeSecurity, applySecurityHeaders } from "./lib/security";
import { handleStaticFiles } from "./server/static-handler";
import { handleAPI } from "./server/api/index";
import { 
  handleLoginPage, 
  handleRoleSelectionPage, 
  handleDashboardRoutes, 
  handleLogout 
} from "./server/routes/auth-routes";
import { handleAdminRoutes } from "./server/routes/admin-routes";
import { handleRequestorRoutes } from "./server/routes/requestor-routes";
import { handleApproverRoutes } from "./server/routes/approver-routes";
import { handleMediaCustodianRoutes } from "./server/routes/media-custodian-routes";
import { handleDTARoutes } from "./server/routes/dta-routes";
import { handleSMERoutes } from "./server/routes/sme-routes";
import { handleCPSORoutes } from "./server/routes/cpso-routes";

// Initialize security
initializeSecurity();

// Main server - Caddy handles TLS and client certificates
Bun.serve({
  port: 3001, // Caddy will proxy to this port
  
  async fetch(request: Request, server: any): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const ipAddress = server.requestIP(request)?.address ?? 'unknown';

    // Serve static files
    const staticResponse = await handleStaticFiles(path);
    if (staticResponse) {
      return staticResponse;
    }
    
    // Handle API routes
    if (path.startsWith('/api/')) {
      return applySecurityHeaders(await handleAPI(request, path, ipAddress));
    }
    
    // Handle page routes
    let response: Response;
    
    // Handle legacy dashboard routes - redirect to new role-specific routes
    if (path === '/dashboard/approver' || path === '/dashboard/cpso') {
      response = Response.redirect('/approver', 302);
    } else if (path === '/dashboard/dao') {
      // This role is not yet implemented, return appropriate message
      response = new Response("This role dashboard is not yet implemented", { status: 501 });
    } else if (path.startsWith('/sme') || path === '/dashboard/sme') {
      response = await handleSMERoutes(request, path, ipAddress);
    } else if (path === '/dashboard/dta') {
      // Redirect legacy DTA dashboard route to new route
      response = Response.redirect('/dta', 302);
    // Admin routes
    } else if (path.startsWith('/admin')) {
      response = await handleAdminRoutes(request, path, ipAddress);
    // Requestor routes
    } else if (path.startsWith('/requestor')) {
      response = await handleRequestorRoutes(request, path, ipAddress);
    // Approver routes
    } else if (path.startsWith('/approver')) {
      response = await handleApproverRoutes(request, path, ipAddress);
    // Media custodian routes
    } else if (path.startsWith('/media-custodian')) {
      response = await handleMediaCustodianRoutes(request, path, ipAddress);
    // DTA routes
    } else if (path.startsWith('/dta')) {
      response = await handleDTARoutes(request, path, ipAddress);
    // CPSO routes
    } else if (path.startsWith('/cpso')) {
      response = await handleCPSORoutes(request, path, ipAddress);
    } else {
      // Main application routes
      switch (path) {
        case '/':
        case '/login':
          response = await handleLoginPage(request, ipAddress);
          break;
        case '/select-role':
          response = await handleRoleSelectionPage(request, ipAddress);
          break;
        case '/dashboard':
          response = await handleDashboardRoutes(request, ipAddress);
          break;
        case '/logout':
          response = await handleLogout(request);
          break;
        default:
          response = new Response("Page not found", { status: 404 });
      }
    }
    
    // Apply security headers to all responses
    return applySecurityHeaders(response);
  },
});

console.log("=🚀 AFT Server running on http://localhost:3001");
console.log("=🔧 Database initialized with multi-role support");
console.log("=🔐 Login with: admin@aft.gov / admin123");
console.log("=👥 Multi-role authentication enabled");
console.log("=🌐 Production URL: https://aft.foxxcyber.com");
console.log("=🏷️  CAC authentication enabled via Caddy proxy");
console.log("=💡 Restart Caddy: 'caddy reload' to enable CAC support");