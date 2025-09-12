// CAC Certificate Library for AFT Application
// Handles DOD CAC certificate reading and digital signature operations

export interface CACCertificate {
  thumbprint: string;
  subject: string;
  issuer: string;
  validFrom: Date;
  validTo: Date;
  serialNumber: string;
  hasPrivateKey: boolean;
  keyUsage: string[];
  enhancedKeyUsage: string[];
  certificateData: string; // Base64 encoded certificate
}

export interface CACSignatureResult {
  signature: string; // Base64 encoded signature
  certificate: CACCertificate;
  timestamp: Date;
  algorithm: string;
}

export interface CACReaderStatus {
  isConnected: boolean;
  readerName?: string;
  cardPresent: boolean;
  cardType?: string;
  certificates?: CACCertificate[];
  error?: string;
}

// CAC Certificate Reader class
export class CACCertificateReader {
  private nativeMessagingPort: any = null;
  private isConnected: boolean = false;
  private listeners: Map<string, Function[]> = new Map();

  constructor() {
    this.initializeListeners();
  }

  private initializeListeners(): void {
    this.listeners.set('status', []);
    this.listeners.set('error', []);
    this.listeners.set('certificate', []);
    this.listeners.set('signature', []);
  }

  // Event listener management
  public addEventListener(event: string, callback: Function): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);
  }

  public removeEventListener(event: string, callback: Function): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  private emit(event: string, data: any): void {
    const callbacks = this.listeners.get(event) || [];
    callbacks.forEach(callback => callback(data));
  }

  // Check if browser supports native messaging
  public static isBrowserSupported(): boolean {
    // Check if Chrome extension APIs are available
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.connectNative) {
      return true;
    }
    
    // Check if Firefox WebExtension APIs are available
    if (typeof browser !== 'undefined' && browser.runtime && browser.runtime.connectNative) {
      return true;
    }

    return false;
  }

  // Connect to native CAC reader application
  public async connect(): Promise<boolean> {
    if (!CACCertificateReader.isBrowserSupported()) {
      this.emit('error', { message: 'Browser does not support native messaging for CAC operations' });
      return false;
    }

    try {
      // Connect to native messaging host
      const runtime = (typeof chrome !== 'undefined') ? chrome.runtime : browser.runtime;
      
      this.nativeMessagingPort = runtime.connectNative('com.dod.aft.cac_reader');
      
      if (!this.nativeMessagingPort) {
        throw new Error('Failed to connect to CAC reader native application');
      }

      // Set up message handling
      this.nativeMessagingPort.onMessage.addListener((message: any) => {
        this.handleNativeMessage(message);
      });

      this.nativeMessagingPort.onDisconnect.addListener(() => {
        this.isConnected = false;
        this.emit('status', { isConnected: false, error: 'Native application disconnected' });
      });

      // Send initial connection message
      this.nativeMessagingPort.postMessage({ action: 'connect' });
      
      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          resolve(false);
        }, 5000);

        this.addEventListener('status', (status: CACReaderStatus) => {
          clearTimeout(timeout);
          this.isConnected = status.isConnected;
          resolve(status.isConnected);
        });
      });

    } catch (error) {
      this.emit('error', { message: `Failed to connect to CAC reader: ${error}` });
      return false;
    }
  }

  // Handle messages from native application
  private handleNativeMessage(message: any): void {
    switch (message.type) {
      case 'status':
        this.emit('status', message.data as CACReaderStatus);
        break;
      case 'certificates':
        this.emit('certificate', message.data.certificates as CACCertificate[]);
        break;
      case 'signature':
        this.emit('signature', message.data as CACSignatureResult);
        break;
      case 'error':
        this.emit('error', { message: message.data.message });
        break;
    }
  }

  // Get CAC reader status
  public async getStatus(): Promise<CACReaderStatus> {
    if (!this.isConnected) {
      return { isConnected: false, cardPresent: false, error: 'Not connected to CAC reader' };
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timeout getting CAC status'));
      }, 10000);

      this.nativeMessagingPort.postMessage({ action: 'getStatus' });

      this.addEventListener('status', (status: CACReaderStatus) => {
        clearTimeout(timeout);
        resolve(status);
      });
    });
  }

  // Read certificates from CAC
  public async readCertificates(): Promise<CACCertificate[]> {
    if (!this.isConnected) {
      throw new Error('Not connected to CAC reader');
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timeout reading CAC certificates'));
      }, 15000);

      this.nativeMessagingPort.postMessage({ action: 'readCertificates' });

      this.addEventListener('certificate', (certificates: CACCertificate[]) => {
        clearTimeout(timeout);
        resolve(certificates);
      });
    });
  }

  // Sign data with CAC certificate
  public async signData(data: string, certificateThumbprint: string, pin: string): Promise<CACSignatureResult> {
    if (!this.isConnected) {
      throw new Error('Not connected to CAC reader');
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timeout signing data with CAC'));
      }, 30000);

      this.nativeMessagingPort.postMessage({
        action: 'signData',
        data: {
          data: data,
          certificateThumbprint: certificateThumbprint,
          pin: pin
        }
      });

      this.addEventListener('signature', (result: CACSignatureResult) => {
        clearTimeout(timeout);
        resolve(result);
      });

      this.addEventListener('error', (error: any) => {
        clearTimeout(timeout);
        reject(new Error(error.message));
      });
    });
  }

  // Verify PIN
  public async verifyPIN(pin: string): Promise<boolean> {
    if (!this.isConnected) {
      throw new Error('Not connected to CAC reader');
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timeout verifying PIN'));
      }, 15000);

      this.nativeMessagingPort.postMessage({
        action: 'verifyPIN',
        data: { pin: pin }
      });

      this.addEventListener('status', (status: CACReaderStatus) => {
        clearTimeout(timeout);
        resolve(!status.error);
      });
    });
  }

  // Disconnect from CAC reader
  public disconnect(): void {
    if (this.nativeMessagingPort) {
      this.nativeMessagingPort.disconnect();
      this.nativeMessagingPort = null;
    }
    this.isConnected = false;
  }
}

