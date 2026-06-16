import { Router } from 'express';
const router = Router();
//import multer from "multer"; // Middleware to handle file uploads
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

// Routes

router.post(
  '/',
  upload.single('image'),
  authenticateUser,
  authorizePermissions('admin'),
  createMeal
);
// Create a meal with image upload

router.get('/', getAllMeals); // Get all meals

router.get('/:id', getMealById); // Get meal by ID

router.patch(
  '/:id',
  upload.single('image'),
  authenticateUser,
  authorizePermissions('admin'),
  updateMeal
); // Update meal with image upload

router.delete(
  '/:id',
  authenticateUser,
  authorizePermissions('admin'),
  deleteMeal
); // Delete meal

export default router;
