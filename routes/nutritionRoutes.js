import { Router } from 'express';
import rateLimiter from 'express-rate-limit';
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

const perUser = (req) => req.user.userId;

// Recommendations may call OpenAI whenever the cache misses
const recommendationsLimiter = rateLimiter({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    keyGenerator: perUser,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { msg: 'Too many recommendation requests, try again later', message: 'Too many recommendation requests, try again later' },
});

// ?refresh=true always bypasses the cache and calls OpenAI — keep it rare
const refreshLimiter = rateLimiter({
    windowMs: 60 * 60 * 1000,
    limit: 5,
    keyGenerator: perUser,
    skip: (req) => req.query.refresh !== 'true',
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { msg: 'Recommendations can only be refreshed a few times an hour', message: 'Recommendations can only be refreshed a few times an hour' },
});

// Personalised — derived from the caller's own order history
router.get('/profile', authenticateUser, getNutritionProfile);
router.get('/recommendations', authenticateUser, recommendationsLimiter, refreshLimiter, getNutritionRecommendations);

// Admin — generating the nutrition data itself costs OpenAI tokens
router.post('/backfill', authenticateUser, authorizePermissions('admin'), backfillNutrition);
router.post('/meals/:id', authenticateUser, authorizePermissions('admin'), generateMealNutrition);

export default router;
