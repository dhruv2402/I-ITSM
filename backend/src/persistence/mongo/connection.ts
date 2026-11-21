import mongoose from 'mongoose';
import { DatabaseError } from '../../domain/errors';

export async function connectMongo(uri: string): Promise<void> {
  try {
    mongoose.set('strictQuery', true);
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000, dbName: process.env.MONGODB_DB || 'i_itsm' });
    console.log(`[db] connected to MongoDB (${mongoose.connection.host}/${mongoose.connection.name})`);
  } catch (err) {
    throw new DatabaseError(`Could not connect to MongoDB: ${(err as Error).message}`);
  }
}

export async function disconnectMongo(): Promise<void> {
  await mongoose.disconnect();
}

export function mongoHealthy(): boolean {
  return mongoose.connection.readyState === 1;
}
