import Meal from '../models/MealModel.js';
import { StatusCodes } from 'http-status-codes';
import cloudinary from 'cloudinary';
import { BadRequestError, NotFoundError } from '../errors/customErrors.js';
import { containsFilter } from '../utils/escapeRegex.js';
import { getPagination } from '../utils/pagination.js';
import { removeTempFile } from '../utils/files.js';

// Fields an admin may set directly. Image ids, ratings and nutrition are server-managed.
const EDITABLE_FIELDS = ['name', 'mealType', 'country', 'dietary', 'ingredients', 'preparationSteps', 'isRecommended'];

const pickEditable = (body) =>
    Object.fromEntries(EDITABLE_FIELDS.filter((f) => body[f] !== undefined).map((f) => [f, body[f]]));

// @desc    Create a meal (admin)
// @route   POST /api/v1/meals
export const createMeal = async (req, res) => {
    try {
        if (!req.file) {
            throw new BadRequestError('Please upload a meal image');
        }

        const result = await cloudinary.v2.uploader.upload(req.file.path, {
            folder: 'mealmaster',
            use_filename: true,
        });

        const meal = await Meal.create({
            ...pickEditable(req.body),
            image: result.secure_url,
            cloudinaryId: result.public_id,
            createdBy: req.user.userId,
        });

        const createdMeal = await Meal.findById(meal._id)
            .populate('ingredients')
            .populate('preparationSteps');

        res.status(StatusCodes.CREATED).json({ meal: createdMeal });
    } finally {
        await removeTempFile(req.file);
    }
};

// @desc    Get all meals
// @route   GET /api/v1/meals
export const getAllMeals = async (req, res) => {
    const { name, country, mealType, dietary, sort } = req.query

    const queryObject = {}

    // Independent filters — previously `country` overwrote the `name` filter
    if (name) {
        queryObject.name = containsFilter(name)
    }

    if (country) {
        queryObject.country = containsFilter(country)
    }

    if (mealType && mealType !== 'all') {
        queryObject.mealType = String(mealType)
    }

    if (dietary && dietary !== 'all') {
        queryObject.dietary = String(dietary)
    }

    const sortOptions = {
        newest: '-createdAt',
        oldest: 'createdAt',
        'a-z': 'name',
        'z-a': '-name',
    }

    const sortKey = sortOptions[sort] || sortOptions.newest;
    const { page, limit, skip } = getPagination(req.query);

    const meals = await Meal.find(queryObject).populate('ingredients').sort(sortKey).skip(skip).limit(limit)

    const totalMeals = await Meal.countDocuments(queryObject)
    const numOfPages = Math.ceil(totalMeals / limit)

    res.status(StatusCodes.OK).json({ totalMeals, numOfPages, currentPage: page, meals, count: meals.length })
};


// @desc    Get meal by ID
// @route   GET /api/v1/meals/:id
export const getMealById = async (req, res) => {
    const meal = await Meal.findById(req.params.id)
        .populate('ingredients')
        .populate('preparationSteps')
        .populate({
            path: 'reviews',
            populate: {
                path: 'user',
                select: 'fullName',
            },
        });

    if (!meal) {
        throw new NotFoundError('Meal not found');
    }

    res.status(StatusCodes.OK).json({ meal });
};

// @desc    Update meal (admin)
// @route   PATCH /api/v1/meals/:id
export const updateMeal = async (req, res) => {
    try {
        const meal = await Meal.findById(req.params.id);
        if (!meal) {
            throw new NotFoundError('Meal not found');
        }

        const updates = pickEditable(req.body);
        let oldCloudinaryId;

        // If a new image is uploaded, replace the old one in Cloudinary
        if (req.file) {
            const result = await cloudinary.v2.uploader.upload(req.file.path, {
                folder: 'mealmaster',
                use_filename: true,
            });
            oldCloudinaryId = meal.cloudinaryId;
            updates.image = result.secure_url;
            updates.cloudinaryId = result.public_id;
        }

        const updatedMeal = await Meal.findByIdAndUpdate(req.params.id, updates, {
            new: true,
            runValidators: true,
        });

        // Only remove the old image once the new one is stored
        if (oldCloudinaryId) {
            await cloudinary.v2.uploader.destroy(oldCloudinaryId);
        }

        res.status(StatusCodes.OK).json({ updatedMeal });
    } finally {
        await removeTempFile(req.file);
    }
};

// @desc    Delete meal (admin) — the model hook removes its reviews, ingredients and steps
// @route   DELETE /api/v1/meals/:id
export const deleteMeal = async (req, res) => {
    const meal = await Meal.findById(req.params.id);
    if (!meal) {
        throw new NotFoundError('Meal not found');
    }

    await meal.deleteOne();

    if (meal.cloudinaryId) {
        await cloudinary.v2.uploader.destroy(meal.cloudinaryId);
    }

    res.status(StatusCodes.OK).json({ message: 'Meal deleted successfully' });
};
