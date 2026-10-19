import Ingredient from '../models/IngredientsModel.js';
import { StatusCodes } from 'http-status-codes';
import Meal from '../models/MealModel.js';
import { NotFoundError } from '../errors/customErrors.js';

// @desc    Add a new ingredient (admin)
// @route   POST /api/v1/ingredients
export const createIngredient = async (req, res) => {
  const { meal: mealId, name, quantity, unit, substitutions, price } = req.body;

  const isValidMeal = await Meal.findById(mealId);
  if (!isValidMeal) {
    throw new NotFoundError(`No meal with id: ${mealId}`);
  }

  const ingredient = await Ingredient.create({
    meal: mealId,
    name,
    quantity,
    unit,
    substitutions,
    price,
    createdBy: req.user.userId,
  });

  // Add this ingredient to the meal's ingredient list
  await Meal.findByIdAndUpdate(mealId, { $push: { ingredients: ingredient._id } });

  res.status(StatusCodes.CREATED).json({ ingredient });
};

// @desc    Get all ingredients
// @route   GET /api/v1/ingredients
export const getAllIngredients = async (req, res) => {
  const ingredients = await Ingredient.find({});
  res.status(StatusCodes.OK).json({ ingredients, count: ingredients.length });
};

// @desc    Get an ingredient by ID
// @route   GET /api/v1/ingredients/:id
export const getIngredientById = async (req, res) => {
  const { id } = req.params;

  const ingredient = await Ingredient.findById(id);
  if (!ingredient) {
    throw new NotFoundError(`No ingredient found with id: ${id}`);
  }

  res.status(StatusCodes.OK).json({ ingredient });
};

// @desc    Update an ingredient (admin)
// @route   PATCH /api/v1/ingredients/:id
export const updateIngredient = async (req, res) => {
  const { id } = req.params;
  const { name, quantity, unit, substitutions, price, meal: newMealId } = req.body;

  const ingredient = await Ingredient.findById(id);
  if (!ingredient) {
    throw new NotFoundError('Ingredient not found');
  }

  // `??` rather than `||` so 0 is a valid price/quantity
  ingredient.name = name ?? ingredient.name;
  ingredient.quantity = quantity ?? ingredient.quantity;
  ingredient.unit = unit ?? ingredient.unit;
  ingredient.price = price ?? ingredient.price;
  ingredient.substitutions = substitutions ?? ingredient.substitutions;

  // Move the ingredient to a different meal
  if (newMealId && String(ingredient.meal) !== String(newMealId)) {
    const updatedMeal = await Meal.findByIdAndUpdate(
      newMealId,
      { $addToSet: { ingredients: ingredient._id } },
      { new: true }
    );

    if (!updatedMeal) {
      throw new NotFoundError('New meal not found');
    }

    if (ingredient.meal) {
      await Meal.findByIdAndUpdate(ingredient.meal, { $pull: { ingredients: ingredient._id } });
    }

    ingredient.meal = newMealId;
  }

  await ingredient.save();

  res.status(StatusCodes.OK).json({ ingredient });
};

// @desc    Delete an ingredient (admin)
// @route   DELETE /api/v1/ingredients/:id
export const deleteIngredient = async (req, res) => {
  const { id } = req.params;

  const ingredient = await Ingredient.findByIdAndDelete(id);
  if (!ingredient) {
    throw new NotFoundError(`No ingredient found with id: ${id}`);
  }

  // Remove the reference from any meal that lists it
  await Meal.updateMany({ ingredients: id }, { $pull: { ingredients: id } });

  res.status(StatusCodes.OK).json({ message: 'Ingredient deleted successfully' });
};

// @desc    Delete all ingredients of a meal (admin)
// @route   DELETE /api/v1/ingredients/meal/:mealId
export const deleteIngredientsByMeal = async (req, res) => {
  const { mealId } = req.params;

  const isValidMeal = await Meal.findById(mealId);
  if (!isValidMeal) {
    throw new NotFoundError(`No meal with id: ${mealId}`);
  }

  const result = await Ingredient.deleteMany({ meal: mealId });
  await Meal.findByIdAndUpdate(mealId, { ingredients: [] });

  res.status(StatusCodes.OK).json({
    message: `Deleted ${result.deletedCount} ingredients for meal ${mealId}`
  });
};
