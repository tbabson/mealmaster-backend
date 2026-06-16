import { StatusCodes } from 'http-status-codes';
import Meal from '../models/MealModel.js';
import PreparationSteps from '../models/PrepStepModel.js';
import { BadRequestError, NotFoundError } from '../errors/customErrors.js';


// @desc    Create a new preparation step
// @route   POST /api/preparationsteps
export const createPreparationStep = async (req, res) => {
    const { meal: mealId, description, skillLevel, steps } = req.body;

    try {
        // Check if the meal exists and retrieve it
        const meal = await Meal.findById(mealId); // Populate ingredients from the meal
        if (!meal) {
            throw new NotFoundError(`No meal with id: ${mealId}`);
        }

        // Use the meal's existing ingredients' IDs
        const ingredients = meal.ingredients.map(ingredient => ingredient._id); // Extract ingredient IDs

        // Create the preparation step with the meal's ingredients
        const preparationStep = await PreparationSteps.create({
            meal: mealId,
            description,
            skillLevel,
            ingredients,  // Assign ingredient IDs from the meal
            steps,
            createdBy: req.user.userId,
        });

        // Update the meal's preparationSteps array with the new preparationStep ID
        meal.preparationSteps.push(preparationStep._id);
        await meal.save(); // Save the meal with the updated preparationSteps array

        // Respond with the created preparation step
        res.status(StatusCodes.CREATED).json({ preparationStep });
    } catch (error) {
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: error.message });
    }
};

// @desc    Get all preparation steps (with optional skill level filtering)
// @route   GET /api/preparationsteps
export const getPreparationSteps = async (req, res) => {
    const { skillLevel } = req.query;

    try {
        let query = {};
        if (skillLevel) {
            query.skillLevel = skillLevel; // Filter by skill level if provided
        }

        const preparationSteps = await PreparationSteps.find(query);
        res.status(StatusCodes.OK).json({ preparationSteps, count: preparationSteps.length });
    } catch (error) {
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: error.message });
    }
};

// @desc    Get a single preparation step by ID
// @route   GET /api/preparationsteps/:id
export const getPreparationStepById = async (req, res) => {
    const { id } = req.params;

    try {
        const preparationSteps = await PreparationSteps.findById(id)
        if (!preparationSteps) {
            return res.status(StatusCodes.NOT_FOUND).json({ message: 'Preparation step not found' });
        }

        res.status(StatusCodes.OK).json({ preparationSteps });
    } catch (error) {
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: error.message });
    }
};

// @desc    Update a preparation step
// @route   PUT /api/preparationsteps/:id
export const updatePreparationStep = async (req, res) => {
    const { id } = req.params;
    const { meal, description, skillLevel, ingredients, steps } = req.body;

    try {
        const preparationStep = await PreparationSteps.findById(id);
        if (!preparationStep) {
            return res.status(StatusCodes.NOT_FOUND).json({ message: 'Preparation step not found' });
        }

        preparationStep.meal = meal || preparationStep.meal;
        preparationStep.description = description || preparationStep.description;
        preparationStep.skillLevel = skillLevel || preparationStep.skillLevel;
        preparationStep.ingredients = ingredients || preparationStep.ingredients;
        preparationStep.steps = steps || preparationStep.steps;

        await preparationStep.save();

        // Check if a meal ID is provided for updating the Meal document
        if (meal) {
            // Update the meal's ingredients to include the updated ingredient's ID
            const updatedMeal = await Meal.findByIdAndUpdate(
                meal, // The meal ID provided in the request
                { $addToSet: { preparationSteps: preparationStep._id } }, // Use $addToSet to avoid duplicates
                { new: true } // Return the updated meal
            );

            if (!updatedMeal) {
                throw new NotFoundError('Meal not found');
            }

            // Optionally populate the updated meal's ingredients for the response
            const populatedMeal = await Meal.findById(updatedMeal._id).populate('ingredients');

            return res.status(StatusCodes.OK).json({ preparationStep, meal: populatedMeal });
        }

        res.status(StatusCodes.OK).json({ preparationStep });
    } catch (error) {
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: error.message });
    }
};

// @desc    Delete a preparation step
// @route   DELETE /api/preparationsteps/:id
export const deletePreparationStep = async (req, res) => {
    const { id } = req.params;

    try {
        const preparationStep = await PreparationSteps.findById(id);
        if (!preparationStep) {
            return res.status(StatusCodes.NOT_FOUND).json({ message: 'Preparation step not found' });
        }

        await preparationStep.deleteOne();
        res.status(StatusCodes.OK).json({ message: 'Preparation step deleted successfully' });
    } catch (error) {
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: error.message });
    }
};

export const deletePreparationStepsByMeal = async (req, res) => {
    try {
        const { mealId } = req.params;

        // Check if the meal exists
        const isValidMeal = await Meal.findById(mealId);
        if (!isValidMeal) {
            throw new NotFoundError(`No meal with id: ${mealId}`);
        }

        // Delete all preparation steps for this meal
        const result = await PreparationSteps.deleteMany({ meal: mealId });

        // Clear the preparationSteps array in the meal document
        await Meal.findByIdAndUpdate(
            mealId,
            { preparationSteps: [] },
            { new: true }
        );

        res.status(StatusCodes.OK).json({
            message: `Deleted ${result.deletedCount} preparation steps for meal ${mealId}`
        });
    } catch (error) {
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: error.message });
    }
};