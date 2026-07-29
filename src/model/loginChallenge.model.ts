import mongoose from "mongoose";

/**
 * One in-flight login per account+device.
 *
 * `/api/auth/login/initiate` creates it after the password checks out, either
 * already carrying a grant (trusted device) or holding an OTP digest that
 * `/api/auth/login/verify-otp` must clear first. NextAuth's credentials
 * provider then trades the grant for a session, which is why the raw password
 * never reaches it.
 *
 * Nothing replayable is stored in the clear: the OTP, the grant and the device
 * id are all kept as HMAC digests. TTL removes stale rows, but code still
 * checks the explicit expiry fields — TTL eviction lags by up to a minute.
 */
export interface ILoginChallenge {
  _id?: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  emailNormalized: string;
  role: "user" | "vendor" | "admin";
  purpose: "login" | "two_factor_change";
  action?: "enable" | "disable";
  deviceIdHash: string;
  otpHash?: string;
  otpExpiresAt?: Date;
  attempts: number;
  grantHash?: string;
  /** True only when the grant was minted after a passed OTP; drives whether
   *  `consumeGrant` records a trusted device. Ready-grants (2FA off / already
   *  trusted) leave it false so they never grandfather a device. */
  grantViaOtp?: boolean;
  grantExpiresAt?: Date;
  consumedAt?: Date;
  expiresAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const loginChallengeSchema = new mongoose.Schema<ILoginChallenge>(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    emailNormalized: { type: String, required: true },
    role: {
      type: String,
      enum: ["user", "vendor", "admin"],
      required: true,
    },
    purpose: {
      type: String,
      enum: ["login", "two_factor_change"],
      required: true,
      default: "login",
    },
    action: { type: String, enum: ["enable", "disable"] },
    deviceIdHash: { type: String, required: true },
    otpHash: { type: String, select: false },
    otpExpiresAt: { type: Date },
    attempts: { type: Number, default: 0 },
    grantHash: { type: String, select: false, index: true },
    grantViaOtp: { type: Boolean },
    grantExpiresAt: { type: Date },
    consumedAt: { type: Date },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

// One live challenge per account+device, so re-submitting the login form
// replaces the previous attempt instead of piling up guessable OTPs.
loginChallengeSchema.index({ userId: 1, deviceIdHash: 1 }, { unique: true });
loginChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const LoginChallenge =
  mongoose.models.LoginChallenge ||
  mongoose.model<ILoginChallenge>("LoginChallenge", loginChallengeSchema);

export default LoginChallenge;
