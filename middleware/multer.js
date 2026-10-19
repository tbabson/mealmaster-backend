import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { BadRequestError } from '../errors/customErrors.js';

// Temp storage only — every upload is pushed to Cloudinary and then deleted.
const UPLOAD_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'uploads');

// multer does not create the directory when `destination` is a function, and
// the folder is not in git, so make sure it exists on a fresh deploy.
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_TYPES = {
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
};

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    // Never use the client's filename on disk
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ALLOWED_TYPES[file.mimetype]}`);
    },
});

const fileFilter = (req, file, cb) => {
    if (!ALLOWED_TYPES[file.mimetype]) {
        return cb(new BadRequestError('Only JPEG, JPG, PNG, and WEBP files are allowed'), false);
    }
    cb(null, true);
};

const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
});

export default upload;
