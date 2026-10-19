import express from 'express';
const router = express.Router();
import {
    createIngredient,
    getAllIngredients,
    getIngredientById,
    updateIngredient,
    deleteIngredient,
    deleteIngredientsByMeal,
} from '../controllers/ingredientController.js';
import { authenticateUser, authorizePermissions } from "../middleware/authMiddleware.js";

const adminOnly = [authenticateUser, authorizePermissions("admin")];

// Ingredient routes
router.post('/', ...adminOnly, createIngredient); // Add a new ingredient
router.get('/', getAllIngredients); // Get all ingredients
router.get('/:id', getIngredientById); // Get ingredient by ID
router.patch('/:id', ...adminOnly, updateIngredient); // Update an ingredient
router.delete('/:id', ...adminOnly, deleteIngredient); // Delete an ingredient

router.delete('/meal/:mealId', ...adminOnly, deleteIngredientsByMeal); // Delete all of a meal's ingredients

export default router;
