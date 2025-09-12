// Native Bun SQLite implementation without external dependencies
import { Database } from "bun:sqlite";

// User roles enum
export const UserRole = {
  ADMIN: 'admin',
  REQUESTOR: 'requestor',
  DAO: 'dao',
  APPROVER: 'approver',
  CPSO: 'cpso',
  DTA: 'dta',
  SME: 'sme',
  MEDIA_CUSTODIAN: 'media_custodian'
} as const;

export type UserRoleType = typeof UserRole[keyof typeof UserRole];

// AFT Status enum
export const AFTStatus = {
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  PENDING_DAO: 'pending_dao',
  PENDING_APPROVER: 'pending_approver',
  PENDING_CPSO: 'pending_cpso',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  PENDING_DTA: 'pending_dta',
  ACTIVE_TRANSFER: 'active_transfer',
  PENDING_SME_SIGNATURE: 'pending_sme_signature',
  PENDING_SME: 'pending_sme',
  PENDING_MEDIA_CUSTODIAN: 'pending_media_custodian',
  COMPLETED: 'completed',
  DISPOSED: 'disposed',
  CANCELLED: 'cancelled'
} as const;

// AFT Status Labels for display
export const AFT_STATUS_LABELS = {
  [AFTStatus.DRAFT]: 'Draft',
  [AFTStatus.SUBMITTED]: 'Submitted',
  [AFTStatus.PENDING_DAO]: 'Pending DAO Review',
  [AFTStatus.PENDING_APPROVER]: 'Pending ISSM Review',
  [AFTStatus.PENDING_CPSO]: 'Pending CPSO Review',
  [AFTStatus.APPROVED]: 'Approved',
  [AFTStatus.REJECTED]: 'Rejected',
  [AFTStatus.PENDING_DTA]: 'Pending DTA Processing',
  [AFTStatus.ACTIVE_TRANSFER]: 'Transfer in Progress',
  [AFTStatus.PENDING_SME_SIGNATURE]: 'Pending SME Signature',
  [AFTStatus.PENDING_SME]: 'Pending SME Review',
  [AFTStatus.PENDING_MEDIA_CUSTODIAN]: 'Pending Media Disposition',
  [AFTStatus.COMPLETED]: 'Completed',
  [AFTStatus.DISPOSED]: 'Media Disposed',
  [AFTStatus.CANCELLED]: 'Cancelled'
} as const;

export type AFTStatusType = typeof AFTStatus[keyof typeof AFTStatus];

// Database initialization
let db: Database;

export function getDb() {
  if (!db) {
    // Ensure data directory exists
    import("node:fs").then(fs => {
      try {
        fs.mkdirSync('./data', { recursive: true });
      } catch {
        // Directory might already exist
      }
    });
    
    db = new Database("./data/aft.db", { create: true });
    db.exec("PRAGMA journal_mode = WAL");
    
    // Create tables
    createTables();
    initializeDatabase();
    
    // Run migrations
    import("./database-migrations").then(m => {
      // Migrations run automatically on import
    }).catch(err => {
      console.error("Failed to run migrations:", err);
    });

  }
  return db;
}

