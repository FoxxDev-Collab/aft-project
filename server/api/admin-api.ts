// Admin API routes
import { getDb, UserRole, getRoleDisplayName, getRoleDescription } from "../../lib/database-bun";
import { auditLog } from "../../lib/security";
import { RoleMiddleware } from "../../middleware/role-middleware";

const db = getDb();

export async function handleAdminAPI(request: Request, path: string, ipAddress: string): Promise<Response | null> {
  const method = request.method;
  
  // Admin stats API
  if (path === '/api/admin/stats' && method === 'GET') {
    const authResult = await RoleMiddleware.checkAuthAndRole(request, ipAddress, UserRole.ADMIN);
    if (authResult.response) return authResult.response;
    
    const userCount = db.query("SELECT COUNT(*) as count FROM users WHERE is_active = 1").get() as any;
    const requestCount = db.query("SELECT COUNT(*) as count FROM aft_requests").get() as any;
    const recentLogins = db.query(`
      SELECT COUNT(*) as count FROM security_audit_log 
      WHERE action = 'LOGIN_SUCCESS' AND timestamp > (unixepoch() - 86400)
    `).get() as any;
    
    return new Response(JSON.stringify({
      activeUsers: userCount?.count || 0,
      totalRequests: requestCount?.count || 0,
      todayLogins: recentLogins?.count || 0,
      systemStatus: 'operational'
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  // Security audit API
  if (path === '/api/security/audit' && method === 'GET') {
    const authResult = await RoleMiddleware.checkAuthAndRole(request, ipAddress, UserRole.ADMIN);
    if (authResult.response) return authResult.response;
    
    const logs = db.query(`
      SELECT 
        sal.*, 
        u.first_name || ' ' || u.last_name as user_name,
        u.email as user_email
      FROM security_audit_log sal
      LEFT JOIN users u ON sal.user_id = u.id
      ORDER BY sal.timestamp DESC
      LIMIT 100
    `).all();
    
    return new Response(JSON.stringify(logs), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  // User Management APIs
  if (path === '/api/admin/users' && method === 'POST') {
    const authResult = await RoleMiddleware.checkAuthAndRole(request, ipAddress, UserRole.ADMIN);
    if (authResult.response) return authResult.response;
    
    try {
      const userData = await request.json() as any;
      const hashedPassword = await Bun.password.hash(userData.password, {
        algorithm: "bcrypt",
        cost: 12,
      });
      
      const result = db.query(`
        INSERT INTO users (email, password, first_name, last_name, primary_role, organization, phone, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING id
      `).get(
        userData.email,
        hashedPassword,
        userData.first_name,
        userData.last_name,
        userData.primary_role,
        userData.organization || null,
        userData.phone || null,
        userData.is_active ? 1 : 0
      ) as any;
      
      // Add primary role to user_roles table
      db.query(`
        INSERT INTO user_roles (user_id, role, is_active, assigned_by)
        VALUES (?, ?, 1, ?)
      `).run(result.id, userData.primary_role, authResult.session.userId);
      
      await auditLog(authResult.session.userId, 'USER_CREATED', 
        `Created user: ${userData.email}`, ipAddress);
      
      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error: any) {
      return new Response(JSON.stringify({ 
        success: false, 
        message: error.message 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
  
  if (path.startsWith('/api/admin/users/') && path.endsWith('/roles') && method === 'GET') {
    const authResult = await RoleMiddleware.checkAuthAndRole(request, ipAddress, UserRole.ADMIN);
    if (authResult.response) return authResult.response;
    
    const userId = path.split('/')[4];
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Invalid user ID' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Get user info
    const user = db.query("SELECT * FROM users WHERE id = ?").get(userId) as any;
    if (!user) {
      return new Response(JSON.stringify({ error: 'User not found' }), { 
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Get user's current roles
    const userRoles = db.query(`
      SELECT role FROM user_roles 
      WHERE user_id = ? AND is_active = 1
    `).all(userId);
    
    // Get all available roles
    const allRoles = Object.values(UserRole).map(role => ({
      id: role,
      name: getRoleDisplayName(role),
      description: getRoleDescription(role)
    }));
    
    return new Response(JSON.stringify({
      user,
      userRoles,
      allRoles
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  if (path.startsWith('/api/admin/users/') && path.endsWith('/roles') && method === 'PUT') {
    const authResult = await RoleMiddleware.checkAuthAndRole(request, ipAddress, UserRole.ADMIN);
    if (authResult.response) return authResult.response;
    
    const userId = path.split('/')[4];
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Invalid user ID' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    const { roles } = await request.json() as { roles: string[] };
    
    // Get user's primary role (cannot be removed)
    const user = db.query("SELECT primary_role FROM users WHERE id = ?").get(userId) as any;
    if (!user) {
      return new Response(JSON.stringify({ error: 'User not found' }), { 
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Ensure primary role is always included
    const allRoles = [...new Set([user.primary_role, ...roles])];
    
    // Remove all current roles (except we'll re-add them)
    db.query("DELETE FROM user_roles WHERE user_id = ?").run(userId);
    
    // Add all roles back
    for (const role of allRoles) {
      db.query(`
        INSERT INTO user_roles (user_id, role, is_active, assigned_by)
        VALUES (?, ?, 1, ?)
      `).run(userId, role, authResult.session.userId);
    }
    
    await auditLog(authResult.session.userId, 'USER_ROLES_UPDATED', 
      `Updated roles for user ID ${userId}: ${allRoles.join(', ')}`, ipAddress);
    
    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  if (path.startsWith('/api/admin/users/') && method === 'GET') {
    const authResult = await RoleMiddleware.checkAuthAndRole(request, ipAddress, UserRole.ADMIN);
    if (authResult.response) return authResult.response;
    
    const userId = path.split('/')[4];
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Invalid user ID' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    const user = db.query("SELECT * FROM users WHERE id = ?").get(userId) as any;
    
    if (!user) {
      return new Response(JSON.stringify({ error: 'User not found' }), { 
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    return new Response(JSON.stringify(user), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  if (path.startsWith('/api/admin/users/') && method === 'PUT') {
    const authResult = await RoleMiddleware.checkAuthAndRole(request, ipAddress, UserRole.ADMIN);
    if (authResult.response) return authResult.response;
    
    try {
      const userId = path.split('/')[4];
      if (!userId) {
        return new Response(JSON.stringify({ 
          success: false, 
          message: 'Invalid user ID' 
        }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      const userData = await request.json() as any;
      
      let updateQuery = `
        UPDATE users 
        SET first_name = ?, last_name = ?, email = ?, primary_role = ?, 
            organization = ?, phone = ?, is_active = ?, updated_at = unixepoch()
        WHERE id = ?
      `;
      let params = [
        userData.first_name,
        userData.last_name,
        userData.email,
        userData.primary_role,
        userData.organization || null,
        userData.phone || null,
        userData.is_active ? 1 : 0,
        userId
      ];
      
      // If password is provided, include it in the update
      if (userData.password && userData.password.trim()) {
        const hashedPassword = await Bun.password.hash(userData.password, {
          algorithm: "bcrypt",
          cost: 12,
        });
        updateQuery = `
          UPDATE users 
          SET first_name = ?, last_name = ?, email = ?, password = ?, primary_role = ?, 
              organization = ?, phone = ?, is_active = ?, updated_at = unixepoch()
          WHERE id = ?
        `;
        params = [
          userData.first_name,
          userData.last_name,
          userData.email,
          hashedPassword,
          userData.primary_role,
          userData.organization || null,
          userData.phone || null,
          userData.is_active ? 1 : 0,
          userId
        ];
      }
      
      db.query(updateQuery).run(...params);
      
      await auditLog(authResult.session.userId, 'USER_UPDATED', 
        `Updated user: ${userData.email}`, ipAddress);
      
      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error: any) {
      return new Response(JSON.stringify({ 
        success: false, 
        message: error.message 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
  
  return null;
}
