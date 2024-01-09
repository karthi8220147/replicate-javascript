const fs = require("node:fs");
const path = require("node:path");

/**
 * Create a file
 *
 * @param {object} file - Required. The file object.
 * @param {object} metadata - Optional. User-provided metadata associated with the file.
 * @returns {Promise<object>} - Resolves with the file data
 */
async function createFile(file, metadata = {}) {
  const form = new FormData();

  let fileName;
  let fileType;
  let fileStream;
  if (file instanceof Blob) {
    fileName = file.name || `blob_${Date.now()}`;
    fileType = file.type || "application/octet-stream";
    fileStream = file.stream();
  } else if (file instanceof File) {
    fileName = file.name || path.basename(file.path);
    fileType = file.type || "application/octet-stream";
    fileStream = fs.createReadStream(file.path);
  } else {
    throw new Error("Invalid file argument, must be a Blob or File");
  }

  form.append("content", fs.createReadStream(file.path), {
    filename: fileName,
    type: fileType,
  });
  form.append("metadata", JSON.stringify(metadata), {
    type: "application/json",
  });

  const response = await fetch("/files", {
    method: "POST",
    body: form,
  });

  return response.json();
}

/**
 * List all files
 *
 * @returns {Promise<object>} - Resolves with the files data
 */
async function listFiles() {
  const response = await fetch("/files", {
    method: "GET",
  });

  return response.json();
}

/**
 * Get a file
 *
 * @param {string} file_id - Required. The ID of the file.
 * @returns {Promise<object>} - Resolves with the file data
 */
async function getFile(file_id) {
  const response = await fetch(`/files/${file_id}`, {
    method: "GET",
  });

  return response.json();
}

/**
 * Delete a file
 *
 * @param {string} file_id - Required. The ID of the file.
 * @returns {Promise<object>} - Resolves with the deletion confirmation
 */
async function deleteFile(file_id) {
  const response = await fetch(`/files/${file_id}`, {
    method: "DELETE",
  });

  return response.json();
}

module.exports = {
  create: createFile,
  list: listFiles,
  get: getFile,
  delete: deleteFile,
};
