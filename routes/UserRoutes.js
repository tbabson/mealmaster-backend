import express from 'express';
import { getAllUsers, getUser, updateUser, deleteUser, showCurrentUser, changeUserPassword } from '../controllers/UserController.js';
import { authenticateUser, authorizePermissions, requireSelfOrAdmin } from '../middleware/authMiddleware.js';
import upload from '../middleware/multer.js';

const router = express.Router();

router.route('/').get(authenticateUser, authorizePermissions("admin"), getAllUsers);
router.route('/current-user').get(authenticateUser, showCurrentUser);
router.route('/changeUserPassword').patch(authenticateUser, changeUserPassword);
router.route('/:id')
    .get(authenticateUser, requireSelfOrAdmin('id'), getUser)
    // Always updates the caller's own profile, whatever :id says
    .patch(authenticateUser, upload.single('profileImage'), updateUser)
    .delete(authenticateUser, authorizePermissions("admin"), deleteUser);

export default router;
