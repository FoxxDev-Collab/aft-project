// Static file handler
import { applySecurityHeaders } from "../lib/security";

export async function handleStaticFiles(path: string): Promise<Response | null> {
  // Serve CSS files
  if (path === '/globals.css') {
    const file = Bun.file('./globals.css');
    if (await file.exists()) {
      return applySecurityHeaders(new Response(file, {
        headers: { 'Content-Type': 'text/css' }
      }));
    }
  }
  
  // Serve static directory files
  if (path.startsWith('/static/')) {
    const file = Bun.file('.' + path);
    if (await file.exists()) {
      return applySecurityHeaders(new Response(file));
    }
    return new Response("File not found", { status: 404 });
  }
  
  // Serve public lib files (for CAC Web Crypto)
  if (path.startsWith('/lib/')) {
    const file = Bun.file('./public' + path);
    if (await file.exists()) {
      const contentType = path.endsWith('.js') ? 'application/javascript' : 
                         path.endsWith('.css') ? 'text/css' : 
                         'text/plain';
      return applySecurityHeaders(new Response(file, {
        headers: { 'Content-Type': contentType }
      }));
    }
    return new Response("File not found", { status: 404 });
  }
  
  return null;
}
