import mongoose, { Schema } from "mongoose";

const rateLimitSchema = new Schema(
  {
    _id: { type: String },
    count: { type: Number, default: 0 },
    resetAt: { type: Date, required: true, index: { expires: 0 } },
  },
  { versionKey: false },
);

export const RateLimit = mongoose.model("RateLimit", rateLimitSchema);
