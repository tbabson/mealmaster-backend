import Review from '../models/ReviewModel.js'
import Meal from '../models/MealModel.js'
import { StatusCodes } from 'http-status-codes'
import { BadRequestError } from '../errors/customErrors.js'
import { checkPermissions } from '../middleware/authMiddleware.js'


export const createReview = async (req, res) => {
    const { meal: mealId } = req.body

    const isValidMeal = await Meal.findOne({ _id: mealId })

    if (!isValidMeal) {
        throw new BadRequestError(`No meal with id:${mealId}`)
    }

    const alreadySubmitted = await Review.findOne({
        meal: mealId, user: req.user.userId
    })

    if (alreadySubmitted) {
        throw new BadRequestError('Already submitted review for this meal')
    }

    req.body.user = req.user.userId
    const review = await Review.create(req.body)
    res.status(StatusCodes.CREATED).json({ review })
}

export const getAllReviews = async (req, res) => {
    const { search, rating, sort } = req.query;
    let queryObject = {};

    // Handle search
    if (search) {
        queryObject.$or = [
            { title: { $regex: search, $options: 'i' } },
            { comment: { $regex: search, $options: 'i' } }
        ];
    }

    // Handle rating filter
    if (rating && rating !== 'all') {
        queryObject.rating = Number(rating);
    }

    let result = Review.find(queryObject)
        .populate('meal')
        .populate({ path: 'user', select: 'fullName email' });

    // Handle sorting
    if (sort === 'latest') {
        result = result.sort('-createdAt');
    } else if (sort === 'oldest') {
        result = result.sort('createdAt');
    } else if (sort === 'highest rating') {
        result = result.sort('-rating');
    } else if (sort === 'lowest rating') {
        result = result.sort('rating');
    }

    // Apply pagination
    const page = Number(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;
    result = result.skip(skip).limit(limit);

    const reviews = await result;
    const totalReviews = await Review.countDocuments(queryObject);
    const numOfPages = Math.ceil(totalReviews / limit);

    res.status(StatusCodes.OK).json({
        reviews,
        count: totalReviews,
        numOfPages
    });
}

export const getSingleReview = async (req, res) => {
    const { id: reviewId } = req.params

    const review = await Review.findOne({ _id: reviewId }).populate('meal').populate({ path: 'user', select: ' fullName ' });

    if (!review) {
        throw new BadRequestError(`No review with id ${reviewId}`)
    }

    res.status(StatusCodes.OK).json({ review })
}

export const updateReview = async (req, res) => {
    const { id: reviewId } = req.params
    const { rating, title, comment } = req.body;

    const review = await Review.findOne({ _id: reviewId })

    if (!review) {
        throw new BadRequestError(`No review with id ${reviewId}`)
    }

    checkPermissions(req.user, review.user);

    review.rating = rating
    review.title = title
    review.comment = comment

    await review.save()
    res.status(StatusCodes.OK).json({ review })
}

export const deleteReview = async (req, res) => {
    const { id: reviewId } = req.params

    const review = await Review.findOne({ _id: reviewId })

    if (!review) {
        throw new BadRequestError(`No review with id ${reviewId}`)
    }

    checkPermissions(req.user, review.user);
    await review.deleteOne()
    res.status(StatusCodes.OK).json({ msg: 'Success! Review removed' })
}

export const getSingleMealReviews = async (req, res) => {
    const { id: mealId } = req.params;
    const reviews = await Review.find({ meal: mealId }).populate({ path: 'user', select: ' fullName email ' }).populate({ path: 'meal', select: ' name ' });

    res.status(StatusCodes.OK).json({ reviews, count: reviews.length });
};
