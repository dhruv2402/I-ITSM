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
      // fail fast when the network blocks SMTP instead of hanging for minutes
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
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

/**
 * Adapter for Brevo's transactional e-mail HTTP API. It uses HTTPS (port 443), so it
 * works on hosts that block outgoing SMTP ports, such as Render's free plan.
 */
export class BrevoApiAdapter implements EmailGateway {
  readonly provider = 'Brevo e-mail API';
  readonly isSimulated = false;

  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly overrideRecipient = '',
  ) {}

  async send(message: EmailMessage): Promise<void> {
    const to = this.overrideRecipient || message.to;
    const subject = this.overrideRecipient && this.overrideRecipient !== message.to ? `${message.subject} [for ${message.to}]` : message.subject;
    let res: Response;
    try {
      res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'api-key': this.apiKey, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          sender: { name: 'I-ITSM Service Desk', email: this.from },
          to: [{ email: to }],
          subject,
          textContent: message.text,
          htmlContent: message.html ?? `<p>${message.text}</p>`,
        }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      throw new ExternalServiceError(`E-mail API unreachable: ${(err as Error).message}`);
    }
    if (!res.ok) throw new ExternalServiceError(`E-mail API rejected the message (${res.status}): ${(await res.text()).slice(0, 200)}`);
  }
}

/** Fallback adapter used when no provider is configured: writes the e-mail to the console. */
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
