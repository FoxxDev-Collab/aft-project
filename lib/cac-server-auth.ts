// DOD CAC Server-Side Client Certificate Authentication
// This is the proper way DOD applications handle CAC authentication

import { getDb } from "./database-bun";
import { auditLog } from "./security";

export interface CACClientCertificate {
  subject: string;
  issuer: string;
  serialNumber: string;
  validFrom: Date;
  validTo: Date;
  fingerprint: string;
  pem: string;
  dodId?: string;
  email?: string;
  commonName?: string;
}

export class CACServerAuth {
  
  // Extract DOD ID from certificate subject
  static extractDODID(subject: string): string | null {
    // CAC certificates typically have DOD ID in the subject
    // Format: CN=LAST.FIRST.MIDDLE.1234567890 or similar
    const cnMatch = subject.match(/CN=([^,]+)/);
    if (cnMatch) {
      const commonName = cnMatch[1];
      // Extract 10-digit DOD ID (EDIPI)
      const dodIdMatch = commonName.match(/(\d{10})/);
      return dodIdMatch ? dodIdMatch[1] : null;
    }
    return null;
  }

  // Extract email from certificate
  static extractEmail(subject: string): string | null {
    const emailMatch = subject.match(/emailAddress=([^,]+)/);
    return emailMatch ? emailMatch[1] : null;
  }

  // Parse certificate subject into components
  static parseSubject(subject: string): Record<string, string> {
    const parsed: Record<string, string> = {};
    const parts = subject.split(',');
    
    parts.forEach(part => {
      const trimmed = part.trim();
      const equalIndex = trimmed.indexOf('=');
      if (equalIndex > 0) {
        const key = trimmed.substring(0, equalIndex).trim();
        const value = trimmed.substring(equalIndex + 1).trim();
        parsed[key] = value;
      }
    });

    return parsed;
  }

  // Validate that certificate is from DOD CA
  static isDODCertificate(certificate: CACClientCertificate): boolean {
    // Check if issuer contains DOD certificate authorities
    const dodCAs = [
      'DOD CA-',
      'DEPARTMENT OF DEFENSE',
      'DOD ID CA-',
      'DOD EMAIL CA-'
    ];

    return dodCAs.some(ca => 
      certificate.issuer.toUpperCase().includes(ca.toUpperCase())
    );
  }

  // Validate certificate is currently valid
  static isValidCertificate(certificate: CACClientCertificate): boolean {
    const now = new Date();
    return now >= certificate.validFrom && now <= certificate.validTo;
  }

  // Get or create user from CAC certificate
  static async getUserFromCertificate(certificate: CACClientCertificate): Promise<any> {
    const db = getDb();
    
    const dodId = this.extractDODID(certificate.subject);
    const email = this.extractEmail(certificate.subject);
    const subject = this.parseSubject(certificate.subject);
    const commonName = subject.CN || '';

    // Try to find existing user by DOD ID first, then by certificate fingerprint
    let user = null;
    
    if (dodId) {
      user = db.query(`
        SELECT * FROM users WHERE dod_id = ? OR email = ?
      `).get(dodId, email) as any;
    }

    if (!user && certificate.fingerprint) {
      user = db.query(`
        SELECT u.* FROM users u
        JOIN cac_certificates cc ON cc.user_id = u.id
        WHERE cc.fingerprint = ?
      `).get(certificate.fingerprint) as any;
    }

    // Create new user if not found
    if (!user && dodId && email) {
      const nameParts = commonName.split('.');
      const lastName = nameParts[0] || 'Unknown';
      const firstName = nameParts[1] || 'Unknown';

      const userId = db.query(`
        INSERT INTO users (
          email, first_name, last_name, is_active, dod_id, 
          created_at, updated_at
        ) VALUES (?, ?, ?, 1, ?, unixepoch(), unixepoch())
      `).run(email, firstName, lastName, dodId).lastInsertRowid as number;

      user = db.query(`SELECT * FROM users WHERE id = ?`).get(userId) as any;

      // Store certificate information
      this.storeCertificate(userId, certificate);
    }

    return user;
  }

