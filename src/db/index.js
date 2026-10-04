import mongoose from "mongoose";
import "../config/env.js";

const cache = (globalThis.__mongooseCache ??= { conn: null, promise: null });

const connectDB = async () => {
  if (cache.conn) return cache.conn;

  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is not set");
  }

  cache.promise ??= mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 8000,
  });

  try {
    cache.conn = await cache.promise;
  } catch (error) {
    cache.promise = null;
    throw error;
  }
  return cache.conn;
};

export default connectDB;
