// AFT Server - Modular implementation
import { initializeSecurity, applySecurityHeaders } from "./lib/security";
import { getClientIP } from "./server/utils";
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
import { handleMediaCustodianRoutes } from "./server/routes/media-custodian-routes";

// Initialize security
initializeSecurity();

// Main server
Bun.serve({
  port: 3000,
  
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const ipAddress = getClientIP(request);

    // Serve static files
    const staticResponse = await handleStaticFiles(path);
    if (staticResponse) {
      return staticResponse;
    }
    
    // Handle API routes
    if (path.startsWith('/api/') || path.startsWith('/media-custodian/api/')) {
      return applySecurityHeaders(await handleAPI(request, path, ipAddress));
    }
    
    // Handle page routes
    let response: Response;
    
    // Admin routes
    if (path.startsWith('/admin')) {
      response = await handleAdminRoutes(request, path);
    // Requestor routes
    } else if (path.startsWith('/requestor')) {
      response = await handleRequestorRoutes(request, path);
    // Media custodian routes
    } else if (path.startsWith('/media-custodian')) {
      response = await handleMediaCustodianRoutes(request, path);
    } else {
      // Main application routes
      switch (path) {
        case '/':
        case '/login':
          response = await handleLoginPage(request);
          break;
        case '/select-role':
          response = await handleRoleSelectionPage(request);
          break;
        case '/dashboard':
          response = await handleDashboardRoutes(request);
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

console.log("=🚀 AFT Server running on http://localhost:3000");
console.log("=🔧 Database initialized with multi-role support");
console.log("=🔐 Login with: admin@aft.gov / admin123");
console.log("=👥 Multi-role authentication enabled");