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
  
  return null;
}
