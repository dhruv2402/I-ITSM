/**
 * Resets the MongoDB database and loads the demo data.
 *   npm run seed
 * (The API server also seeds automatically when the database is empty.)
 */
import mongoose from 'mongoose';
import { env } from '../config/env';
import { buildContainer } from '../container';
import { connectMongo } from '../persistence/mongo/connection';
import { createMongoRepositories } from '../persistence/mongo/MongoRepositories';
import { seedDatabase } from './seedData';

async function run(): Promise<void> {
  if (!env.mongoUri) {
    console.error('MONGODB_URI is not set. In-memory mode seeds automatically at server start.');
    process.exit(1);
  }
  await connectMongo(env.mongoUri);
  await mongoose.connection.dropDatabase();
  console.log('[seed] database cleared');
  const c = buildContainer({ repos: createMongoRepositories(), jwtSecret: env.jwtSecret, tokenTtlSeconds: env.jwtExpiresInSeconds });
  console.log('[seed] created', await seedDatabase(c));
  await mongoose.disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