function createTables() {
  // Users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      primary_role TEXT NOT NULL,
      organization TEXT,
      phone TEXT,
      is_active BOOLEAN DEFAULT 1,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    )
  `);

  // User Roles junction table
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      is_active BOOLEAN DEFAULT 1,
      assigned_by INTEGER REFERENCES users(id),
      created_at INTEGER DEFAULT (unixepoch())
    )
  `);

  // Media Drives for Media Custodian Management
  db.exec(`
    CREATE TABLE IF NOT EXISTS media_drives (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      serial_number TEXT UNIQUE NOT NULL,
      media_control_number TEXT,
      type TEXT NOT NULL,
      model TEXT NOT NULL,
      capacity TEXT NOT NULL,
      location TEXT,
      status TEXT DEFAULT 'available',
      issued_to_user_id INTEGER REFERENCES users(id),
      issued_at INTEGER,
      returned_at INTEGER,
      purpose TEXT,
      last_used INTEGER,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch())
    )
  `);

  // Migration: add media_control_number to existing media_drives if missing
  try {
    const colCheck = db.query("PRAGMA table_info(media_drives)").all() as Array<{ name: string }>;
    const hasMCN = colCheck.some(c => c.name === 'media_control_number');
    if (!hasMCN) {
      db.exec("ALTER TABLE media_drives ADD COLUMN media_control_number TEXT");
      console.log("✓ Added media_control_number column to media_drives");
    }
  } catch (e) {
    console.error('Failed to migrate media_drives schema:', e);
  }

  // Migration: add Section 4 (Anti-Virus Scan and TPI) fields to aft_requests
  try {
    const aftColCheck = db.query("PRAGMA table_info(aft_requests)").all() as Array<{ name: string }>;
    const existingCols = aftColCheck.map(c => c.name);
    
    // Section IV Anti-Virus Scan fields
    if (!existingCols.includes('origination_scan_performed')) {
      db.exec("ALTER TABLE aft_requests ADD COLUMN origination_scan_performed BOOLEAN DEFAULT 0");
    }
    if (!existingCols.includes('origination_files_scanned')) {
      db.exec("ALTER TABLE aft_requests ADD COLUMN origination_files_scanned INTEGER");
    }
    if (!existingCols.includes('origination_threats_found')) {
      db.exec("ALTER TABLE aft_requests ADD COLUMN origination_threats_found INTEGER DEFAULT 0");
    }
    if (!existingCols.includes('destination_scan_performed')) {
      db.exec("ALTER TABLE aft_requests ADD COLUMN destination_scan_performed BOOLEAN DEFAULT 0");
    }
    if (!existingCols.includes('destination_files_scanned')) {
      db.exec("ALTER TABLE aft_requests ADD COLUMN destination_files_scanned INTEGER");
    }
    if (!existingCols.includes('destination_threats_found')) {
      db.exec("ALTER TABLE aft_requests ADD COLUMN destination_threats_found INTEGER DEFAULT 0");
    }
    
    // Transfer completion fields
    if (!existingCols.includes('transfer_completed_date')) {
      db.exec("ALTER TABLE aft_requests ADD COLUMN transfer_completed_date INTEGER");
    }
    if (!existingCols.includes('files_transferred_count')) {
      db.exec("ALTER TABLE aft_requests ADD COLUMN files_transferred_count INTEGER");
    }
    if (!existingCols.includes('dta_signature_date')) {
      db.exec("ALTER TABLE aft_requests ADD COLUMN dta_signature_date INTEGER");
    }
    if (!existingCols.includes('sme_signature_date')) {
      db.exec("ALTER TABLE aft_requests ADD COLUMN sme_signature_date INTEGER");
    }
    if (!existingCols.includes('assigned_sme_id')) {
      db.exec("ALTER TABLE aft_requests ADD COLUMN assigned_sme_id INTEGER REFERENCES users(id)");
    }
    if (!existingCols.includes('tpi_maintained')) {
      db.exec("ALTER TABLE aft_requests ADD COLUMN tpi_maintained BOOLEAN DEFAULT 0");
    }
    
    // Section V Media Disposition fields
    if (!existingCols.includes('disposition_optical_destroyed')) {
      db.exec("ALTER TABLE aft_requests ADD COLUMN disposition_optical_destroyed TEXT");
    }
    if (!existingCols.includes('disposition_optical_retained')) {
      db.exec("ALTER TABLE aft_requests ADD COLUMN disposition_optical_retained TEXT");
    }
    if (!existingCols.includes('disposition_ssd_sanitized')) {
      db.exec("ALTER TABLE aft_requests ADD COLUMN disposition_ssd_sanitized TEXT");
    }
    if (!existingCols.includes('disposition_custodian_name')) {
      db.exec("ALTER TABLE aft_requests ADD COLUMN disposition_custodian_name TEXT");
    }
    if (!existingCols.includes('disposition_date')) {
      db.exec("ALTER TABLE aft_requests ADD COLUMN disposition_date INTEGER");
    }
    if (!existingCols.includes('disposition_signature')) {
      db.exec("ALTER TABLE aft_requests ADD COLUMN disposition_signature TEXT");
    }
    if (!existingCols.includes('disposition_notes')) {
      db.exec("ALTER TABLE aft_requests ADD COLUMN disposition_notes TEXT");
    }
    if (!existingCols.includes('disposition_completed_at')) {
      db.exec("ALTER TABLE aft_requests ADD COLUMN disposition_completed_at INTEGER");
    }
    if (!existingCols.includes('additional_systems')) {
      db.exec("ALTER TABLE aft_requests ADD COLUMN additional_systems TEXT");
    }
    
    console.log("✓ DTA Section 4 and Media Disposition migrations completed successfully");
  } catch (e) {
    console.error('Failed to migrate aft_requests schema for DTA Section 4 and Media Disposition:', e);
  }

  // AFT Requests table
  db.exec(`
    CREATE TABLE IF NOT EXISTS aft_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_number TEXT UNIQUE NOT NULL,
      requestor_id INTEGER NOT NULL REFERENCES users(id),
      approver_id INTEGER REFERENCES users(id),
      dta_id INTEGER REFERENCES users(id),
      sme_id INTEGER REFERENCES users(id),
      media_custodian_id INTEGER REFERENCES users(id),
      tpi_required BOOLEAN DEFAULT 1,
      status TEXT DEFAULT 'draft',
      requestor_name TEXT NOT NULL,
      requestor_org TEXT NOT NULL,
      requestor_phone TEXT NOT NULL,
      requestor_email TEXT NOT NULL,
      transfer_purpose TEXT NOT NULL,
      transfer_type TEXT NOT NULL,
      classification TEXT NOT NULL,
      caveat_info TEXT,
      data_description TEXT NOT NULL,
      source_system TEXT,
      source_location TEXT,
      source_contact TEXT,
      source_phone TEXT,
      source_email TEXT,
      dest_system TEXT,
      dest_location TEXT,
      dest_contact TEXT,
      dest_phone TEXT,
      dest_email TEXT,
      data_format TEXT,
      data_size TEXT,
      transfer_method TEXT,
      encryption TEXT,
      compression_required BOOLEAN,
      files_list TEXT,
      additional_file_list_attached BOOLEAN DEFAULT 0,
      selected_drive_id INTEGER REFERENCES media_drives(id),
      requested_start_date INTEGER,
      requested_end_date INTEGER,
      urgency_level TEXT,
      actual_start_date INTEGER,
      actual_end_date INTEGER,
      transfer_notes TEXT,
      transfer_data TEXT,
      verification_type TEXT,
      verification_results TEXT,
      approval_date INTEGER,
      approval_notes TEXT,
      approval_data TEXT,
      rejection_reason TEXT,
      created_at INTEGER DEFAULT (unixepoch()),
      updated_at INTEGER DEFAULT (unixepoch()),
      -- Media Disposition fields (Section V)
      disposition_optical_destroyed TEXT,
      disposition_optical_retained TEXT,
      disposition_ssd_sanitized TEXT,
      disposition_custodian_name TEXT,
      disposition_date INTEGER,
      disposition_signature TEXT,
      disposition_notes TEXT,
      disposition_completed_at INTEGER,
      additional_systems TEXT
    )
  `);

  // Audit log table
  db.exec(`
    CREATE TABLE IF NOT EXISTS aft_audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id INTEGER REFERENCES aft_requests(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id),
      action TEXT NOT NULL,
      old_status TEXT,
      new_status TEXT,
      changes TEXT,
      notes TEXT,
      created_at INTEGER DEFAULT (unixepoch())
    )
  `);


  // CAC Signatures
  db.exec(`
    CREATE TABLE IF NOT EXISTS cac_signatures (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id INTEGER NOT NULL REFERENCES aft_requests(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id),
      step_type TEXT NOT NULL,
      certificate_subject TEXT NOT NULL,
      certificate_issuer TEXT NOT NULL,
      certificate_serial TEXT NOT NULL,
      certificate_thumbprint TEXT NOT NULL,
      certificate_not_before INTEGER NOT NULL,
      certificate_not_after INTEGER NOT NULL,
      signature_data TEXT NOT NULL,
      signed_data TEXT NOT NULL,
      signature_algorithm TEXT DEFAULT 'RSA-SHA256',
      signature_reason TEXT,
      signature_location TEXT,
      ip_address TEXT,
      user_agent TEXT,
      is_verified BOOLEAN DEFAULT 0,
      verified_at INTEGER,
      verification_notes TEXT,
      created_at INTEGER DEFAULT (unixepoch())
    )
  `);

  // CAC Trust Store
  db.exec(`
    CREATE TABLE IF NOT EXISTS cac_trust_store (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      certificate_name TEXT NOT NULL,
      certificate_data TEXT NOT NULL,
      certificate_thumbprint TEXT UNIQUE NOT NULL,
      issuer_dn TEXT NOT NULL,
      subject_dn TEXT NOT NULL,
      not_before INTEGER NOT NULL,
      not_after INTEGER NOT NULL,
      is_active BOOLEAN DEFAULT 1,
      is_root_ca BOOLEAN DEFAULT 0,
      created_at INTEGER DEFAULT (unixepoch())
    )
  `);

  // System Settings table
  db.exec(`
    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    )
  `);
}

