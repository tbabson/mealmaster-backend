import Review from '../models/ReviewModel.js'
import Meal from '../models/MealModel.js'
import { StatusCodes } from 'http-status-codes'
import { BadRequestError, NotFoundError } from '../errors/customErrors.js'
import { checkPermissions } from '../middleware/authMiddleware.js'
import { containsFilter } from '../utils/escapeRegex.js'
import { getPagination } from '../utils/pagination.js'


export const createReview = async (req, res) => {
    const { meal: mealId, rating, title, comment } = req.body

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

    const review = await Review.create({
        meal: mealId,
        rating,
        title,
        comment,
        user: req.user.userId,
    })
    res.status(StatusCodes.CREATED).json({ review })
}

export const getAllReviews = async (req, res) => {
    const { search, rating, sort } = req.query;
    const queryObject = {};

    if (search) {
        queryObject.$or = [
            { title: containsFilter(search) },
            { comment: containsFilter(search) }
        ];
    }

    if (rating && rating !== 'all') {
        queryObject.rating = Number(rating);
    }

    const sortOptions = {
        latest: '-createdAt',
        oldest: 'createdAt',
        'highest rating': '-rating',
        'lowest rating': 'rating',
    };

    const { limit, skip } = getPagination({ page: req.query.page, limit: 10 });

    let result = Review.find(queryObject)
        .populate('meal')
        .populate({ path: 'user', select: 'fullName email' });

    if (sortOptions[sort]) {
        result = result.sort(sortOptions[sort]);
    }

    const reviews = await result.skip(skip).limit(limit);
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
        throw new NotFoundError(`No review with id ${reviewId}`)
    }

    res.status(StatusCodes.OK).json({ review })
}

export const updateReview = async (req, res) => {
    const { id: reviewId } = req.params
    const { rating, title, comment } = req.body;

    const review = await Review.findOne({ _id: reviewId })

    if (!review) {
        throw new NotFoundError(`No review with id ${reviewId}`)
    }

    checkPermissions(req.user, review.user);

    review.rating = rating ?? review.rating
    review.title = title ?? review.title
    review.comment = comment ?? review.comment

    await review.save()
    res.status(StatusCodes.OK).json({ review })
}

export const deleteReview = async (req, res) => {
    const { id: reviewId } = req.params

    const review = await Review.findOne({ _id: reviewId })

    if (!review) {
        throw new NotFoundError(`No review with id ${reviewId}`)
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
