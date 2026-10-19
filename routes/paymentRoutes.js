import express from 'express';
import {
    createStripeSession,
    createBankTransferOrder
} from '../controllers/paymentControllers.js';
import { authenticateUser } from '../middleware/authMiddleware.js';

const router = express.Router();

// Stripe routes
// The webhook (POST /webhook) is mounted in server.js, ahead of express.json(),
// because signature verification needs the raw request body.
router.post('/create-stripe-session', authenticateUser, createStripeSession);

// Bank Transfer route
router.post('/orders/place', authenticateUser, createBankTransferOrder);

export default router;