// Hash password using Bun's built-in crypto
async function hashPassword(password: string): Promise<string> {
  return await Bun.password.hash(password, {
    algorithm: "bcrypt",
    cost: 12,
  });
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return await Bun.password.verify(password, hash);
}

// Initialize database with default admin user
async function initializeDatabase() {
  try {
    // Check if admin user already exists
    const adminCheck = db.query("SELECT id FROM users WHERE email = 'admin@aft.gov'").get() as { id: number } | undefined;
    
    if (!adminCheck) {
      // Create admin user
      const adminPassword = 'admin123'; // Default password, should be changed on first login
      const hashedPassword = await hashPassword(adminPassword);
      
      // Insert admin user
      const adminStmt = db.prepare(`
        INSERT INTO users (email, password, first_name, last_name, primary_role, is_active, organization, phone)
        VALUES (?, ?, ?, ?, ?, 1, 'System', 'N/A')
      `);
      
      const result = adminStmt.run(
        'admin@aft.gov',
        hashedPassword,
        'System',
        'Administrator',
        UserRole.ADMIN
      ) as any;
      
      const adminId = result.lastInsertRowid as number;
      
      // Add admin role
      const roleStmt = db.prepare(`
        INSERT INTO user_roles (user_id, role, is_active, assigned_by)
        VALUES (?, ?, 1, ?)
      `);
      
      roleStmt.run(adminId, UserRole.ADMIN, adminId);
      
      console.log('✓ Created default admin user');
      console.log('  Email: admin@  aft.gov');
      console.log('  Password: admin123');
    }
  } catch (error) {
    console.error('Database initialization failed:', error);
    throw error; // Re-throw to allow proper error handling upstream
  }
}

