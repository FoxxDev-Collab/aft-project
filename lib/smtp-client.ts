import { connect, type TLSSocket } from 'bun';

interface SMTPConfig {
  host: string;
  port: number;
  secure: boolean;
  auth?: {
    user: string;
    pass: string;
  };
  timeout?: number;
}

interface EmailMessage {
  from: string;
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
  headers?: Record<string, string>;
}

interface SMTPResponse {
  code: number;
  message: string;
}

export class SMTPClient {
  private config: SMTPConfig;
  private socket: TLSSocket | null = null;
  private authenticated: boolean = false;
  private extensions: Set<string> = new Set();

  constructor(config: SMTPConfig) {
    this.config = {
      timeout: 30000,
      ...config
    };
  }

  private async connect(): Promise<void> {
    try {
      const options = {
        hostname: this.config.host,
        port: this.config.port,
        tls: this.config.secure ? {
          rejectUnauthorized: false
        } : undefined,
        timeout: this.config.timeout
      };

      this.socket = await connect(options);

      // Wait for server greeting
      await this.readResponse();

      // Send EHLO
      await this.sendCommand('EHLO localhost');
      const ehloResponse = await this.readResponse();

      // Parse EHLO response for extensions
      this.parseExtensions(ehloResponse.message);

      // STARTTLS if needed (port 587)
      if (!this.config.secure && this.config.port === 587 && this.extensions.has('STARTTLS')) {
        await this.sendCommand('STARTTLS');
        await this.readResponse();

        // Upgrade connection to TLS
        // Note: Bun's native TLS upgrade would go here
        // For now, we'll assume secure connection or pre-configured TLS
      }

      // Authenticate if credentials provided
      if (this.config.auth && this.extensions.has('AUTH')) {
        await this.authenticate();
      }
    } catch (error) {
      throw new Error(`SMTP connection failed: ${error}`);
    }
  }

  private parseExtensions(response: string) {
    const lines = response.split('\n');
    for (const line of lines) {
      const match = line.match(/^250[\s-](.+)$/);
      if (match) {
        const ext = match[1].trim().split(' ')[0];
        this.extensions.add(ext.toUpperCase());
      }
    }
  }

  private async authenticate(): Promise<void> {
    if (!this.config.auth) return;

    const { user, pass } = this.config.auth;

    // Try AUTH PLAIN
    if (this.extensions.has('AUTH') && this.extensions.has('PLAIN')) {
      const authString = Buffer.from(`\0${user}\0${pass}`).toString('base64');
      await this.sendCommand(`AUTH PLAIN ${authString}`);
      const response = await this.readResponse();

      if (response.code === 235) {
        this.authenticated = true;
        return;
      }
    }

    // Try AUTH LOGIN as fallback
    await this.sendCommand('AUTH LOGIN');
    let response = await this.readResponse();

    if (response.code === 334) {
      // Send username
      await this.sendCommand(Buffer.from(user).toString('base64'));
      response = await this.readResponse();

      if (response.code === 334) {
        // Send password
        await this.sendCommand(Buffer.from(pass).toString('base64'));
        response = await this.readResponse();

        if (response.code === 235) {
          this.authenticated = true;
          return;
        }
      }
    }

    throw new Error('SMTP authentication failed');
  }

  private async sendCommand(command: string): Promise<void> {
    if (!this.socket) throw new Error('Not connected to SMTP server');

    const data = `${command}\r\n`;
    await this.socket.write(data);

    // Don't log AUTH commands for security
    if (!command.startsWith('AUTH')) {
      console.log(`SMTP >> ${command}`);
    }
  }

  private async readResponse(): Promise<SMTPResponse> {
    if (!this.socket) throw new Error('Not connected to SMTP server');

    let response = '';
    const decoder = new TextDecoder();

    while (true) {
      const chunk = await this.socket.read();
      if (!chunk) break;

      response += decoder.decode(chunk);

      // Check if we have a complete response
      if (response.includes('\r\n')) {
        const lines = response.split('\r\n');
        const lastLine = lines[lines.length - 2] || lines[lines.length - 1];

        // Check if this is the last line of the response
        if (lastLine && lastLine[3] === ' ') {
          const code = parseInt(lastLine.substring(0, 3));
          console.log(`SMTP << ${response.trim()}`);
          return { code, message: response.trim() };
        }
      }
    }

    throw new Error('Failed to read SMTP response');
  }

  private formatAddress(address: string): string {
    if (address.includes('<')) return address;
    const match = address.match(/^(.+?)\s*<(.+)>$/);
    if (match) return address;
    return `<${address}>`;
  }

