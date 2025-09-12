// Authentication API routes
import { getDb, verifyPassword, getUserRoles } from "../../lib/database-bun";
import { 
  createSecureSession, 
  checkRateLimit, 
  recordFailedAttempt, 
  resetRateLimit,
  auditLog,
  getSecureCookieOptions,
  selectSessionRole,
  switchSessionRole
} from "../../lib/security";
import { checkAuth } from "../utils";

const db = getDb();

export async function handleAuthAPI(request: Request, path: string, ipAddress: string): Promise<Response | null> {
  const method = request.method;
  
  // Email validation API
  if (path === '/api/check-email' && method === 'POST') {
    try {
      const body = await request.json() as { email: string };
      const email = body.email;

      if (!email) {
        return new Response(JSON.stringify({ error: 'Email is required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const user = db.query("SELECT id FROM users WHERE email = ? AND is_active = 1").get(email);
      
      return new Response(JSON.stringify({ exists: !!user }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });

    } catch (error) {
      return new Response(JSON.stringify({ error: 'Invalid request' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
  
  // Login API
  if (path === '/api/login' && method === 'POST') {
    const body = await request.json() as { email: string; password: string };
    const userAgent = request.headers.get('user-agent') || 'unknown';
    
    // Extract CAC certificate info from Apache headers if present
    const cacCertificate = {
      subject: request.headers.get('X-Client-Cert-Subject') || '',
      issuer: request.headers.get('X-Client-Cert-Issuer') || '',
      serialNumber: request.headers.get('X-Client-Cert-Serial') || '',
      thumbprint: request.headers.get('X-Client-Cert-Fingerprint') || '',
      validFrom: request.headers.get('X-Client-Cert-Not-Before') || '',
      validTo: request.headers.get('X-Client-Cert-Not-After') || '',
      pemData: request.headers.get('X-Client-Cert-PEM') || ''
    };
    
    // Check if we have a valid CAC certificate
    const hasCAC = cacCertificate.subject && cacCertificate.issuer;
    
    // Check rate limiting
    const rateCheck = checkRateLimit(ipAddress + ':' + body.email);
    if (!rateCheck.allowed) {
      await auditLog(null, 'LOGIN_RATE_LIMITED', 
        `Rate limit exceeded for ${body.email}`, ipAddress);
      
      const lockoutMinutes = Math.ceil((rateCheck.lockedUntil! - Date.now()) / 1000 / 60);
      return new Response(JSON.stringify({ 
        success: false, 
        message: `Too many failed attempts. Try again in ${lockoutMinutes} minutes.`,
        lockedUntil: rateCheck.lockedUntil 
      }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const user = db.query("SELECT * FROM users WHERE email = ? AND is_active = 1").get(body.email) as any;

    if (!user) {
      recordFailedAttempt(ipAddress + ':' + body.email);
      await auditLog(null, 'LOGIN_FAILED_NO_USER',
        `Failed login attempt for non-existent user ${body.email}`, ipAddress);

      return new Response(JSON.stringify({ 
        success: false, 
        message: 'No account with that email',
        remainingAttempts: rateCheck.remainingAttempts - 1
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    if (await verifyPassword(body.password, user.password)) {
      // Success - reset rate limit and get user roles
      resetRateLimit(ipAddress + ':' + body.email);
      
      const userRoles = getUserRoles(user.id);
      const availableRoles = userRoles.map(r => r.role);
      
      const session = await createSecureSession(
        user.id, 
        user.email, 
        user.primary_role,
        availableRoles,
        ipAddress, 
        userAgent,
        hasCAC ? cacCertificate : undefined
      );
      
      await auditLog(user.id, 'LOGIN_SUCCESS', 
        `Successful login for ${user.email}`, ipAddress);
      
      const cookieOptions = getSecureCookieOptions();
      return new Response(JSON.stringify({ 
        success: true,
        needsRoleSelection: availableRoles.length > 1
      }), {
        headers: {
          'Content-Type': 'application/json',
          'Set-Cookie': `session=${session.sessionId}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${cookieOptions.maxAge}`
        }
      });
    }
    
    // Failed login - incorrect password
    recordFailedAttempt(ipAddress + ':' + body.email);
    await auditLog(user.id, 'LOGIN_FAILED_BAD_PASS', 
      `Failed login attempt for ${body.email} (incorrect password)`, ipAddress);
    
    return new Response(JSON.stringify({ 
      success: false, 
      message: 'Invalid credentials',
      remainingAttempts: rateCheck.remainingAttempts - 1
    }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  // Role selection API
  if (path === '/api/select-role' && method === 'POST') {
    const auth = await checkAuth(request, ipAddress);
    if (!auth) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), { 
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const body = await request.json() as { role: string };
    
    const success = await selectSessionRole(auth.sessionId, body.role, ipAddress);
    
    if (success) {
      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } else {
      return new Response(JSON.stringify({ 
        success: false, 
        message: 'Invalid role selection' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
  
  // Role switch API
  if (path === '/api/switch-role' && method === 'POST') {
    const auth = await checkAuth(request, ipAddress);
    if (!auth || !auth.roleSelected) {
      return new Response(JSON.stringify({ error: 'Not authenticated or no role selected' }), { 
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const body = await request.json() as { role: string };
    
    const success = await switchSessionRole(auth.sessionId, body.role, ipAddress);
    
    if (success) {
      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } else {
      return new Response(JSON.stringify({ 
        success: false, 
        message: 'Invalid role switch' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
  
  return null;
}
