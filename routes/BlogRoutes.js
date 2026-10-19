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
import { authenticateUser, authorizePermissions, attachUserIfPresent } from '../middleware/authMiddleware.js';
import upload from '../middleware/multer.js';

const router = express.Router();

// Only admins create posts, so only admins edit or delete them.
// Auth always runs before multer, so anonymous requests never write to disk.
const adminOnly = [authenticateUser, authorizePermissions('admin')];

// Blog Routes
router.route('/')
    .post(...adminOnly, upload.single('featuredImage'), createBlog)
    .get(attachUserIfPresent, getAllBlogs);

router.route('/:id')
    .get(getBlog)
    .patch(...adminOnly, upload.single('featuredImage'), updateBlog)
    .delete(...adminOnly, deleteBlog);

// Comment Routes
router.post('/:id/comments', authenticateUser, addComment);
router.delete('/:id/comments/:commentId', authenticateUser, deleteComment);

export default router;
