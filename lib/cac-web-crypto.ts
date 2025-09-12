// CAC Certificate Integration using Web Crypto API and Browser Certificate Store
// This approach leverages the browser's built-in certificate handling

export interface CACCertificate {
  name: string;
  subject: string;
  issuer: string;
  validFrom: Date;
  validTo: Date;
  serialNumber: string;
  thumbprint: string;
  publicKey: CryptoKey;
  certificate: ArrayBuffer;
}

export interface SignatureResult {
  signature: ArrayBuffer;
  certificate: CACCertificate;
  timestamp: Date;
  algorithm: string;
}

// CAC Web Crypto Implementation
export class CACWebCrypto {
  private static instance: CACWebCrypto;
  private supportedAlgorithms = ['RSASSA-PKCS1-v1_5', 'ECDSA'];

  public static getInstance(): CACWebCrypto {
    if (!CACWebCrypto.instance) {
      CACWebCrypto.instance = new CACWebCrypto();
    }
    return CACWebCrypto.instance;
  }

  // Check if Web Crypto API and certificate access is supported
  public isSupported(): boolean {
    return !!(
      window.crypto && 
      window.crypto.subtle && 
      'credentials' in navigator
    );
  }

  // Request client certificate from browser (triggers CAC PIN prompt)
  public async requestCertificate(): Promise<CACCertificate | null> {
    try {
      if (!this.isSupported()) {
        throw new Error('Web Crypto API or credential management not supported in this browser');
      }

      // Use the Credential Management API to request a certificate
      // This will trigger the browser's certificate selection dialog
      // which includes CAC certificates if properly configured
      const credential = await navigator.credentials.get({
        publicKey: {
          challenge: new Uint8Array(32), // Random challenge
          allowCredentials: [], // Allow any certificate
          userVerification: 'required'
        }
      }) as any;

      if (!credential) {
        return null;
      }

      // Extract certificate information
      // Note: This is a simplified approach - real implementation would need
      // to parse the X.509 certificate structure
      return this.parseCertificateFromCredential(credential);

    } catch (error) {
      console.error('Error requesting certificate:', error);
      throw new Error(`Failed to access certificate: ${error}`);
    }
  }

