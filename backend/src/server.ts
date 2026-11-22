import { createApp } from './app';
import { env } from './config/env';
import { buildContainer } from './container';
import { BrevoApiAdapter, ConsoleEmailAdapter, EmailGateway, GmailSmtpAdapter } from './notification/adapters/EmailGateway';
import { createInMemoryRepositories } from './persistence/memory/InMemoryRepositories';
import { connectMongo } from './persistence/mongo/connection';
import { createMongoRepositories } from './persistence/mongo/MongoRepositories';
import { Repositories } from './persistence/repositories';
import { seedDatabase } from './seed/seedData';

async function main(): Promise<void> {
  let repos: Repositories;
  if (env.mongoUri) {
    await connectMongo(env.mongoUri);
    repos = createMongoRepositories();
  } else {
    console.warn('[db] MONGODB_URI not set - running with IN-MEMORY storage (data resets on restart)');
    repos = createInMemoryRepositories();
  }

  let email: EmailGateway = new ConsoleEmailAdapter();
  if (env.brevoApiKey && env.smtp.from) {
    email = new BrevoApiAdapter(env.brevoApiKey, env.smtp.from, env.emailOverrideRecipient);
    console.log(`[email] real e-mail enabled via ${email.provider}${env.emailOverrideRecipient ? ' (redirected to override recipient)' : ''}`);
  } else if (env.smtp.user && env.smtp.pass) {
    email = new GmailSmtpAdapter(env.smtp, env.emailOverrideRecipient);
    console.log(`[email] real e-mail enabled via ${email.provider}${env.emailOverrideRecipient ? ' (redirected to override recipient)' : ''}`);
  } else {
    console.log('[email] SMTP not configured - e-mails are simulated in the console');
  }

  const c = buildContainer({ repos, email, jwtSecret: env.jwtSecret, tokenTtlSeconds: env.jwtExpiresInSeconds });

  if ((await repos.users.findAll()).length === 0) {
    const summary = await seedDatabase(c);
    console.log(`[seed] demo data created: ${JSON.stringify(summary)}`);
  }
  await c.settings.load();
  const trained = await c.incidents.retrainClassifier();
  console.log(`[ai] category classifier trained on ${trained} historical incidents`);
  c.slaMonitor.start(env.slaMonitorIntervalMs);

  const app = createApp(c, { clientOrigin: env.clientOrigin });
  app.listen(env.port, () => console.log(`[api] I-ITSM API listening on http://localhost:${env.port}/api`));
}

main().catch((err) => {
  console.error('[fatal]', err);
  process.exit(1);
});
