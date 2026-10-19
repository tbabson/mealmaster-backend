import mongoose from 'mongoose';
import Cart from '../models/CartModel.js';
import { StatusCodes } from "http-status-codes";
import { BadRequestError, NotFoundError } from "../errors/customErrors.js";
import { priceCartItems } from '../utils/pricing.js';
import { containsFilter } from '../utils/escapeRegex.js';
import { getPagination } from '../utils/pagination.js';

// mealID is an ObjectId on the document but a string in the URL — compare as strings.
const sameMeal = (item, mealID) => String(item.mealID) === String(mealID);

const findCartOr404 = async (userId) => {
    const cart = await Cart.findOne({ userId });
    if (!cart) throw new NotFoundError('Cart not found.');
    return cart;
};

// ✅ Fetch Cart (route guarantees :userId is the caller, or the caller is admin)
export const getCart = async (req, res) => {
    const { userId } = req.params;

    const cart = await Cart.findOneAndUpdate(
        { userId },
        { $setOnInsert: { userId, cartItems: [] } },
        { new: true, upsert: true }
    );

    res.status(StatusCodes.OK).json(cart);
};

// ✅ Sync entire cart with backend. Always the caller's own cart; prices are
// re-read from the catalogue, and meals/ingredients that no longer exist are dropped.
export const syncCart = async (req, res) => {
    const userId = req.user.userId;
    const cartItems = await priceCartItems(req.body.cartItems || [], { strict: false });

    const cart = await Cart.findOneAndUpdate(
        { userId },
        { userId, cartItems },
        { new: true, upsert: true, runValidators: true }
    );

    res.status(StatusCodes.OK).json(cart);
};

// ✅ Add single meal to cart (kept for backward compatibility)
export const addToCart = async (req, res) => {
    const userId = req.user.userId;
    const { meal } = req.body;

    if (!meal) {
        throw new BadRequestError('Meal is required');
    }

    const [pricedMeal] = await priceCartItems([meal]);
    if (!pricedMeal) {
        throw new BadRequestError('Select at least one ingredient');
    }

    let cart = await Cart.findOne({ userId });
    if (!cart) {
        cart = new Cart({ userId, cartItems: [] });
    }

    const existingMeal = cart.cartItems.find((item) => sameMeal(item, pricedMeal.mealID));
    if (existingMeal) {
        pricedMeal.ingredients.forEach((newIngredient) => {
            const existingIngredient = existingMeal.ingredients.find(
                (i) => i.name === newIngredient.name
            );
            if (existingIngredient) {
                existingIngredient.quantity += newIngredient.quantity;
                existingIngredient.price = newIngredient.price;
            } else {
                existingMeal.ingredients.push(newIngredient);
            }
        });
    } else {
        cart.cartItems.push(pricedMeal);
    }

    await cart.save();
    res.status(StatusCodes.OK).json(cart);
};

// ✅ Remove Meal from Cart
export const removeMeal = async (req, res) => {
    const { userId, mealID } = req.params;
    const cart = await findCartOr404(userId);

    cart.cartItems = cart.cartItems.filter((meal) => !sameMeal(meal, mealID));
    await cart.save();
    res.status(StatusCodes.OK).json(cart);
};

// ✅ Remove Ingredient from Meal
export const removeIngredient = async (req, res) => {
    const { userId, mealID, ingredientName } = req.params;
    const cart = await findCartOr404(userId);

    const meal = cart.cartItems.find((item) => sameMeal(item, mealID));
    if (!meal) throw new NotFoundError('Meal not found in cart.');

    meal.ingredients = meal.ingredients.filter(i => i.name !== ingredientName);

    // If meal has no ingredients left, remove it entirely
    if (meal.ingredients.length === 0) {
        cart.cartItems = cart.cartItems.filter((item) => !sameMeal(item, mealID));
    }

    await cart.save();
    res.status(StatusCodes.OK).json(cart);
};