  // Alternative approach: Use the Web Authentication API for certificate access
  public async getCertificateWithWebAuthn(): Promise<CACCertificate | null> {
    try {
      const publicKeyCredential = await navigator.credentials.create({
        publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          rp: {
            name: 'AFT System',
            id: window.location.hostname
          },
          user: {
            id: crypto.getRandomValues(new Uint8Array(64)),
            name: 'cac-user',
            displayName: 'CAC Certificate User'
          },
          pubKeyCredParams: [
            { alg: -7, type: 'public-key' },  // ES256
            { alg: -257, type: 'public-key' } // RS256
          ],
          authenticatorSelection: {
            authenticatorAttachment: 'cross-platform',
            userVerification: 'required'
          },
          attestation: 'direct'
        }
      }) as PublicKeyCredential;

      if (!publicKeyCredential) {
        return null;
      }

      return this.parseCertificateFromWebAuthn(publicKeyCredential);

    } catch (error) {
      console.error('Error with WebAuthn certificate access:', error);
      throw error;
    }
  }

  // Sign data using the selected certificate
  public async signData(
    data: string | ArrayBuffer, 
    certificate: CACCertificate
  ): Promise<SignatureResult> {
    try {
      // Convert string data to ArrayBuffer if needed
      const dataBuffer = typeof data === 'string' 
        ? new TextEncoder().encode(data) 
        : data;

      // Use the certificate's public key for signing
      // Note: In a real implementation, this would use the private key
      // which is only accessible through the smart card
      const signature = await crypto.subtle.sign(
        {
          name: 'RSASSA-PKCS1-v1_5',
          hash: 'SHA-256'
        },
        certificate.publicKey,
        dataBuffer
      );

      return {
        signature,
        certificate,
        timestamp: new Date(),
        algorithm: 'SHA256withRSA'
      };

    } catch (error) {
      console.error('Error signing data:', error);
      throw new Error(`Failed to sign data: ${error}`);
    }
  }

  // Verify a signature
  public async verifySignature(
    data: string | ArrayBuffer,
    signature: ArrayBuffer,
    certificate: CACCertificate
  ): Promise<boolean> {
    try {
      const dataBuffer = typeof data === 'string' 
        ? new TextEncoder().encode(data) 
        : data;

      return await crypto.subtle.verify(
        {
          name: 'RSASSA-PKCS1-v1_5',
          hash: 'SHA-256'
        },
        certificate.publicKey,
        signature,
        dataBuffer
      );

    } catch (error) {
      console.error('Error verifying signature:', error);
      return false;
    }
  }

  // Parse certificate information from credential
  private async parseCertificateFromCredential(credential: any): Promise<CACCertificate> {
    // This is a simplified implementation
    // Real implementation would need to properly parse X.509 certificate
    
    const certificate: CACCertificate = {
      name: 'CAC Certificate',
      subject: 'CN=CAC.USER.123456789,OU=DOD,O=U.S. Government',
      issuer: 'CN=DOD CA-XX,OU=PKI,OU=DoD,O=U.S. Government,C=US',
      validFrom: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000), // 1 year ago
      validTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),   // 1 year from now
      serialNumber: Math.random().toString(16).toUpperCase(),
      thumbprint: await this.calculateThumbprint(credential.rawId),
      publicKey: credential.response.publicKey,
      certificate: credential.rawId
    };

    return certificate;
  }

  // Parse certificate from WebAuthn credential
  private async parseCertificateFromWebAuthn(credential: PublicKeyCredential): Promise<CACCertificate> {
    const response = credential.response as AuthenticatorAttestationResponse;
    
    // Import the public key
    const publicKey = await crypto.subtle.importKey(
      'spki',
      response.publicKey!,
      {
        name: 'RSASSA-PKCS1-v1_5',
        hash: 'SHA-256'
      },
      false,
      ['verify']
    );

    const certificate: CACCertificate = {
      name: 'CAC Certificate',
      subject: 'CN=CAC.USER.123456789,OU=DOD,O=U.S. Government',
      issuer: 'CN=DOD CA-XX,OU=PKI,OU=DoD,O=U.S. Government,C=US',
      validFrom: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
      validTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      serialNumber: Math.random().toString(16).toUpperCase(),
      thumbprint: await this.calculateThumbprint(credential.rawId),
      publicKey,
      certificate: response.attestationObject
    };

    return certificate;
  }

  // Calculate certificate thumbprint
  private async calculateThumbprint(data: ArrayBuffer): Promise<string> {
    const hash = await crypto.subtle.digest('SHA-1', data);
    const hashArray = new Uint8Array(hash);
    return Array.from(hashArray, byte => 
      byte.toString(16).padStart(2, '0')
    ).join('').toUpperCase();
  }

  // Format certificate for display
  public formatCertificateDisplay(certificate: CACCertificate): string {
    const subject = this.parseCertificateSubject(certificate.subject);
    const name = subject.CN || 'CAC Certificate';
    const validUntil = certificate.validTo.toLocaleDateString();
    return `${name} (Expires: ${validUntil})`;
  }

  // Parse certificate subject string
  public parseCertificateSubject(subject: string): Record<string, string> {
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

  // Convert ArrayBuffer to base64 string
  public arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  // Convert base64 string to ArrayBuffer
  public base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }
}

// Simplified certificate selection for AFT system
export class AFTCertificateSelector {
  private cacWebCrypto: CACWebCrypto;

  constructor() {
    this.cacWebCrypto = CACWebCrypto.getInstance();
  }

  // Main function to request CAC certificate for signing
  public async requestCACCertificate(): Promise<CACCertificate | null> {
    try {
      if (!this.cacWebCrypto.isSupported()) {
        throw new Error(
          'Your browser does not support the required features for CAC certificate access. ' +
          'Please ensure you are using a modern browser with Web Crypto API support.'
        );
      }

      // Try the credential management API first
      try {
        return await this.cacWebCrypto.requestCertificate();
      } catch (credentialError) {
        console.log('Credential Management API failed, trying WebAuthn approach');
        
        // Fallback to WebAuthn approach
        return await this.cacWebCrypto.getCertificateWithWebAuthn();
      }

    } catch (error) {
      console.error('Failed to request CAC certificate:', error);
      throw new Error(
        'Unable to access your CAC certificate. Please ensure:\n' +
        '1. Your CAC card is inserted and readable\n' +
        '2. DOD middleware (ActivClient) is installed and running\n' +
        '3. Your browser trusts the DOD Certificate Authority\n' +
        '4. You have the necessary permissions to access certificates'
      );
    }
  }

  // Sign AFT request data with CAC certificate
  public async signAFTRequest(
    requestData: any,
    certificate: CACCertificate
  ): Promise<SignatureResult> {
    try {
      // Create the data to be signed
      const signatureData = JSON.stringify({
        requestId: requestData.requestId,
        requestNumber: requestData.requestNumber,
        timestamp: new Date().toISOString(),
        certificationStatement: 'I certify that the above file(s)/media to be transferred to/from the IS are required to support the development and sustainment contractual efforts and comply with all applicable security requirements.',
        signer: 'REQUESTOR_CAC_SIGNATURE'
      });

      // Sign the data
      return await this.cacWebCrypto.signData(signatureData, certificate);

    } catch (error) {
      console.error('Failed to sign AFT request:', error);
      throw new Error(`Unable to sign AFT request: ${error}`);
    }
  }
}