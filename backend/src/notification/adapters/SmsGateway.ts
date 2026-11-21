import { ValidationError } from '../../domain/errors';

/** Target interface for SMS providers (Twilio, MSG91, AWS SNS...). */
export interface SmsGateway {
  readonly provider: string;
  readonly isSimulated: boolean;
  send(phone: string, text: string): Promise<void>;
}

/** Simulated SMS provider: validates the number and logs the message. */
export class SimulatedSmsGateway implements SmsGateway {
  readonly provider = 'SMS simulator';
  readonly isSimulated = true;
  readonly sent: { phone: string; text: string }[] = [];

  async send(phone: string, text: string): Promise<void> {
    if (!/^\+?[0-9]{10,15}$/.test(phone.replace(/[\s-]/g, ''))) throw new ValidationError(`Invalid phone number ${phone}`);
    const body = text.length > 160 ? `${text.slice(0, 157)}...` : text;
    this.sent.push({ phone, text: body });
    if (this.sent.length > 200) this.sent.shift();
    if (process.env.NODE_ENV !== 'test') console.log(`[SMS simulated] to=${phone} "${body}"`);
  }
}
