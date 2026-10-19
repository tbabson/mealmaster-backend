import { Router } from 'express';
const router = Router();
import {
    getCart,
    syncCart,
    addToCart,
    removeMeal,
    removeIngredient,
    updateIngredientQuantity,
    clearCart,
    getAllCarts,
    updateCartStatus,
    deleteCart
} from '../controllers/CartController.js';
import {
    authenticateUser,
    authorizePermissions,
    requireSelfOrAdmin,
} from '../middleware/authMiddleware.js';

// Admin Cart Management Routes (declared first so /admin/all is not read as /:userId)
router.get('/admin/all', authenticateUser, authorizePermissions('admin'), getAllCarts);
router.patch('/admin/:cartId/status', authenticateUser, authorizePermissions('admin'), updateCartStatus);
router.delete('/admin/:cartId', authenticateUser, authorizePermissions('admin'), deleteCart);

// Regular User Cart Routes — :userId must be the caller (or an admin)
const ownCart = [authenticateUser, requireSelfOrAdmin('userId')];
router.get('/:userId', ...ownCart, getCart);
router.post("/sync", authenticateUser, syncCart);
router.post("/add", authenticateUser, addToCart);
router.delete("/:userId/remove/:mealID", ...ownCart, removeMeal);
router.delete("/:userId/remove/:mealID/:ingredientName", ...ownCart, removeIngredient);
router.patch("/:userId/update/:mealID", ...ownCart, updateIngredientQuantity);
router.delete("/:userId/clear", ...ownCart, clearCart);

export default router;