  private generateMessageId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2);
    const domain = this.config.host || 'localhost';
    return `<${timestamp}.${random}@${domain}>`;
  }

  private buildMimeMessage(message: EmailMessage): string {
    const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36)}`;
    const lines: string[] = [];

    // Headers
    lines.push(`From: ${message.from}`);
    lines.push(`To: ${Array.isArray(message.to) ? message.to.join(', ') : message.to}`);
    lines.push(`Subject: ${message.subject}`);
    lines.push(`Message-ID: ${this.generateMessageId()}`);
    lines.push(`Date: ${new Date().toUTCString()}`);
    lines.push('MIME-Version: 1.0');

    // Custom headers
    if (message.headers) {
      for (const [key, value] of Object.entries(message.headers)) {
        lines.push(`${key}: ${value}`);
      }
    }

    // Handle multipart if both text and HTML
    if (message.text && message.html) {
      lines.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
      lines.push('');

      // Text part
      lines.push(`--${boundary}`);
      lines.push('Content-Type: text/plain; charset=UTF-8');
      lines.push('Content-Transfer-Encoding: quoted-printable');
      lines.push('');
      lines.push(this.encodeQuotedPrintable(message.text));
      lines.push('');

      // HTML part
      lines.push(`--${boundary}`);
      lines.push('Content-Type: text/html; charset=UTF-8');
      lines.push('Content-Transfer-Encoding: quoted-printable');
      lines.push('');
      lines.push(this.encodeQuotedPrintable(message.html));
      lines.push('');

      lines.push(`--${boundary}--`);
    } else if (message.html) {
      lines.push('Content-Type: text/html; charset=UTF-8');
      lines.push('Content-Transfer-Encoding: quoted-printable');
      lines.push('');
      lines.push(this.encodeQuotedPrintable(message.html));
    } else {
      lines.push('Content-Type: text/plain; charset=UTF-8');
      lines.push('Content-Transfer-Encoding: quoted-printable');
      lines.push('');
      lines.push(this.encodeQuotedPrintable(message.text || ''));
    }

    return lines.join('\r\n');
  }

  private encodeQuotedPrintable(text: string): string {
    return text
      .split('\n')
      .map(line => {
        let encoded = '';
        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          const code = char.charCodeAt(0);

          if (code === 61) { // =
            encoded += '=3D';
          } else if (code < 32 || code > 126) {
            encoded += `=${code.toString(16).toUpperCase().padStart(2, '0')}`;
          } else {
            encoded += char;
          }

          // Soft line break at 76 characters
          if (encoded.length > 73) {
            encoded += '=\r\n';
          }
        }
        return encoded;
      })
      .join('\r\n');
  }

  async sendMail(message: EmailMessage): Promise<{ messageId: string; accepted: string[] }> {
    try {
      // Connect if not connected
      if (!this.socket) {
        await this.connect();
      }

      // MAIL FROM
      const from = this.formatAddress(message.from).match(/<(.+)>/)?.[1] || message.from;
      await this.sendCommand(`MAIL FROM:<${from}>`);
      let response = await this.readResponse();
      if (response.code !== 250) {
        throw new Error(`MAIL FROM rejected: ${response.message}`);
      }

      // RCPT TO
      const recipients = Array.isArray(message.to) ? message.to : [message.to];
      const accepted: string[] = [];

      for (const recipient of recipients) {
        const to = this.formatAddress(recipient).match(/<(.+)>/)?.[1] || recipient;
        await this.sendCommand(`RCPT TO:<${to}>`);
        response = await this.readResponse();
        if (response.code === 250) {
          accepted.push(recipient);
        }
      }

      if (accepted.length === 0) {
        throw new Error('No recipients accepted');
      }

      // DATA
      await this.sendCommand('DATA');
      response = await this.readResponse();
      if (response.code !== 354) {
        throw new Error(`DATA command rejected: ${response.message}`);
      }

      // Send message
      const mimeMessage = this.buildMimeMessage(message);
      await this.socket.write(mimeMessage);
      await this.socket.write('\r\n.\r\n');

      response = await this.readResponse();
      if (response.code !== 250) {
        throw new Error(`Message rejected: ${response.message}`);
      }

      const messageId = mimeMessage.match(/Message-ID:\s*(.+)/i)?.[1] || this.generateMessageId();

      return {
        messageId,
        accepted
      };
    } catch (error) {
      throw new Error(`Failed to send email: ${error}`);
    }
  }

  async close(): Promise<void> {
    if (this.socket) {
      try {
        await this.sendCommand('QUIT');
        await this.readResponse();
      } catch {
        // Ignore errors during quit
      }

      this.socket.end();
      this.socket = null;
      this.authenticated = false;
    }
  }

  async verify(): Promise<boolean> {
    try {
      await this.connect();
      await this.close();
      return true;
    } catch (error) {
      console.error('SMTP verification failed:', error);
      return false;
    }
  }
}