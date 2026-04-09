import mongoose from "mongoose";
const mongoDBUrl = process.env.MONGODB_URL;

if (!mongoDBUrl) {
  throw new Error("MONGODB_URL is not defined in the environment variables.");
}

let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

const connectDB = async () => {
  if (cached.conn) {
    return cached.conn;
  }
  if (!cached.promise) {
    cached.promise = mongoose
      .connect(mongoDBUrl)
      .then((conn) => conn.connection);
  }
  try {
    const conn = await cached.promise;
    return conn;
  } catch (error) {
    console.log("Error connecting to MongoDB:", error);
  }
};

export default connectDB;
