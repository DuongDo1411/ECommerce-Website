import mongoose from "mongoose";

/**
 * Audit trail of sign-in attempts, shown back to the account owner.
 *
 * Only attempts where the account was identified are recorded, so the log
 * cannot be used to enumerate addresses. Rows carry an IP and user agent —
 * personal data the owner needs in order to recognise an intrusion — so TTL
 * discards them after 90 days rather than keeping them forever.
 */
export interface ILoginActivity {
  _id?: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  success: boolean;
  ip: string;
  userAgent: string;
  deviceIdHash: string;
  expiresAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const loginActivitySchema = new mongoose.Schema<ILoginActivity>(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    success: { type: Boolean, required: true },
    ip: { type: String, default: "unknown" },
    userAgent: { type: String, default: "" },
    deviceIdHash: { type: String, default: "" },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

loginActivitySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const LoginActivity =
  mongoose.models.LoginActivity ||
  mongoose.model<ILoginActivity>("LoginActivity", loginActivitySchema);

export default LoginActivity;
