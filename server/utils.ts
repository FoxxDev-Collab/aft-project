// Server utility functions
import { validateSession, type SecureSession } from "../lib/security";

// Get client IP address
export function getClientIP(request: Request): string {
  return request.headers.get('x-forwarded-for') || 
         request.headers.get('x-real-ip') || 
         'unknown';
}

// Check authentication with role validation
export async function checkAuth(request: Request): Promise<SecureSession | null> {
  const cookies = request.headers.get("cookie");
  if (!cookies) return null;
  
  const sessionMatch = cookies.match(/session=([^;]+)/);
  if (!sessionMatch || !sessionMatch[1]) return null;
  
  const ipAddress = getClientIP(request);
  const userAgent = request.headers.get('user-agent') || 'unknown';
  
  return await validateSession(sessionMatch[1], ipAddress, userAgent);
}

// Create HTML page wrapper
export function createHtmlPage(title: string, content: string, script?: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <link rel="stylesheet" href="/globals.css">
    <script src="https://cdn.tailwindcss.com"></script>
</head>
<body>
    ${content}
    ${script ? `<script>${script}</script>` : ''}
</body>
</html>`;
}
