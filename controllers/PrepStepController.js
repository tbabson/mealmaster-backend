import { StatusCodes } from 'http-status-codes';
import Meal from '../models/MealModel.js';
import PreparationSteps from '../models/PrepStepModel.js';
import { NotFoundError } from '../errors/customErrors.js';


// @desc    Create a new preparation step (admin)
// @route   POST /api/v1/preparationSteps
export const createPreparationStep = async (req, res) => {
    const { meal: mealId, description, skillLevel, steps } = req.body;

    const meal = await Meal.findById(mealId);
    if (!meal) {
        throw new NotFoundError(`No meal with id: ${mealId}`);
    }

    // Use the meal's existing ingredient ids
    const preparationStep = await PreparationSteps.create({
        meal: mealId,
        description,
        skillLevel,
        ingredients: meal.ingredients,
        steps,
        createdBy: req.user.userId,
    });

    meal.preparationSteps.push(preparationStep._id);
    await meal.save();

    res.status(StatusCodes.CREATED).json({ preparationStep });
};

// @desc    Get all preparation steps (with optional skill level filtering)
// @route   GET /api/v1/preparationSteps
export const getPreparationSteps = async (req, res) => {
    const { skillLevel } = req.query;

    const query = {};
    if (skillLevel) {
        query.skillLevel = String(skillLevel);
    }

    const preparationSteps = await PreparationSteps.find(query);
    res.status(StatusCodes.OK).json({ preparationSteps, count: preparationSteps.length });
};

// @desc    Get a single preparation step by ID
// @route   GET /api/v1/preparationSteps/:id
export const getPreparationStepById = async (req, res) => {
    const preparationSteps = await PreparationSteps.findById(req.params.id);
    if (!preparationSteps) {
        throw new NotFoundError('Preparation step not found');
    }

    res.status(StatusCodes.OK).json({ preparationSteps });
};

// @desc    Update a preparation step
// @route   PATCH /api/v1/preparationSteps/:id
export const updatePreparationStep = async (req, res) => {
    const { id } = req.params;
    const { meal, description, skillLevel, ingredients, steps } = req.body;

    const preparationStep = await PreparationSteps.findById(id);
    if (!preparationStep) {
        throw new NotFoundError('Preparation step not found');
    }

    if (meal) {
        const updatedMeal = await Meal.findByIdAndUpdate(
            meal,
            { $addToSet: { preparationSteps: preparationStep._id } },
            { new: true }
        );
        if (!updatedMeal) {
            throw new NotFoundError('Meal not found');
        }
    }

    preparationStep.meal = meal || preparationStep.meal;
    preparationStep.description = description ?? preparationStep.description;
    preparationStep.skillLevel = skillLevel || preparationStep.skillLevel;
    preparationStep.ingredients = ingredients || preparationStep.ingredients;
    preparationStep.steps = steps || preparationStep.steps;

    await preparationStep.save();

    if (meal) {
        const populatedMeal = await Meal.findById(meal).populate('ingredients');
        return res.status(StatusCodes.OK).json({ preparationStep, meal: populatedMeal });
    }

    res.status(StatusCodes.OK).json({ preparationStep });
};

// @desc    Delete a preparation step
// @route   DELETE /api/v1/preparationSteps/:id
export const deletePreparationStep = async (req, res) => {
    const { id } = req.params;

    const preparationStep = await PreparationSteps.findByIdAndDelete(id);
    if (!preparationStep) {
        throw new NotFoundError('Preparation step not found');
    }

    // Don't leave a dangling reference on the meal
    await Meal.updateMany({ preparationSteps: id }, { $pull: { preparationSteps: id } });

    res.status(StatusCodes.OK).json({ message: 'Preparation step deleted successfully' });
};

// @desc    Delete all preparation steps of a meal (admin)
// @route   DELETE /api/v1/preparationSteps/meal/:mealId
export const deletePreparationStepsByMeal = async (req, res) => {
    const { mealId } = req.params;

    const isValidMeal = await Meal.findById(mealId);
    if (!isValidMeal) {
        throw new NotFoundError(`No meal with id: ${mealId}`);
    }

    const result = await PreparationSteps.deleteMany({ meal: mealId });
    await Meal.findByIdAndUpdate(mealId, { preparationSteps: [] });

    res.status(StatusCodes.OK).json({
        message: `Deleted ${result.deletedCount} preparation steps for meal ${mealId}`
    });
};