  // Store CAC certificate information
  static storeCertificate(userId: number, certificate: CACClientCertificate): void {
    const db = getDb();

    // Create CAC certificates table if not exists
    db.exec(`
      CREATE TABLE IF NOT EXISTS cac_certificates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        subject TEXT NOT NULL,
        issuer TEXT NOT NULL,
        serial_number TEXT NOT NULL,
        fingerprint TEXT NOT NULL UNIQUE,
        valid_from INTEGER NOT NULL,
        valid_to INTEGER NOT NULL,
        pem_data TEXT,
        created_at INTEGER DEFAULT (unixepoch()),
        updated_at INTEGER DEFAULT (unixepoch()),
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    // Insert or update certificate
    db.query(`
      INSERT OR REPLACE INTO cac_certificates (
        user_id, subject, issuer, serial_number, fingerprint,
        valid_from, valid_to, pem_data, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, unixepoch())
    `).run(
      userId,
      certificate.subject,
      certificate.issuer,
      certificate.serialNumber,
      certificate.fingerprint,
      Math.floor(certificate.validFrom.getTime() / 1000),
      Math.floor(certificate.validTo.getTime() / 1000),
      certificate.pem
    );
  }

  // Authenticate user with client certificate
  static async authenticateWithCertificate(
    certificate: CACClientCertificate,
    ipAddress: string
  ): Promise<{ success: boolean; user?: any; error?: string }> {
    try {
      // Validate certificate is from DOD
      if (!this.isDODCertificate(certificate)) {
        return { success: false, error: 'Certificate must be issued by DOD Certificate Authority' };
      }

      // Validate certificate is not expired
      if (!this.isValidCertificate(certificate)) {
        return { success: false, error: 'Certificate has expired or is not yet valid' };
      }

      // Get or create user from certificate
      const user = await this.getUserFromCertificate(certificate);
      
      if (!user) {
        return { success: false, error: 'Unable to create or find user from certificate' };
      }

      if (!user.is_active) {
        return { success: false, error: 'User account is disabled' };
      }

      // Log successful authentication
      await auditLog(
        user.id,
        'CAC_AUTHENTICATION_SUCCESS',
        'User authenticated with CAC certificate',
        ipAddress,
        {
          certificateSubject: certificate.subject,
          certificateFingerprint: certificate.fingerprint,
          dodId: this.extractDODID(certificate.subject)
        }
      );

      return { success: true, user };

    } catch (error) {
      console.error('CAC authentication error:', error);
      return { success: false, error: 'Authentication failed due to server error' };
    }
  }

  // Configure Bun server for client certificate authentication
  static getServerConfig(certPath: string, keyPath: string, caCertPath: string) {
    return {
      port: 443, // HTTPS required for client certificates
      tls: {
        cert: Bun.file(certPath),
        key: Bun.file(keyPath),
        ca: Bun.file(caCertPath), // DOD CA certificates
        requestCert: true,        // Request client certificate
        rejectUnauthorized: false // Allow validation in application code
      }
    };
  }

  // Extract client certificate from request
  static getClientCertificate(request: Request): CACClientCertificate | null {
    // In a real implementation, this would extract the certificate from the TLS context
    // For now, this is a placeholder that would be implemented based on the specific
    // server framework being used
    
    // Example of what might be available:
    // const cert = request.socket?.getPeerCertificate();
    
    return null; // Placeholder - needs actual implementation
  }
}

// Middleware to handle CAC authentication
export async function CACAuthMiddleware(
  request: Request, 
  ipAddress: string
): Promise<{ success: boolean; user?: any; error?: string }> {
  
  const clientCert = CACServerAuth.getClientCertificate(request);
  
  if (!clientCert) {
    return { success: false, error: 'No client certificate provided' };
  }

  return await CACServerAuth.authenticateWithCertificate(clientCert, ipAddress);
}