// Utility functions for certificate operations
export class CACCertificateUtils {
  // Parse certificate subject
  public static parseSubject(subject: string): Record<string, string> {
    const parsed: Record<string, string> = {};
    const parts = subject.split(',');
    
    parts.forEach(part => {
      const [key, value] = part.trim().split('=');
      if (key && value) {
        parsed[key.trim()] = value.trim();
      }
    });

    return parsed;
  }

  // Extract common name from certificate subject
  public static getCommonName(certificate: CACCertificate): string {
    const subject = this.parseSubject(certificate.subject);
    return subject.CN || subject.commonName || 'Unknown';
  }

  // Check if certificate is valid for signing
  public static isValidForSigning(certificate: CACCertificate): boolean {
    const now = new Date();
    
    // Check validity period
    if (now < certificate.validFrom || now > certificate.validTo) {
      return false;
    }

    // Check if certificate has private key
    if (!certificate.hasPrivateKey) {
      return false;
    }

    // Check key usage
    const signingUsages = ['digitalSignature', 'nonRepudiation'];
    const hasSigningUsage = certificate.keyUsage.some(usage => 
      signingUsages.some(signingUsage => 
        usage.toLowerCase().includes(signingUsage.toLowerCase())
      )
    );

    return hasSigningUsage;
  }

  // Get certificate display name
  public static getDisplayName(certificate: CACCertificate): string {
    const subject = this.parseSubject(certificate.subject);
    const name = subject.CN || subject.commonName;
    
    if (name) {
      // Extract name parts for better display
      const nameParts = name.split('.');
      if (nameParts.length >= 2) {
        return `${nameParts[1]} ${nameParts[0]}`.toUpperCase();
      }
      return name;
    }

    return 'DOD Certificate';
  }

  // Format certificate for display
  public static formatCertificate(certificate: CACCertificate): string {
    const name = this.getDisplayName(certificate);
    const validUntil = certificate.validTo.toLocaleDateString();
    return `${name} (Expires: ${validUntil})`;
  }
}

// Signature verification utilities
export class CACSignatureVerifier {
  // Verify a CAC signature
  public static async verifySignature(
    data: string,
    signature: string,
    certificate: CACCertificate
  ): Promise<boolean> {
    try {
      // Convert base64 certificate to ArrayBuffer
      const certBytes = this.base64ToArrayBuffer(certificate.certificateData);
      
      // Extract public key from certificate (simplified - in real implementation, use proper X.509 parsing)
      const publicKey = await this.extractPublicKeyFromCertificate(certBytes);
      
      // Verify signature using Web Crypto API
      const dataBytes = new TextEncoder().encode(data);
      const signatureBytes = this.base64ToArrayBuffer(signature);
      
      return await crypto.subtle.verify(
        { name: 'RSASSA-PKCS1-v1_5' },
        publicKey,
        signatureBytes,
        dataBytes
      );
    } catch (error) {
      console.error('Error verifying CAC signature:', error);
      return false;
    }
  }

  private static base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  private static async extractPublicKeyFromCertificate(certBytes: ArrayBuffer): Promise<CryptoKey> {
    // This is a simplified implementation
    // In a real implementation, you would need to properly parse the X.509 certificate
    // and extract the public key using ASN.1 parsing libraries
    
    // For now, we'll assume the certificate format is compatible with Web Crypto API
    return await crypto.subtle.importKey(
      'spki',
      certBytes,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify']
    );
  }
}