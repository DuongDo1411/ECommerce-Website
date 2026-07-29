import mongoose from "mongoose";

/**
 * A fixed-window counter for rate limiting. The key (e.g. "login:acct:<hash>")
 * is stored HMAC'd, never as a raw email/IP. Self-destructs via TTL.
 */
export interface IRateLimitBucket {
  _id?: mongoose.Types.ObjectId;
  keyHash: string;
  count: number;
  windowStart: Date;
  expiresAt: Date;
  failureCount?: number;
  failureWindowStart?: Date;
  failureLevel?: number;
  blockedUntil?: Date;
  lastFailureAt?: Date;
}

const rateLimitBucketSchema = new mongoose.Schema<IRateLimitBucket>({
  keyHash: { type: String, required: true, unique: true },
  count: { type: Number, default: 0 },
  windowStart: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
  failureCount: { type: Number },
  failureWindowStart: { type: Date },
  failureLevel: { type: Number },
  blockedUntil: { type: Date },
  lastFailureAt: { type: Date },
});

rateLimitBucketSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const RateLimitBucket =
  mongoose.models.RateLimitBucket ||
  mongoose.model<IRateLimitBucket>("RateLimitBucket", rateLimitBucketSchema);

export default RateLimitBucket;
