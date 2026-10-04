import mongoose, { Schema } from "mongoose";

const fileSchema = new Schema(
  {
    kind: { type: String, enum: ["avatar", "attachment"], required: true },
    name: { type: String, required: true },
    contentType: { type: String, required: true },
    size: { type: Number, required: true },
    // not loaded unless you .select("+data")
    data: { type: Buffer, required: true, select: false },
    owner: { type: Schema.Types.ObjectId, ref: "User", required: true },
    project: { type: Schema.Types.ObjectId, ref: "Project", default: null, index: true },
    task: { type: Schema.Types.ObjectId, ref: "Task", default: null },
  },
  { timestamps: true },
);

export const File = mongoose.model("File", fileSchema);
