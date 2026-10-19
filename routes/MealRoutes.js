import { Router } from 'express';
const router = Router();
import upload from '../middleware/multer.js';
import {
  createMeal,
  getAllMeals,
  getMealById,
  updateMeal,
  deleteMeal,
} from '../controllers/MealControllers.js';
import {
  authenticateUser,
  authorizePermissions,
} from '../middleware/authMiddleware.js';

// Auth runs before multer, so anonymous requests never write files to disk.
const adminOnly = [authenticateUser, authorizePermissions('admin')];

router.post('/', ...adminOnly, upload.single('image'), createMeal); // Create a meal with image upload

router.get('/', getAllMeals); // Get all meals

router.get('/:id', getMealById); // Get meal by ID

router.patch('/:id', ...adminOnly, upload.single('image'), updateMeal); // Update meal with image upload

router.delete('/:id', ...adminOnly, deleteMeal); // Delete meal

export default router;
