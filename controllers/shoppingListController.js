// import { StatusCodes } from 'http-status-codes';
// import ShoppingList from '../models/shoppingListModel.js'; // Assuming the path to your model
// import Meal from '../models/MealModel.js'; // Assuming the path to your meal model
// import { NotFoundError } from '../errors/customErrors.js'; // Custom error for handling missing resources



// // @desc    Create a new shopping list based on meal ingredients
// // @route   POST /api/shopping-lists
// export const createShoppingList = async (req, res) => {
//     const { meal: mealId, name } = req.body;
//     const userId = req.user.userId; // Assuming user is authenticated


//     try {
//         // Find the meal to ensure it exists and retrieve its ingredients
//         const meal = await Meal.findById(mealId).populate('ingredients');
//         if (!meal) {
//             throw new NotFoundError(`No meal with id : ${mealId}`);
//         }

//         // Create a shopping list using the meal's ingredients
//         const shoppingList = await ShoppingList.create({
//             name,
//             ingredients: meal.ingredients.map(ingredient => ingredient._id), // Use meal ingredients
//             meal: mealId,  // Link shopping list to the meal
//             user: userId,
//         });



//         res.status(StatusCodes.CREATED).json({ shoppingList });
//     } catch (error) {
//         res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: error.message });
//     }
// };

// // @desc    Get all shopping lists for a user
// // @route   GET /api/shopping-lists
// export const getUserShoppingLists = async (req, res) => {
//     const userId = req.user.userId; // Assuming user is authenticated

//     try {
//         // Fetch all shopping lists for the user and populate ingredients and meal details
//         const shoppingLists = await ShoppingList.find({ user: userId })

//         res.status(StatusCodes.OK).json({ shoppingLists, count: shoppingLists.length });
//     } catch (error) {
//         res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: error.message });
//     }
// };


// // @desc    Delete a shopping list
// // @route   DELETE /api/shopping-lists/:id
// export const deleteShoppingList = async (req, res) => {
//     const { id } = req.params;

//     try {
//         // Find the shopping list by its ID
//         const shoppingList = await ShoppingList.findById(id);
//         if (!shoppingList) {
//             return res.status(StatusCodes.NOT_FOUND).json({ message: 'Shopping list not found' });
//         }

//         await shoppingList.deleteOne();
//         res.status(StatusCodes.OK).json({ message: 'Shopping list deleted successfully' });
//     } catch (error) {
//         res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: error.message });
//     }
// };


import { StatusCodes } from 'http-status-codes';
import ShoppingList from '../models/shoppingListModel.js';
import Meal from '../models/MealModel.js';
import { NotFoundError } from '../errors/customErrors.js';

// @desc    Add a meal's ingredients to the shopping cart
// @route   POST /api/shopping-lists
export const createShoppingList = async (req, res) => {
    const { meal: mealId } = req.body;
    const userId = req.user.userId; // Assuming user is authenticated

    try {
        // Find the meal and its ingredients
        const meal = await Meal.findById(mealId).populate('ingredients');
        if (!meal) {
            throw new NotFoundError(`No meal found with id: ${mealId}`);
        }

        // Create a shopping list using the meal's ingredients
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
    } catch (error) {
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: error.message });
    }
};

// @desc    Get all shopping lists for a user
// @route   GET /api/shopping-lists
export const getUserShoppingLists = async (req, res) => {
    const userId = req.user.userId;

    try {
        // Fetch shopping lists for the user, populating meals and ingredients
        const shoppingLists = await ShoppingList.find({ user: userId })
            .populate('meal', 'image')
            .populate('ingredients', 'name quantity unit price');

        res.status(StatusCodes.OK).json({ shoppingLists, count: shoppingLists.length });
    } catch (error) {
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: error.message });
    }
};

// @desc    Remove a single ingredient from the shopping list
// @route   PATCH /api/shopping-lists/:listId/remove-ingredient/:ingredientId
export const removeIngredientFromList = async (req, res) => {
    const { listId, ingredientId } = req.params;

    try {
        // Find shopping list and update it by removing the specified ingredient
        const shoppingList = await ShoppingList.findByIdAndUpdate(
            listId,
            { $pull: { ingredients: ingredientId } },
            { new: true }
        ).populate('ingredients', 'name quantity unit price');

        if (!shoppingList) {
            throw new NotFoundError('Shopping list not found');
        }

        res.status(StatusCodes.OK).json({ message: 'Ingredient removed', shoppingList });
    } catch (error) {
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: error.message });
    }
};

// @desc    Delete a shopping list
// @route   DELETE /api/shopping-lists/:id
export const deleteShoppingList = async (req, res) => {
    const { id } = req.params;

    try {
        const shoppingList = await ShoppingList.findById(id);
        if (!shoppingList) {
            throw new NotFoundError('Shopping list not found');
        }

        await shoppingList.deleteOne();
        res.status(StatusCodes.OK).json({ message: 'Shopping list deleted successfully' });
    } catch (error) {
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: error.message });
    }
};

// @desc    Mark shopping list as checked out
// @route   PATCH /api/shopping-lists/:id/checkout
export const checkoutShoppingList = async (req, res) => {
    const { id } = req.params;

    try {
        const shoppingList = await ShoppingList.findByIdAndUpdate(
            id,
            { checkedOut: true },
            { new: true }
        );

        if (!shoppingList) {
            throw new NotFoundError('Shopping list not found');
        }

        res.status(StatusCodes.OK).json({ message: 'Checked out successfully', shoppingList });
    } catch (error) {
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: error.message });
    }
};
