import mongoose from "mongoose";

export interface ITrustedDevice {
  _id?: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  deviceIdHash: string;
  label: string;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
  revokedAt?: Date;
}

const trustedDeviceSchema = new mongoose.Schema<ITrustedDevice>({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  deviceIdHash: { type: String, required: true },
  label: { type: String, default: "Unknown device" },
  createdAt: { type: Date, required: true, default: Date.now },
  lastSeenAt: { type: Date, required: true, default: Date.now },
  expiresAt: { type: Date, required: true },
  revokedAt: { type: Date },
});

trustedDeviceSchema.index({ userId: 1, deviceIdHash: 1 }, { unique: true });
trustedDeviceSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const TrustedDevice =
  mongoose.models.TrustedDevice ||
  mongoose.model<ITrustedDevice>("TrustedDevice", trustedDeviceSchema);

export default TrustedDevice;
