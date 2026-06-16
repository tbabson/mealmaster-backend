// import { Router } from 'express';
// const router = Router();

// import {
//     getCart,
//     addToCart,
//     removeMeal,
//     clearCart,
// } from '../controllers/CartController.js';

// import {
//     authenticateUser,
//     authorizePermissions,
// } from '../middleware/authMiddleware.js';

// // Routes 

// router.get('/:userId', getCart);
// router.post("/add", addToCart);
// router.delete("/:userId/remove/:mealID", removeMeal);
// router.delete("/:userId/clear", clearCart);

// export default router;



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
} from '../middleware/authMiddleware.js';


// Regular User Cart Routes
router.get('/:userId', authenticateUser, getCart);
router.post("/sync", authenticateUser, syncCart);
router.post("/add", authenticateUser, addToCart);
router.delete("/:userId/remove/:mealID", authenticateUser, removeMeal);
router.delete("/:userId/remove/:mealID/:ingredientName", authenticateUser, removeIngredient);
router.patch("/:userId/update/:mealID", authenticateUser, updateIngredientQuantity);
router.delete("/:userId/clear", authenticateUser, clearCart);

// Admin Cart Management Routes
router.get('/admin/all', authenticateUser, authorizePermissions('admin'), getAllCarts);
router.patch('/admin/:cartId/status', authenticateUser, authorizePermissions('admin'), updateCartStatus);
router.delete('/admin/:cartId', authenticateUser, authorizePermissions('admin'), deleteCart);

export default router;
