import { Router } from 'express';
const router = Router();
import {
    placeOrder,
    getUserOrders,
    getOrderById,
    updateOrderStatus,
    updateDeliveryStatus,
    updatePaymentStatus,
    deleteOrder,
    getAllOrders,
    getAdminStats,
    getOrderBySession,
} from '../controllers/OrderController.js';
import { authenticateUser, authorizePermissions, requireSelfOrAdmin } from '../middleware/authMiddleware.js';

// Order Routes
router.post('/place', authenticateUser, placeOrder); // Place an order

// Admin routes
router.get('/stats', authenticateUser, authorizePermissions('admin'), getAdminStats); // Admin dashboard stats
router.get('/', authenticateUser, authorizePermissions('admin'), getAllOrders); // Get all orders (admin only)

// Use distinct path patterns to avoid conflicts
router.get('/user/:userId', authenticateUser, requireSelfOrAdmin('userId'), getUserOrders); // Get all orders for a user
router.get('/by-session/:sessionId', authenticateUser, getOrderBySession); // Order for a Stripe Checkout session (owner or admin)
router.get('/:orderId', authenticateUser, getOrderById); // Get a single order by ID (owner or admin)

router.patch('/:orderId/status', authenticateUser, authorizePermissions('admin'), updateOrderStatus); // Update order status
router.patch('/:orderId/delivery', authenticateUser, authorizePermissions('admin'), updateDeliveryStatus); // Update delivery status
router.patch('/:orderId/payment', authenticateUser, authorizePermissions('admin'), updatePaymentStatus); // Update payment status
router.delete('/:orderId', authenticateUser, authorizePermissions('admin'), deleteOrder); // Delete an order (admin only)

export default router;
