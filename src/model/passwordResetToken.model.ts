import mongoose from "mongoose";

/**
 * A single-use password-reset grant. Only the HMAC digest of the token is
 * stored; the raw token lives only in the emailed link. The document self-
 * destructs after `expiresAt` (TTL), but code must still check expiry/usedAt.
 */
export interface IPasswordResetToken {
  _id?: mongoose.Types.ObjectId;
  email: string;
  emailNormalized: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const passwordResetTokenSchema = new mongoose.Schema<IPasswordResetToken>(
  {
    email: { type: String, required: true },
    emailNormalized: { type: String, required: true, unique: true },
    tokenHash: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date },
  },
  { timestamps: true },
);

passwordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const PasswordResetToken =
  mongoose.models.PasswordResetToken ||
  mongoose.model<IPasswordResetToken>(
    "PasswordResetToken",
    passwordResetTokenSchema,
  );

export default PasswordResetToken;
