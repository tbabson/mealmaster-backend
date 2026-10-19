import fs from 'fs/promises';
import path from 'path';

// Remove a multer temp file. Safe to call when there is no file or it is already gone.
export const removeTempFile = async (file) => {
  if (!file?.path) return;
  try {
    await fs.unlink(path.resolve(file.path));
  } catch (error) {
    if (error.code !== 'ENOENT') console.error(`Error deleting temp file ${file.path}:`, error);
  }
};
