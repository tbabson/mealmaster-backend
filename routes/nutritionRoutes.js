import { Router } from 'express';
import {
    generateMealNutrition,
    backfillNutrition,
    getNutritionProfile,
    getNutritionRecommendations,
} from '../controllers/NutritionController.js';
import {
    authenticateUser,
    authorizePermissions,
} from '../middleware/authMiddleware.js';

const router = Router();

// Personalised — derived from the caller's own order history
router.get('/profile', authenticateUser, getNutritionProfile);
router.get('/recommendations', authenticateUser, getNutritionRecommendations);

// Admin — generating the nutrition data itself costs OpenAI tokens
router.post('/backfill', authenticateUser, authorizePermissions('admin'), backfillNutrition);
router.post('/meals/:id', authenticateUser, authorizePermissions('admin'), generateMealNutrition);

export default router;