// Utility functions
export function generateRequestNumber(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `AFT-${timestamp}-${random}`;
}

// Get all active roles for a user
export function getUserRoles(userId: number): Array<{ role: UserRoleType; isPrimary: boolean }> {
  const db = getDb();
  
  // Get user's primary role
  const user = db.query("SELECT primary_role FROM users WHERE id = ? AND is_active = 1").get(userId) as any;
  if (!user) return [];
  
  // Get all active roles from user_roles table
  let userRoles = db.query(`
    SELECT role FROM user_roles 
    WHERE user_id = ? AND is_active = 1
    ORDER BY created_at ASC
  `).all(userId) as Array<{ role: UserRoleType }>;
  
  // If user is a Media Custodian, remove the requestor role if it exists
  if (user.primary_role === UserRole.MEDIA_CUSTODIAN) {
    userRoles = userRoles.filter(ur => ur.role !== UserRole.REQUESTOR);
  }
  
  // Map to include primary role flag
  const rolesWithFlags = userRoles.map(ur => ({
    role: ur.role,
    isPrimary: ur.role === user.primary_role
  }));
  
  // Ensure primary role is included if not in user_roles table
  if (!rolesWithFlags.some(r => r.isPrimary)) {
    // If primary role is requestor but user is a Media Custodian, don't add it
    if (!(user.primary_role === UserRole.REQUESTOR && user.primary_role !== UserRole.MEDIA_CUSTODIAN)) {
      rolesWithFlags.unshift({
        role: user.primary_role,
        isPrimary: true
      });
    }
  }
  
  return rolesWithFlags;
}

