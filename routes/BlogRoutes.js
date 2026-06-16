import express from 'express';
import {
    createBlog,
    getAllBlogs,
    getBlog,
    updateBlog,
    deleteBlog,
    addComment,
    deleteComment
} from '../controllers/BlogController.js';
import { authenticateUser, authorizePermissions } from '../middleware/authMiddleware.js';
import multer from 'multer';
import path from 'path';

const router = express.Router();

// Configure multer for image upload
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, './uploads/');
    },
    filename: function (req, file, cb) {
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 1024 * 1024 * 5 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        const filetypes = /jpeg|jpg|png|webp/;
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = filetypes.test(file.mimetype);
        if (mimetype && extname) {
            return cb(null, true);
        }
        cb(new Error('Only images are allowed!'));
    }
});

// Blog Routes
router.route('/')
    .post(authenticateUser, authorizePermissions("admin"), upload.single('featuredImage'), createBlog)
    .get(getAllBlogs);

router.route('/:id')
    .get(getBlog)
    .patch(authenticateUser, upload.single('featuredImage'), updateBlog)
    .delete(authenticateUser, deleteBlog);

// Comment Routes
router.post('/:id/comments', authenticateUser, addComment);
router.delete('/:id/comments/:commentId', authenticateUser, deleteComment);

export default router;