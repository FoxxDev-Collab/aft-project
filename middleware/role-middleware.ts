// Role-based middleware for request authorization
import { type SecureSession, validateSession } from "../lib/security";
import { UserRole, type UserRoleType } from "../lib/database-bun";

// Get client IP address
function getClientIP(request: Request): string {
  return request.headers.get('x-forwarded-for') || 
         request.headers.get('x-real-ip') || 
         'unknown';
}

// Check if user is authenticated and has selected a role
export async function requireAuth(request: Request): Promise<SecureSession | null> {
  const cookies = request.headers.get("cookie");
  if (!cookies) return null;
  
  const sessionMatch = cookies.match(/session=([^;]+)/);
  if (!sessionMatch || !sessionMatch[1]) return null;
  
  const ipAddress = getClientIP(request);
  const userAgent = request.headers.get('user-agent') || 'unknown';
  
  return await validateSession(sessionMatch[1], ipAddress, userAgent);
}

// Check if user has selected an active role
export async function requireRoleSelection(request: Request): Promise<SecureSession | null> {
  const session = await requireAuth(request);
  
  if (!session) return null;
  
  // If user hasn't selected a role, they need to go to role selection
  if (!session.roleSelected || !session.activeRole) {
    return null;
  }
  
  return session;
}

// Check if user has a specific role
export async function requireRole(request: Request, requiredRole: UserRoleType): Promise<SecureSession | null> {
  const session = await requireRoleSelection(request);
  
  if (!session) return null;
  
  // Check if user's active role matches required role
  if (session.activeRole !== requiredRole) {
    return null;
  }
  
  return session;
}

// Check if user has any of the specified roles
export async function requireAnyRole(request: Request, requiredRoles: UserRoleType[]): Promise<SecureSession | null> {
  const session = await requireRoleSelection(request);
  
  if (!session) return null;
  
  // Check if user's active role is in the list of required roles
  if (!requiredRoles.includes(session.activeRole as UserRoleType)) {
    return null;
  }
  
  return session;
}

// Check if user has admin role
export async function requireAdmin(request: Request): Promise<SecureSession | null> {
  return await requireRole(request, UserRole.ADMIN);
}

// Middleware response helpers
export class RoleMiddleware {
  // Redirect to login if not authenticated
  static redirectToLogin(): Response {
    return Response.redirect("/login", 302);
  }
  
  // Redirect to role selection if authenticated but no role selected
  static redirectToRoleSelection(): Response {
    return Response.redirect("/select-role", 302);
  }
  
  // Return access denied response
  static accessDenied(message: string = "Access denied"): Response {
    return new Response(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Access Denied</title>
    <link rel="stylesheet" href="/globals.css">
</head>
<body>
    <div class="min-h-screen bg-[var(--muted)] flex items-center justify-center p-4">
        <div class="bg-[var(--card)] rounded-lg p-8 max-w-md w-full text-center border border-[var(--border)] shadow-lg">
            <div class="text-6xl mb-4">🚫</div>
            <h1 class="text-2xl font-bold text-[var(--destructive)] mb-4">Access Denied</h1>
            <p class="text-[var(--muted-foreground)] mb-6">${message}</p>
            <div class="flex gap-4 justify-center">
                <a href="/dashboard" class="px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md hover:opacity-90 transition-opacity">
                    Go to Dashboard
                </a>
                <a href="/select-role" class="px-4 py-2 bg-[var(--secondary)] text-[var(--secondary-foreground)] rounded-md hover:opacity-90 transition-opacity">
                    Change Role
                </a>
            </div>
        </div>
    </div>
</body>
</html>`, {
      status: 403,
      headers: { "Content-Type": "text/html" }
    });
  }
  
  // Get role-specific dashboard URL
  static getRoleDashboardUrl(role: UserRoleType): string {
    const roleUrls = {
      [UserRole.ADMIN]: '/admin',
      [UserRole.REQUESTOR]: '/requestor',
      [UserRole.DAO]: '/dashboard/dao',
      [UserRole.APPROVER]: '/dashboard/approver',
      [UserRole.CPSO]: '/dashboard/cpso',
      [UserRole.DTA]: '/dashboard/dta',
      [UserRole.SME]: '/dashboard/sme',
      [UserRole.MEDIA_CUSTODIAN]: '/media-custodian'
    };
    
    return roleUrls[role] || '/dashboard';
  }
  
  // Comprehensive auth check with proper redirects
  static async checkAuthAndRole(
    request: Request, 
    requiredRole?: UserRoleType
  ): Promise<{ session: SecureSession; response?: Response }> {
    // First check basic authentication
    const session = await requireAuth(request);
    
    if (!session) {
      return { session: null as any, response: this.redirectToLogin() };
    }
    
    // Check if role is selected
    if (!session.roleSelected || !session.activeRole) {
      return { session, response: this.redirectToRoleSelection() };
    }
    
    // Check specific role requirement
    if (requiredRole && session.activeRole !== requiredRole) {
      const message = `This page requires ${requiredRole.toUpperCase()} role. Your current role is ${session.activeRole?.toUpperCase()}.`;
      return { session, response: this.accessDenied(message) };
    }
    
    // All checks passed
    return { session };
  }
}