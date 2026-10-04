import { File } from "../models/file.models.js";

export const saveFile = ({ kind, name, contentType, buffer, owner, project = null, task = null }) =>
  File.create({ kind, name, contentType, size: buffer.length, data: buffer, owner, project, task });

export const readFile = (id) => File.findById(id).select("+data");
export const deleteFile = (id) => File.deleteOne({ _id: id });
export const deleteFilesWhere = (filter) => File.deleteMany(filter);
