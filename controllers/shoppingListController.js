import { StatusCodes } from 'http-status-codes';
import ShoppingList from '../models/shoppingListModel.js';
import Meal from '../models/MealModel.js';
import { NotFoundError } from '../errors/customErrors.js';
import { ownerFilter } from '../middleware/authMiddleware.js';

// @desc    Add a meal's ingredients to the shopping cart
// @route   POST /api/shopping-lists
export const createShoppingList = async (req, res) => {
    const { meal: mealId } = req.body;
    const userId = req.user.userId;

    const meal = await Meal.findById(mealId).populate('ingredients');
    if (!meal) {
        throw new NotFoundError(`No meal found with id: ${mealId}`);
    }

    const shoppingList = await ShoppingList.create({
        name: meal.name,
        ingredients: meal.ingredients.map(ingredient => ingredient._id),
        totalPrice: meal.ingredients.reduce(
            (total, ingredient) => total + ingredient.price * (ingredient.quantity || 1),
            0
        ),
        meal: mealId,
        user: userId,
    });

    res.status(StatusCodes.CREATED).json({ shoppingList });
};

// @desc    Get all shopping lists for a user
// @route   GET /api/shopping-lists
export const getUserShoppingLists = async (req, res) => {
    const shoppingLists = await ShoppingList.find({ user: req.user.userId })
        .populate('meal', 'image')
        .populate('ingredients', 'name quantity unit price');

    res.status(StatusCodes.OK).json({ shoppingLists, count: shoppingLists.length });
};

// @desc    Remove a single ingredient from the shopping list
// @route   PATCH /api/shopping-lists/:listId/remove-ingredient/:ingredientId
export const removeIngredientFromList = async (req, res) => {
    const { listId, ingredientId } = req.params;

    const shoppingList = await ShoppingList.findOneAndUpdate(
        { _id: listId, ...ownerFilter(req) },
        { $pull: { ingredients: ingredientId } },
        { new: true }
    ).populate('ingredients', 'name quantity unit price');

    if (!shoppingList) {
        throw new NotFoundError('Shopping list not found');
    }

    res.status(StatusCodes.OK).json({ message: 'Ingredient removed', shoppingList });
};

// @desc    Delete a shopping list
// @route   DELETE /api/shopping-lists/:id
export const deleteShoppingList = async (req, res) => {
    const shoppingList = await ShoppingList.findOneAndDelete({ _id: req.params.id, ...ownerFilter(req) });
    if (!shoppingList) {
        throw new NotFoundError('Shopping list not found');
    }

    res.status(StatusCodes.OK).json({ message: 'Shopping list deleted successfully' });
};

// @desc    Mark shopping list as checked out
// @route   PATCH /api/shopping-lists/:id/checkout
export const checkoutShoppingList = async (req, res) => {
    const shoppingList = await ShoppingList.findOneAndUpdate(
        { _id: req.params.id, ...ownerFilter(req) },
        { checkedOut: true },
        { new: true }
    );

    if (!shoppingList) {
        throw new NotFoundError('Shopping list not found');
    }

    res.status(StatusCodes.OK).json({ message: 'Checked out successfully', shoppingList });
};
