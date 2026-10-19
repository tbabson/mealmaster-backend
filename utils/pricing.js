import mongoose from 'mongoose';
import Meal from '../models/MealModel.js';
import { BadRequestError } from '../errors/customErrors.js';

export const TAX_RATE = 0.1;
export const SHIPPING_PRICE = 300;

const normalise = (value) => String(value ?? '').trim().toLowerCase();
const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Rebuild client-supplied cart items against the catalogue. Only the meal id,
 * ingredient names and quantities are taken from the client — names, images,
 * units and above all prices come from the database.
 *
 * Pure (no DB access) so it is directly testable.
 *
 * @param {Array} requestedItems  [{ mealID, ingredients: [{ name, quantity }] }]
 * @param {Map<string, object>} mealsById  catalogue meals with populated ingredients
 * @param {{ strict?: boolean }} options  strict: reject unknown meals/ingredients
 *                                        instead of silently dropping them
 */
export const priceItems = (requestedItems, mealsById, { strict = true } = {}) => {
  if (!Array.isArray(requestedItems)) {
    throw new BadRequestError('cartItems must be an array');
  }

  const items = [];
  for (const requested of requestedItems) {
    const meal = mealsById.get(String(requested?.mealID));
    if (!meal) {
      if (strict) throw new BadRequestError(`Meal ${requested?.mealID} is not available`);
      continue;
    }

    const catalogue = new Map((meal.ingredients || []).map((i) => [normalise(i.name), i]));
    const ingredients = [];
    for (const wanted of requested.ingredients || []) {
      const ingredient = catalogue.get(normalise(wanted?.name));
      if (!ingredient) {
        if (strict) throw new BadRequestError(`"${wanted?.name}" is not an ingredient of ${meal.name}`);
        continue;
      }
      const quantity = Number(wanted.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        throw new BadRequestError(`Invalid quantity for ${ingredient.name}`);
      }
      ingredients.push({
        name: ingredient.name,
        quantity,
        price: ingredient.price,
        unit: ingredient.unit,
      });
    }

    if (ingredients.length) {
      items.push({ mealID: meal._id, name: meal.name, image: meal.image || '', ingredients });
    }
  }
  return items;
};

export const calculateTotals = (items) => {
  const subtotal = round2(
    items.reduce(
      (total, meal) => total + meal.ingredients.reduce((sum, i) => sum + i.price * i.quantity, 0),
      0
    )
  );
  const taxPrice = round2(subtotal * TAX_RATE);
  const shippingPrice = SHIPPING_PRICE;
  return { subtotal, taxPrice, shippingPrice, totalAmount: round2(subtotal + taxPrice + shippingPrice) };
};

const loadCatalogue = async (requestedItems) => {
  const ids = [
    ...new Set(
      (Array.isArray(requestedItems) ? requestedItems : [])
        .map((item) => String(item?.mealID))
        .filter((id) => mongoose.isValidObjectId(id))
    ),
  ];
  const meals = ids.length
    ? await Meal.find({ _id: { $in: ids } }).populate('ingredients', 'name price unit').lean()
    : [];
  return new Map(meals.map((m) => [String(m._id), m]));
};

// Load the referenced meals and reprice the items from the database.
export const priceCartItems = async (requestedItems, options) =>
  priceItems(requestedItems, await loadCatalogue(requestedItems), options);
