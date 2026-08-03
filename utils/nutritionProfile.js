import crypto from 'crypto';
import Order from '../models/OrderModel.js';
import Meal from '../models/MealModel.js';

// FDA Daily Values for a general adult on a 2000 kcal diet. Reference points for
// a rough "is this pattern lopsided" read — not personalised targets.
const DAILY_VALUES = {
  calories: 2000,
  protein: 50, // g
  carbohydrates: 275, // g
  fat: 78, // g
  fiber: 28, // g
  sugar: 50, // g (added sugars)
  sodium: 2300, // mg
};

const MEALS_PER_DAY = 3;
const PER_MEAL_TARGET = Object.fromEntries(
  Object.entries(DAILY_VALUES).map(([k, v]) => [k, v / MEALS_PER_DAY])
);

// Nutrients you generally want more of vs. less of.
const SHORTFALL_NUTRIENTS = ['protein', 'fiber'];
const EXCESS_NUTRIENTS = ['sodium', 'sugar', 'fat'];

const LOW_RATIO = 0.7; // below 70% of target → shortfall
const HIGH_RATIO = 1.3; // above 130% of target → excess

const NUTRIENT_KEYS = [
  'calories',
  'protein',
  'carbohydrates',
  'fat',
  'fiber',
  'sugar',
  'sodium',
];

const round = (n, dp = 1) => Math.round(n * 10 ** dp) / 10 ** dp;

/**
 * Pure summariser — no database access, so it is directly testable with fixtures.
 *
 * @param {Map<string, number>} frequency  meal id -> times ordered
 * @param {Array} meals                    meal docs with `_id`, `name`, `nutrition`
 * @param {number} ordersAnalysed          how many orders produced the frequency map
 */
export const summariseProfile = ({ frequency, meals, ordersAnalysed }) => {
  if (frequency.size === 0) {
    return {
      hasHistory: false,
      ordersAnalysed,
      distinctMealsOrdered: 0,
      mealsWithNutrition: 0,
      mealsMissingNutrition: [],
      totals: null,
      averagePerMeal: null,
      gaps: [],
      mostOrdered: [],
    };
  }

  // Known as soon as there is any history — independent of nutrition coverage.
  const mealsById = new Map(meals.map((m) => [String(m._id), m]));
  const mostOrdered = [...frequency.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, times]) => ({
      _id: id,
      name: mealsById.get(id)?.name || 'Unknown meal',
      timesOrdered: times,
    }));

  const totals = Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, 0]));
  const missing = [];
  let counted = 0;

  for (const meal of meals) {
    const times = frequency.get(String(meal._id)) || 0;
    if (!meal.nutrition || meal.nutrition.calories == null) {
      missing.push({ _id: meal._id, name: meal.name, timesOrdered: times });
      continue;
    }
    for (const key of NUTRIENT_KEYS) {
      totals[key] += (meal.nutrition[key] || 0) * times;
    }
    counted += times;
  }

  if (counted === 0) {
    return {
      hasHistory: true,
      ordersAnalysed,
      distinctMealsOrdered: frequency.size,
      mealsWithNutrition: 0,
      mealsMissingNutrition: missing,
      totals: null,
      averagePerMeal: null,
      gaps: [],
      mostOrdered,
    };
  }

  const averagePerMeal = Object.fromEntries(
    NUTRIENT_KEYS.map((k) => [k, round(totals[k] / counted)])
  );

  // Gap detection against the per-meal reference, direction-aware.
  const gaps = [];
  for (const key of NUTRIENT_KEYS) {
    const target = PER_MEAL_TARGET[key];
    const actual = averagePerMeal[key];
    const ratio = target ? actual / target : null;
    if (ratio == null) continue;

    if (SHORTFALL_NUTRIENTS.includes(key) && ratio < LOW_RATIO) {
      gaps.push({
        nutrient: key,
        direction: 'low',
        label: `low ${key}`,
        averagePerMeal: actual,
        referencePerMeal: round(target),
        percentOfReference: round(ratio * 100, 0),
      });
    } else if (EXCESS_NUTRIENTS.includes(key) && ratio > HIGH_RATIO) {
      gaps.push({
        nutrient: key,
        direction: 'high',
        label: `high ${key}`,
        averagePerMeal: actual,
        referencePerMeal: round(target),
        percentOfReference: round(ratio * 100, 0),
      });
    }
  }

  return {
    hasHistory: true,
    ordersAnalysed,
    distinctMealsOrdered: frequency.size,
    mealsWithNutrition: meals.length - missing.length,
    mealsMissingNutrition: missing,
    totals: Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, round(totals[k])])),
    averagePerMeal,
    referencePerMeal: Object.fromEntries(
      Object.entries(PER_MEAL_TARGET).map(([k, v]) => [k, round(v)])
    ),
    gaps,
    mostOrdered,
  };
};

/**
 * Keep only the gap labels a model returned that correspond to gaps we actually
 * computed. The model will happily name nutrients that were never flagged, and
 * the UI must not claim to fix something it never reported.
 */
export const filterAddressesToGaps = (addresses, gaps) => {
  const flagged = new Set((gaps || []).map((g) => g.nutrient));
  return (addresses || []).filter((a) =>
    flagged.has(
      String(a)
        .toLowerCase()
        .trim()
        .replace(/^(low|high)\s+/, '')
    )
  );
};

/**
 * Fingerprint everything a recommendation depends on. If this is unchanged, the
 * previously generated recommendation is still valid and we can skip OpenAI.
 *
 * Deliberately order-independent (sorted) so an incidental reordering of meals
 * or gaps does not invalidate a perfectly good cached answer.
 */
export const recommendationFingerprint = ({ profile, candidates, limit }) => {
  const input = {
    limit,
    orders: profile.ordersAnalysed,
    counted: profile.mealsWithNutrition,
    avg: profile.averagePerMeal,
    gaps: [...(profile.gaps || [])]
      .map((g) => `${g.nutrient}:${g.direction}:${g.percentOfReference}`)
      .sort(),
    favoured: [...(profile.mostOrdered || [])]
      .map((m) => `${m._id}:${m.timesOrdered}`)
      .sort(),
    // Candidate nutrition matters: regenerating a meal's nutrition should
    // invalidate any recommendation that was reasoning about the old numbers.
    candidates: [...candidates]
      .map((c) => `${c._id}:${c.nutrition?.calories}:${c.nutrition?.protein}:${c.nutrition?.fiber}:${c.nutrition?.sodium}`)
      .sort(),
  };
  return crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex');
};

/**
 * Build a nutrition profile from a user's order history. Read-only.
 *
 * Every number is computed in JS — the model is never asked to do arithmetic.
 * Note the approximation: an order stores the subset of ingredients the customer
 * actually bought, but nutrition lives on the meal, so a meal counts in full each
 * time it is ordered.
 */
export const buildNutritionProfile = async (userId) => {
  const orders = await Order.find({ userId }).select('cartItems').lean();

  // meal id -> times ordered
  const frequency = new Map();
  for (const order of orders) {
    for (const item of order.cartItems || []) {
      if (!item.mealID) continue;
      const id = String(item.mealID);
      frequency.set(id, (frequency.get(id) || 0) + 1);
    }
  }

  const meals = frequency.size
    ? await Meal.find({ _id: { $in: [...frequency.keys()] } })
        .select('name nutrition')
        .lean()
    : [];

  return summariseProfile({ frequency, meals, ordersAnalysed: orders.length });
};

export { DAILY_VALUES, PER_MEAL_TARGET, NUTRIENT_KEYS };
