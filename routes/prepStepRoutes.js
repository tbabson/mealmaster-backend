import express from 'express';
const router = express.Router();
import {
    createPreparationStep,
    getPreparationSteps,
    getPreparationStepById,
    updatePreparationStep,
    deletePreparationStep,
    deletePreparationStepsByMeal,
} from '../controllers/PrepStepController.js';
import {
    authenticateUser,
    authorizePermissions,
} from '../middleware/authMiddleware.js';

const adminOnly = [authenticateUser, authorizePermissions('admin')];

// Routes
router.post('/', ...adminOnly, createPreparationStep); // Create a new preparation step
router.get('/', ...adminOnly, getPreparationSteps); // Get all preparation steps (with optional skill level filter)
router.get('/:id', ...adminOnly, getPreparationStepById); // Get a single preparation step by ID
router.patch('/:id', ...adminOnly, updatePreparationStep); // Update a preparation step
router.delete('/:id', ...adminOnly, deletePreparationStep); // Delete a preparation step

router.delete('/meal/:mealId', ...adminOnly, deletePreparationStepsByMeal); // Delete all of a meal's steps

export default router;
