import express from 'express';
import {
    createStripeSession,
    handleStripeWebhook,
    createBankTransferOrder
} from '../controllers/paymentControllers.js';
import { authenticateUser } from '../middleware/authMiddleware.js';

const router = express.Router();

// Stripe routes
router.post('/create-stripe-session', authenticateUser, createStripeSession);
router.post('/webhook', express.raw({ type: 'application/json' }), handleStripeWebhook);

// Bank Transfer route - replaces the PayPal route
router.post('/orders/place', authenticateUser, createBankTransferOrder);

export default router;