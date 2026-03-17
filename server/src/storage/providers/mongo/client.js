import { MongoClient } from 'mongodb';
import { config } from '../../../config.js';

let mongoClientPromise = null;

function assertMongoConfig() {
  if (!config.mongoUri) {
    throw new Error('Mongo provider requires MONGODB_URI.');
  }
  if (!config.mongoDbName) {
    throw new Error('Mongo provider requires MONGODB_DB.');
  }
}

export async function getMongoDb() {
  assertMongoConfig();
  if (!mongoClientPromise) {
    const client = new MongoClient(config.mongoUri, {
      maxPoolSize: 20,
      minPoolSize: 1,
      retryWrites: true,
      retryReads: true,
      serverSelectionTimeoutMS: 10000,
      appName: 'trackflow-server',
    });
    mongoClientPromise = client.connect();
  }
  const client = await mongoClientPromise;
  return client.db(config.mongoDbName);
}

export async function getMongoClient() {
  assertMongoConfig();
  if (!mongoClientPromise) {
    const client = new MongoClient(config.mongoUri, {
      maxPoolSize: 20,
      minPoolSize: 1,
      retryWrites: true,
      retryReads: true,
      serverSelectionTimeoutMS: 10000,
      appName: 'trackflow-server',
    });
    mongoClientPromise = client.connect();
  }
  return await mongoClientPromise;
}
