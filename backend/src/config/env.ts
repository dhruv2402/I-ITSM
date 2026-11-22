import dotenv from 'dotenv';

dotenv.config();

/** Centralised, typed access to environment configuration. */
export const env = {
  port: Number(process.env.PORT ?? 4000),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  mongoUri: process.env.MONGODB_URI ?? '',
  jwtSecret: process.env.JWT_SECRET ?? 'dev-only-secret-change-me',
  jwtExpiresInSeconds: Number(process.env.JWT_EXPIRES_IN_SECONDS ?? 8 * 3600),
  clientOrigin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
  smtp: {
    host: process.env.SMTP_HOST ?? 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT ?? 465),
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
    from: process.env.EMAIL_FROM ?? process.env.SMTP_USER ?? '',
  },
  emailOverrideRecipient: process.env.EMAIL_OVERRIDE_RECIPIENT ?? '',
  /** HTTPS e-mail API key (Brevo). Preferred over SMTP when set; needed on hosts that block SMTP. */
  brevoApiKey: process.env.BREVO_API_KEY ?? '',
  slaMonitorIntervalMs: Number(process.env.SLA_MONITOR_INTERVAL_MS ?? 30000),
};

export type Env = typeof env;
