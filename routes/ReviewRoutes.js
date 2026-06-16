import { Router } from "express";
const router = Router()

import { createReview, getAllReviews, getSingleReview, updateReview, deleteReview } from "../controllers/ReviewController.js";


import { authenticateUser } from "../middleware/authMiddleware.js";


router.post('/', authenticateUser, createReview)
router.get('/', authenticateUser, getAllReviews);

router.get('/:id', authenticateUser, getSingleReview)
router.patch('/:id', authenticateUser, updateReview)
router.delete('/:id', authenticateUser, deleteReview)


export default router

