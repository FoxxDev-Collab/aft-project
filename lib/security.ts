// DOD-compliant security module for AFT application
import { getDb } from "./database-bun";

// Security configuration
export const SECURITY_CONFIG = {
  // Session security (STIG compliant)
  SESSION_TIMEOUT: 10 * 60 * 1000, // 10 minutes per STIG requirements
  MAX_SESSION_DURATION: 8 * 60 * 60 * 1000, // 8 hours max (STIG compliant)
  CSRF_TOKEN_LENGTH: 32,
  
  // Password policy (DOD requirements)
  PASSWORD_MIN_LENGTH: 12,
  PASSWORD_MAX_AGE_DAYS: 90,
  PASSWORD_HISTORY_COUNT: 12,
  
  // Rate limiting
  MAX_LOGIN_ATTEMPTS: 5,
  LOCKOUT_DURATION: 15 * 60 * 1000, // 15 minutes
  
  // Security headers
  SECURITY_HEADERS: {
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com",
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()'
  }
};

// Session interface
export interface SecureSession {
  sessionId: string;
  userId: number;
  email: string;
  primaryRole: string;
  activeRole?: string; // Currently selected role
  availableRoles: string[]; // All roles user can switch to
  createdAt: number;
  lastActivity: number;
  ipAddress: string;
  userAgent: string;
  csrfToken: string;
  isActive: boolean;
  roleSelected: boolean; // Whether user has selected their active role
  cacCertificate?: {  // CAC certificate from initial connection
    subject: string;
    issuer: string;
    serialNumber: string;
    thumbprint: string;
    validFrom: string;
    validTo: string;
    pemData?: string;
  };
}

// Rate limiting store
const rateLimitStore = new Map<string, { attempts: number; lastAttempt: number; lockedUntil?: number }>();

// Session store - we'll implement database persistence
const sessionStore = new Map<string, SecureSession>();

// Initialize session table
function initializeSessionStore() {
  const db = getDb();
  
  // Create sessions table if it doesn't exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      session_id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      email TEXT NOT NULL,
      primary_role TEXT NOT NULL,
      active_role TEXT,
      available_roles TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      last_activity INTEGER NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      csrf_token TEXT NOT NULL,
      is_active BOOLEAN DEFAULT 1,
      role_selected BOOLEAN DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);
  
  // Load existing sessions from database into memory store
  const existingSessions = db.query(`
    SELECT * FROM sessions WHERE is_active = 1
  `).all() as any[];
  
  existingSessions.forEach(row => {
    const session: SecureSession = {
      sessionId: row.session_id,
      userId: row.user_id,
      email: row.email,
      primaryRole: row.primary_role,
      activeRole: row.active_role,
      availableRoles: JSON.parse(row.available_roles),
      createdAt: row.created_at,
      lastActivity: row.last_activity,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      csrfToken: row.csrf_token,
      isActive: !!row.is_active,
      roleSelected: !!row.role_selected
    };
    sessionStore.set(session.sessionId, session);
  });
  
  console.log(`🔄 Loaded ${existingSessions.length} existing sessions from database`);
}

// Generate cryptographically secure random string
export function generateSecureToken(length: number = 32): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

// Encrypt session data (in production, use proper key management)
export async function encryptSessionData(data: any): Promise<string> {
  // For demonstration - in production use proper encryption with managed keys
  const encoder = new TextEncoder();
  const dataBytes = encoder.encode(JSON.stringify(data));
  
  // Generate a random key (in production, use proper key derivation)
  const key = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
  
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    dataBytes
  );
  
  // In production, securely store the key and return just the encrypted data + IV
  return btoa(String.fromCharCode(...new Uint8Array(encrypted)));
}

