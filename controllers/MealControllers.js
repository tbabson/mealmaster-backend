import Meal from '../models/MealModel.js';
import { StatusCodes } from 'http-status-codes';
import cloudinary from 'cloudinary';
import fs from 'fs/promises';
import path from 'path'
import { query } from 'express';





export const createMeal = async (req, res) => {
    try {
        const { name, mealType, ingredients, country, dietary, preparationSteps, isRecommended } = req.body;

        // Check if the image file is present
        if (!req.file) {
            return res
                .status(StatusCodes.BAD_REQUEST)
                .json({ message: 'Please upload a meal image' });
        }

        // Upload image to Cloudinary
        const result = await cloudinary.v2.uploader.upload(req.file.path, {
            folder: 'mealmaster',
            use_filename: true,
        });

        // Get the absolute path of the uploaded file
        const filePath = path.resolve(req.file.path);

        // Create the new meal in the database
        const meal = await Meal.create({
            name,
            mealType,
            country,
            dietary,
            preparationSteps,
            isRecommended,
            image: result.secure_url,
            cloudinaryId: result.public_id,
            createdBy: req.user.userId,
        });

        // Update the meal's ingredients field
        await Meal.findByIdAndUpdate(
            meal._id,
            { ingredients: ingredients },
            { new: true }
        );

        // Remove local file after everything else is done
        try {
            await fs.unlink(filePath);
        } catch (unlinkError) {
            console.error(`Error deleting local file: ${filePath}`, unlinkError);
            // Continue with the request even if file deletion fails
        }

        // Respond with the created meal
        const updatedMeal = await Meal.findById(meal._id)
            .populate('ingredients')
            .populate('preparationSteps');

        res.status(StatusCodes.CREATED).json({ meal: updatedMeal });

    } catch (error) {
        console.error('Error creating meal:', error);
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: error.message });
    }
};

// @desc    Get all meals
// @route   GET /api/meals
export const getAllMeals = async (req, res) => {
    const { name, country, mealType, dietary, sort } = req.query

    const queryObject = {}

    if (name) {
        queryObject.$or = [
            { name: { $regex: name, $options: 'i' } },
        ]
    }

    if (country) {
        queryObject.$or = [
            { country: { $regex: country, $options: 'i' } },
        ]
    }


    if (mealType && mealType !== 'all') {
        queryObject.mealType = mealType
    }

    if (dietary && dietary !== 'all') {
        queryObject.dietary = dietary
    }

    const sortOptions = {
        newest: '-createdAt',
        oldest: 'createdAt',
        'a-z': 'name',
        'z-a': '-name',
    }

    const sortKey = sortOptions[sort] || sortOptions.newest;

    // setup pagination

    const page = Number(req.query.page) || 1
    const limit = Number(req.query.limit) || 10
    const skip = (page - 1) * limit

    try {
        const meals = await Meal.find(queryObject).populate('ingredients').sort(sortKey).skip(skip).limit(limit)

        const totalMeals = await Meal.countDocuments(queryObject)
        const numOfPages = Math.ceil(totalMeals / limit)

        res.status(StatusCodes.OK).json({ totalMeals, numOfPages, currentPage: page, meals, count: meals.length })
    } catch (error) {
        res
            .status(StatusCodes.INTERNAL_SERVER_ERROR)
            .json({ message: error.message });
    }
};


// @desc    Get meal by ID
// @route   GET /api/meals/:id
export const getMealById = async (req, res) => {
    try {
        // Fetch the meal by ID and populate associated ingredients and preparation steps
        const meal = await Meal.findById(req.params.id)
            .populate('ingredients') // Populating ingredients associated with the meal
            .populate('preparationSteps') // Populating preparation steps
            .populate({
                path: 'reviews',
                populate: {
                    path: 'user',
                    select: 'fullName',
                },
            });

        // Check if the meal was found
        if (!meal) {
            return res
                .status(StatusCodes.NOT_FOUND)
                .json({ message: 'Meal not found' });
        }

        // Return the populated meal data
        res.status(StatusCodes.OK).json({ meal });
    } catch (error) {
        console.log(error);

        // Handle any errors that occur during the fetch
        res
            .status(StatusCodes.INTERNAL_SERVER_ERROR)
            .json({ message: error.message });
    }
};

// @desc    Update meal
// @route   PUT /api/meals/:id
export const updateMeal = async (req, res) => {
    try {
        const meal = await Meal.findById(req.params.id);
        if (!meal) {
            return res
                .status(StatusCodes.NOT_FOUND)
                .json({ message: 'Meal not found' });
        }

        // If a new image is uploaded, replace the old one in Cloudinary
        if (req.file) {
            if (meal.cloudinaryId) {
                await cloudinary.v2.uploader.destroy(meal.cloudinaryId);
            }
            const result = await cloudinary.v2.uploader.upload(req.file.path, {
                folder: 'mealmaster',
                use_filename: true,
            });
            req.body.image = result.secure_url;
            req.body.cloudinaryId = result.public_id;

            // Remove the temp local file
            try {
                await fs.unlink(path.resolve(req.file.path));
            } catch (unlinkError) {
                console.error('Error deleting temp file:', unlinkError);
            }
        }

        const updatedMeal = await Meal.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true,
        });

        res.status(StatusCodes.OK).json({ updatedMeal });
    } catch (error) {
        res
            .status(StatusCodes.INTERNAL_SERVER_ERROR)
            .json({ message: error.message });
    }
};

// @desc    Delete meal
// @route   DELETE /api/meals/:id
export const deleteMeal = async (req, res) => {
    try {
        const meal = await Meal.findById(req.params.id);
        if (!meal) {
            return res
                .status(StatusCodes.NOT_FOUND)
                .json({ message: 'Meal not found' });
        }

        // Delete the image from Cloudinary
        await cloudinary.v2.uploader.destroy(meal.cloudinaryId);

        // Delete the meal from the database
        await meal.deleteOne();

        res.status(StatusCodes.OK).json({ message: 'Meal deleted successfully' });
    } catch (error) {
        res
            .status(StatusCodes.INTERNAL_SERVER_ERROR)
            .json({ message: error.message });
    }
};