export async function backupDatabase(): Promise<string> {
  const db = getDb();
  const backupDir = './data/backups';

  // Ensure backup directory exists
  const fs = await import('node:fs');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFileName = `aft-backup-${timestamp}.db`;
  const backupPath = `${backupDir}/${backupFileName}`;

  // Use the built-in backup method
  await (db as any).backup(backupPath);

  return backupPath;
}

export function runMaintenance() {
  const db = getDb();
  
  // Rebuild the database file, repacking it into a minimal amount of disk space.
  db.exec("VACUUM;");
  
  // Gathers statistics about tables and indices for the query planner.
  db.exec("ANALYZE;");
}

// Get role display information
export function getRoleDisplayName(role: UserRoleType): string {
  const roleNames = {
    [UserRole.ADMIN]: 'System Administrator',
    [UserRole.REQUESTOR]: 'Request Submitter',
    [UserRole.DAO]: 'Designated Authorizing Official',
    [UserRole.APPROVER]: 'Information System Security Manager',
    [UserRole.CPSO]: 'Contractor Program Security Officer',
    [UserRole.DTA]: 'Data Transfer Agent',
    [UserRole.SME]: 'Subject Matter Expert',
    [UserRole.MEDIA_CUSTODIAN]: 'Media Custodian'
  };
  return roleNames[role] || role;
}

// Get role description
export function getRoleDescription(role: UserRoleType): string {
  const roleDescriptions = {
    [UserRole.ADMIN]: 'Full system administration and user management',
    [UserRole.REQUESTOR]: 'Submit and track AFT requests',
    [UserRole.DAO]: 'Approve requests for high-to-low transfers',
    [UserRole.APPROVER]: 'Security review and approval of requests',
    [UserRole.CPSO]: 'Contractor security oversight and approval',
    [UserRole.DTA]: 'Coordinate and execute data transfers',
    [UserRole.SME]: 'Technical review and digital signatures',
    [UserRole.MEDIA_CUSTODIAN]: 'Physical media management and disposition'
  };
  return roleDescriptions[role] || 'Role-specific access';
}

// System Settings functions
export function getSystemSettings(): Record<string, string> {
  const db = getDb();
  const settingsList = db.query("SELECT key, value FROM system_settings").all() as { key: string, value: string }[];
  
  return settingsList.reduce((acc, setting) => {
    acc[setting.key] = setting.value;
    return acc;
  }, {} as Record<string, string>);
}

export function saveSystemSettings(settings: Record<string, string>) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO system_settings (key, value, updated_at)
    VALUES (?, ?, unixepoch())
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = unixepoch();
  `);

  db.transaction(() => {
    for (const [key, value] of Object.entries(settings)) {
      stmt.run(key, value);
    }
  })();
}

// Type definitions
export type User = {
  id: number;
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  primary_role: UserRoleType;
  organization?: string;
  phone?: string;
  is_active: boolean;
  created_at: number;
  updated_at: number;
};

export type AFTRequest = {
  id: number;
  request_number: string;
  requestor_id: number;
  approver_id?: number;
  dta_id?: number;
  sme_id?: number;
  media_custodian_id?: number;
  tpi_required: boolean;
  status: AFTStatusType;
  requestor_name: string;
  requestor_org: string;
  requestor_phone: string;
  requestor_email: string;
  transfer_purpose: string;
  transfer_type: string;
  classification: string;
  caveat_info?: string;
  data_description: string;
  source_system?: string;
  source_location?: string;
  source_contact?: string;
  source_phone?: string;
  source_email?: string;
  dest_system?: string;
  dest_location?: string;
  dest_contact?: string;
  dest_phone?: string;
  dest_email?: string;
  data_format?: string;
  data_size?: string;
  transfer_method?: string;
  encryption?: string;
  compression_required?: boolean;
  files_list?: string;
  additional_file_list_attached: boolean;
  selected_drive_id?: number;
  requested_start_date?: number;
  requested_end_date?: number;
  urgency_level?: string;
  actual_start_date?: number;
  actual_end_date?: number;
  transfer_notes?: string;
  transfer_data?: string;
  verification_type?: string;
  verification_results?: string;
  approval_date?: number;
  approval_notes?: string;
  approval_data?: string;
  rejection_reason?: string;
  created_at: number;
  updated_at: number;
};

export type FileItem = {
  fileName: string;
  fileType: string;
  fileSize?: string;
  description?: string;
};