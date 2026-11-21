import nodemailer, { Transporter } from 'nodemailer';
import { ExternalServiceError } from '../../domain/errors';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/** Target interface our application expects from any e-mail provider. */
export interface EmailGateway {
  readonly provider: string;
  readonly isSimulated: boolean;
  send(message: EmailMessage): Promise<void>;
}

/**
 * Adapter pattern: adapts the third-party nodemailer SMTP API (talking to
 * Gmail) to our EmailGateway interface. Swapping to SendGrid, SES, etc. only
 * needs another adapter class.
 */
export class GmailSmtpAdapter implements EmailGateway {
  readonly provider = 'Gmail SMTP';
  readonly isSimulated = false;
  private readonly transporter: Transporter;

  constructor(
    private readonly config: { host: string; port: number; user: string; pass: string; from: string },
    private readonly overrideRecipient = '',
  ) {
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.port === 465,
      auth: { user: config.user, pass: config.pass },
    });
  }

  async send(message: EmailMessage): Promise<void> {
    const to = this.overrideRecipient || message.to;
    const subject = this.overrideRecipient && this.overrideRecipient !== message.to ? `${message.subject} [for ${message.to}]` : message.subject;
    try {
      await this.transporter.sendMail({ from: `"I-ITSM Service Desk" <${this.config.from}>`, to, subject, text: message.text, html: message.html });
    } catch (err) {
      throw new ExternalServiceError(`E-mail delivery failed: ${(err as Error).message}`);
    }
  }
}

/** Fallback adapter used when SMTP is not configured: writes the e-mail to the console. */
export class ConsoleEmailAdapter implements EmailGateway {
  readonly provider = 'Console (simulated)';
  readonly isSimulated = true;
  readonly outbox: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<void> {
    this.outbox.push(message);
    if (this.outbox.length > 200) this.outbox.shift();
    if (process.env.NODE_ENV !== 'test') console.log(`[EMAIL simulated] to=${message.to} subject="${message.subject}"`);
  }
}
