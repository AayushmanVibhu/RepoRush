import { MongoClient } from "mongodb";

const globalForMongo = globalThis as typeof globalThis & {
  repoRushMongo?: Promise<MongoClient>;
};

export function getMongoClient() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not configured");
  if (!globalForMongo.repoRushMongo) {
    globalForMongo.repoRushMongo = new MongoClient(uri).connect();
  }
  return globalForMongo.repoRushMongo;
}

export async function getDatabase() {
  const client = await getMongoClient();
  return client.db(process.env.MONGODB_DB || "reporush");
}