// Create secure session
export async function createSecureSession(
  userId: number, 
  email: string, 
  primaryRole: string,
  availableRoles: string[],
  ipAddress: string, 
  userAgent: string,
  cacCertificate?: any
): Promise<SecureSession> {
  const sessionId = generateSecureToken(32);
  const csrfToken = generateSecureToken(32);
  const now = Date.now();
  
  const session: SecureSession = {
    sessionId,
    userId,
    email,
    primaryRole,
    activeRole: undefined, // Not selected yet
    availableRoles,
    createdAt: now,
    lastActivity: now,
    ipAddress,
    userAgent,
    csrfToken,
    isActive: true,
    roleSelected: false,
    cacCertificate: cacCertificate && cacCertificate.subject ? cacCertificate : undefined
  };
  
  // Save to memory store
  sessionStore.set(sessionId, session);
  
  // Save to database
  const db = getDb();
  db.query(`
    INSERT INTO sessions (
      session_id, user_id, email, primary_role, active_role, 
      available_roles, created_at, last_activity, ip_address, 
      user_agent, csrf_token, is_active, role_selected
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    sessionId, userId, email, primaryRole, session.activeRole || null,
    JSON.stringify(availableRoles), now, now, ipAddress,
    userAgent, csrfToken, 1, 0
  );
  
  // Log session creation
  await auditLog(userId, 'SESSION_CREATED', `Session created for ${email}`, ipAddress);
  
  return session;
}

// Select active role for session
export async function selectSessionRole(
  sessionId: string, 
  role: string,
  ipAddress: string
): Promise<boolean> {
  const session = sessionStore.get(sessionId);
  
  if (!session || !session.isActive) {
    return false;
  }
  
  // Verify user has this role
  if (!session.availableRoles.includes(role)) {
    await auditLog(session.userId, 'ROLE_SELECT_FAILED', 
      `Attempted to select unavailable role: ${role}`, ipAddress);
    return false;
  }
  
  // Update session
  session.activeRole = role;
  session.roleSelected = true;
  session.lastActivity = Date.now();
  sessionStore.set(sessionId, session);
  
  // Update database
  const db = getDb();
  db.query(`
    UPDATE sessions 
    SET active_role = ?, role_selected = 1, last_activity = ? 
    WHERE session_id = ?
  `).run(role, session.lastActivity, sessionId);
  
  await auditLog(session.userId, 'ROLE_SELECTED', 
    `Selected active role: ${role}`, ipAddress);
  
  return true;
}

// Switch role during session
export async function switchSessionRole(
  sessionId: string, 
  newRole: string,
  ipAddress: string
): Promise<boolean> {
  const session = sessionStore.get(sessionId);
  
  if (!session || !session.isActive || !session.roleSelected) {
    return false;
  }
  
  // Verify user has this role
  if (!session.availableRoles.includes(newRole)) {
    await auditLog(session.userId, 'ROLE_SWITCH_FAILED', 
      `Attempted to switch to unavailable role: ${newRole}`, ipAddress);
    return false;
  }
  
  const oldRole = session.activeRole;
  
  // Update session
  session.activeRole = newRole;
  session.lastActivity = Date.now();
  sessionStore.set(sessionId, session);
  
  // Update database
  const db = getDb();
  db.query(`
    UPDATE sessions 
    SET active_role = ?, last_activity = ? 
    WHERE session_id = ?
  `).run(newRole, session.lastActivity, sessionId);
  
  await auditLog(session.userId, 'ROLE_SWITCHED', 
    `Switched role from ${oldRole} to ${newRole}`, ipAddress);
  
  return true;
}

// Validate session
export async function validateSession(
  sessionId: string, 
  ipAddress: string, 
  userAgent: string
): Promise<SecureSession | null> {
  const session = sessionStore.get(sessionId);
  
  if (!session || !session.isActive) {
    return null;
  }
  
  const now = Date.now();
  
  // Check session timeout
  if (now - session.lastActivity > SECURITY_CONFIG.SESSION_TIMEOUT) {
    await destroySession(sessionId, 'SESSION_TIMEOUT');
    return null;
  }
  
  // Check max session duration
  if (now - session.createdAt > SECURITY_CONFIG.MAX_SESSION_DURATION) {
    await destroySession(sessionId, 'MAX_DURATION_EXCEEDED');
    return null;
  }
  
  // Verify IP and User Agent (optional - can be made configurable)
  if (session.ipAddress !== ipAddress) {
    await auditLog(session.userId, 'SUSPICIOUS_IP_CHANGE', 
      `IP changed from ${session.ipAddress} to ${ipAddress}`, ipAddress);
    // In high-security mode, you might want to invalidate the session here
  }
  
  // Optional: Verify User Agent for additional security
  if (session.userAgent !== userAgent) {
    await auditLog(session.userId, 'SUSPICIOUS_USER_AGENT_CHANGE', 
      `User agent changed for session`, ipAddress);
    // Could invalidate session for stricter security if needed
  }
  
  // Update last activity
  session.lastActivity = now;
  sessionStore.set(sessionId, session);
  
  // Update database
  const db = getDb();
  db.query(`
    UPDATE sessions 
    SET last_activity = ? 
    WHERE session_id = ?
  `).run(now, sessionId);
  
  return session;
}

// Destroy session
export async function destroySession(sessionId: string, reason: string = 'USER_LOGOUT'): Promise<void> {
  const session = sessionStore.get(sessionId);
  
  if (session) {
    session.isActive = false;
    sessionStore.delete(sessionId);
    
    // Update database
    const db = getDb();
    db.query(`
      UPDATE sessions 
      SET is_active = 0 
      WHERE session_id = ?
    `).run(sessionId);
    
    await auditLog(session.userId, 'SESSION_DESTROYED', 
      `Session destroyed: ${reason}`, session.ipAddress);
  }
}

// Rate limiting for login attempts
export function checkRateLimit(identifier: string): { allowed: boolean; remainingAttempts: number; lockedUntil?: number } {
  const now = Date.now();
  const record = rateLimitStore.get(identifier);
  
  if (!record) {
    rateLimitStore.set(identifier, { attempts: 0, lastAttempt: now });
    return { allowed: true, remainingAttempts: SECURITY_CONFIG.MAX_LOGIN_ATTEMPTS };
  }
  
  // Check if still locked out
  if (record.lockedUntil && now < record.lockedUntil) {
    return { 
      allowed: false, 
      remainingAttempts: 0, 
      lockedUntil: record.lockedUntil 
    };
  }
  
  // Reset if lockout period has passed
  if (record.lockedUntil && now >= record.lockedUntil) {
    record.attempts = 0;
    record.lockedUntil = undefined;
  }
  
  // Check if within rate limit
  if (record.attempts >= SECURITY_CONFIG.MAX_LOGIN_ATTEMPTS) {
    record.lockedUntil = now + SECURITY_CONFIG.LOCKOUT_DURATION;
    rateLimitStore.set(identifier, record);
    return { 
      allowed: false, 
      remainingAttempts: 0, 
      lockedUntil: record.lockedUntil 
    };
  }
  
  return { 
    allowed: true, 
    remainingAttempts: SECURITY_CONFIG.MAX_LOGIN_ATTEMPTS - record.attempts 
  };
}

// Record failed login attempt
export function recordFailedAttempt(identifier: string): void {
  const now = Date.now();
  const record = rateLimitStore.get(identifier) || { attempts: 0, lastAttempt: now };
  
  record.attempts++;
  record.lastAttempt = now;
  
  if (record.attempts >= SECURITY_CONFIG.MAX_LOGIN_ATTEMPTS) {
    record.lockedUntil = now + SECURITY_CONFIG.LOCKOUT_DURATION;
  }
  
  rateLimitStore.set(identifier, record);
}

// Reset rate limit on successful login
export function resetRateLimit(identifier: string): void {
  rateLimitStore.delete(identifier);
}

// Validate password against DOD policy
export function validatePasswordPolicy(password: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (password.length < SECURITY_CONFIG.PASSWORD_MIN_LENGTH) {
    errors.push(`Password must be at least ${SECURITY_CONFIG.PASSWORD_MIN_LENGTH} characters long`);
  }
  
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }
  
  if (!/[^A-Za-z0-9]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }
  
  // Check for common patterns
  if (/(.)\1{3,}/.test(password)) {
    errors.push('Password cannot contain more than 3 consecutive identical characters');
  }
  
  if (/(?:123|abc|qwerty)/i.test(password)) {
    errors.push('Password cannot contain common sequences');
  }
  
  return { valid: errors.length === 0, errors };
}

// Audit logging
export async function auditLog(
  userId: number | null, 
  action: string, 
  description: string, 
  ipAddress: string,
  additionalData?: any
): Promise<void> {
  const db = getDb();
  
  try {
    // Create audit log table if it doesn't exist
    db.exec(`
      CREATE TABLE IF NOT EXISTS security_audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        action TEXT NOT NULL,
        description TEXT NOT NULL,
        ip_address TEXT,
        user_agent TEXT,
        additional_data TEXT,
        timestamp INTEGER DEFAULT (unixepoch()),
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);
    
    db.query(`
      INSERT INTO security_audit_log 
      (user_id, action, description, ip_address, additional_data)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      userId, 
      action, 
      description, 
      ipAddress, 
      additionalData ? JSON.stringify(additionalData) : null
    );
    
    console.log(`[AUDIT] ${action}: ${description} (User: ${userId}, IP: ${ipAddress})`);
  } catch (error) {
    console.error('Failed to write audit log:', error);
    // In production, this should be handled more robustly
  }
}

// Generate secure cookie options
export function getSecureCookieOptions(maxAge?: number) {
  // Detect if we're in development (localhost) or production
  const isProduction = process.env.NODE_ENV === 'production';
  
  return {
    httpOnly: true,
    secure: isProduction, // Only require HTTPS in production
    sameSite: 'strict' as const,
    maxAge: maxAge || SECURITY_CONFIG.MAX_SESSION_DURATION / 1000, // Use max duration, not timeout
    path: '/'
  };
}

// Apply security headers to response
export function applySecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  
  Object.entries(SECURITY_CONFIG.SECURITY_HEADERS).forEach(([key, value]) => {
    headers.set(key, value);
  });
  
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

// Clean up expired sessions (should be run periodically)
export function cleanupExpiredSessions(): number {
  const now = Date.now();
  let cleanedCount = 0;
  
  const db = getDb();
  
  // Clean up expired sessions from memory and database
  for (const [sessionId, session] of sessionStore.entries()) {
    if (now - session.lastActivity > SECURITY_CONFIG.SESSION_TIMEOUT ||
        now - session.createdAt > SECURITY_CONFIG.MAX_SESSION_DURATION) {
      sessionStore.delete(sessionId);
      
      // Mark as inactive in database
      db.query(`
        UPDATE sessions 
        SET is_active = 0 
        WHERE session_id = ?
      `).run(sessionId);
      
      cleanedCount++;
    }
  }
  
  return cleanedCount;
}

// Initialize security module
export function initializeSecurity(): void {
  console.log('🔒 Security module initialized');
  console.log(`📋 Password policy: Min ${SECURITY_CONFIG.PASSWORD_MIN_LENGTH} chars, complexity required`);
  console.log(`⏰ Session timeout: ${SECURITY_CONFIG.SESSION_TIMEOUT / 1000 / 60} minutes`);
  console.log(`🚫 Max login attempts: ${SECURITY_CONFIG.MAX_LOGIN_ATTEMPTS}`);
  
  // Initialize session persistence
  initializeSessionStore();
  
  // Set up periodic cleanup
  setInterval(() => {
    const cleaned = cleanupExpiredSessions();
    if (cleaned > 0) {
      console.log(`🧹 Cleaned up ${cleaned} expired sessions`);
    }
  }, 5 * 60 * 1000); // Every 5 minutes
}