// ✅ Update Ingredient Quantity
export const updateIngredientQuantity = async (req, res) => {
    const { userId, mealID } = req.params;
    const { ingredientName } = req.body;
    const newQuantity = Number(req.body.newQuantity);

    if (!Number.isFinite(newQuantity)) {
        throw new BadRequestError('newQuantity must be a number');
    }

    const cart = await findCartOr404(userId);

    const meal = cart.cartItems.find((item) => sameMeal(item, mealID));
    if (!meal) throw new NotFoundError('Meal not found in cart.');

    const ingredient = meal.ingredients.find(i => i.name === ingredientName);
    if (!ingredient) throw new NotFoundError('Ingredient not found in meal.');

    if (newQuantity <= 0) {
        // Remove ingredient if quantity is zero or less
        meal.ingredients = meal.ingredients.filter(i => i.name !== ingredientName);

        // If meal has no ingredients left, remove it entirely
        if (meal.ingredients.length === 0) {
            cart.cartItems = cart.cartItems.filter((item) => !sameMeal(item, mealID));
        }
    } else {
        ingredient.quantity = newQuantity;
    }

    await cart.save();
    res.status(StatusCodes.OK).json(cart);
};

// ✅ Clear Cart
export const clearCart = async (req, res) => {
    const { userId } = req.params;
    const cart = await findCartOr404(userId);

    cart.cartItems = [];
    await cart.save();
    res.status(StatusCodes.OK).json(cart);
};

// Sum of price × quantity across every ingredient of every meal
const CART_TOTAL_EXPRESSION = {
    $sum: {
        $map: {
            input: '$cartItems',
            as: 'meal',
            in: {
                $sum: {
                    $map: {
                        input: '$$meal.ingredients',
                        as: 'ing',
                        in: { $multiply: ['$$ing.price', '$$ing.quantity'] },
                    },
                },
            },
        },
    },
};

// 👑 Admin: Get All Carts
export const getAllCarts = async (req, res) => {
    const { search, searchStatus, sort } = req.query;
    const { page, limit, skip } = getPagination(req.query);
    const queryObject = {};

    if (search) {
        const or = [{ "cartItems.name": containsFilter(search) }];
        // userId is an ObjectId — a regex never matches it, so look it up exactly
        if (mongoose.isValidObjectId(search)) {
            or.push({ userId: new mongoose.Types.ObjectId(String(search)) });
        }
        queryObject.$or = or;
    }

    if (searchStatus && searchStatus !== "all") {
        queryObject.status = String(searchStatus);
    }

    const sortOptions = {
        latest: { createdAt: -1 },
        oldest: { createdAt: 1 },
        'total-highest': { cartTotal: -1 },
        'total-lowest': { cartTotal: 1 },
    };

    const carts = await Cart.aggregate([
        { $match: queryObject },
        { $addFields: { cartTotal: CART_TOTAL_EXPRESSION } },
        { $sort: sortOptions[sort] || sortOptions.latest },
        { $skip: skip },
        { $limit: limit },
    ]);
    await Cart.populate(carts, { path: 'userId', select: '_id fullName email', model: 'User' });

    const totalCarts = await Cart.countDocuments(queryObject);
    const numOfPages = Math.ceil(totalCarts / limit);

    res.status(StatusCodes.OK).json({
        carts,
        totalCarts,
        numOfPages,
        currentPage: page
    });
};

// 👑 Admin: Update Cart Status
export const updateCartStatus = async (req, res) => {
    const { cartId } = req.params;
    const { status } = req.body;

    if (typeof status !== 'string' || !status.trim()) {
        throw new BadRequestError('status is required');
    }

    const cart = await Cart.findByIdAndUpdate(cartId, { status: status.trim() }, { new: true });
    if (!cart) throw new NotFoundError('Cart not found');

    res.status(StatusCodes.OK).json(cart);
};

// 👑 Admin: Delete Cart
export const deleteCart = async (req, res) => {
    const { cartId } = req.params;

    const cart = await Cart.findByIdAndDelete(cartId);
    if (!cart) throw new NotFoundError('Cart not found');

    res.status(StatusCodes.OK).json({ message: "Cart deleted successfully" });
};
