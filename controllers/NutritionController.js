import { StatusCodes } from 'http-status-codes';
import Meal from '../models/MealModel.js';
import { estimateMealNutrition, recommendMealsForProfile, describeOpenAIError } from '../utils/openai.js';
import {
  buildNutritionProfile,
  filterAddressesToGaps,
  recommendationFingerprint,
} from '../utils/nutritionProfile.js';
import NutritionRecommendation from '../models/NutritionRecommendationModel.js';

// How many recommendations we generate and cache. Callers slice down via ?limit.
const MAX_RECOMMENDATIONS = 10;

const DISCLAIMER =
  'Nutrition values are estimated from ingredient lists and are for general guidance only. They are not a laboratory analysis and not medical advice.';

// @desc    Generate (or regenerate) nutrition for one meal
// @route   POST /api/v1/nutrition/meals/:id
// @access  admin
export const generateMealNutrition = async (req, res) => {
  const { id } = req.params;

  try {
    const meal = await Meal.findById(id).populate('ingredients', 'name quantity unit');
    if (!meal) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'Meal not found' });
    }

    if (meal.nutrition && meal.nutrition.calories != null && req.query.force !== 'true') {
      return res.status(StatusCodes.OK).json({
        message: 'Nutrition already exists. Pass ?force=true to regenerate.',
        meal: { _id: meal._id, name: meal.name, nutrition: meal.nutrition },
        disclaimer: DISCLAIMER,
      });
    }

    const nutrition = await estimateMealNutrition(meal);
    meal.nutrition = nutrition;
    await meal.save();

    res.status(StatusCodes.OK).json({
      message: 'Nutrition generated',
      meal: { _id: meal._id, name: meal.name, nutrition: meal.nutrition },
      disclaimer: DISCLAIMER,
    });
  } catch (error) {
    const { status, message } = describeOpenAIError(error);
    console.error('Nutrition generation failed:', error.message);
    res.status(status).json({ message });
  }
};

// @desc    Backfill nutrition for every meal that lacks it
// @route   POST /api/v1/nutrition/backfill
// @access  admin
export const backfillNutrition = async (req, res) => {
  const limit = Number(req.query.limit) || 10;

  try {
    const meals = await Meal.find({
      $or: [{ nutrition: null }, { 'nutrition.calories': { $exists: false } }],
    })
      .populate('ingredients', 'name quantity unit')
      .limit(limit);

    const results = [];
    for (const meal of meals) {
      try {
        meal.nutrition = await estimateMealNutrition(meal);
        await meal.save();
        results.push({ _id: meal._id, name: meal.name, status: 'ok' });
      } catch (error) {
        results.push({ _id: meal._id, name: meal.name, status: 'failed', error: error.message });
      }
    }

    const remaining = await Meal.countDocuments({
      $or: [{ nutrition: null }, { 'nutrition.calories': { $exists: false } }],
    });

    res.status(StatusCodes.OK).json({
      processed: results.length,
      succeeded: results.filter((r) => r.status === 'ok').length,
      remaining,
      results,
      disclaimer: DISCLAIMER,
    });
  } catch (error) {
    const { status, message } = describeOpenAIError(error);
    console.error('Nutrition backfill failed:', error.message);
    res.status(status).json({ message });
  }
};

// @desc    The caller's nutrition profile, computed from their order history
// @route   GET /api/v1/nutrition/profile
// @access  session
export const getNutritionProfile = async (req, res) => {
  try {
    const profile = await buildNutritionProfile(req.user.userId);
    res.status(StatusCodes.OK).json({ profile, disclaimer: DISCLAIMER });
  } catch (error) {
    console.error('Nutrition profile failed:', error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: error.message });
  }
};

// @desc    Meal recommendations driven by the caller's nutritional history
// @route   GET /api/v1/nutrition/recommendations
// @access  session
export const getNutritionRecommendations = async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 5, 10);

  try {
    const profile = await buildNutritionProfile(req.user.userId);

    if (!profile.hasHistory || !profile.averagePerMeal) {
      return res.status(StatusCodes.OK).json({
        profile,
        summary:
          'Not enough order history yet. Once you have ordered a few meals we can spot patterns in what you are eating.',
        recommendations: [],
        disclaimer: DISCLAIMER,
      });
    }

    // Candidates: meals with nutrition that the customer has not been ordering repeatedly.
    const alreadyFavoured = profile.mostOrdered.map((m) => m._id);
    const candidates = await Meal.find({
      'nutrition.calories': { $ne: null, $exists: true },
      _id: { $nin: alreadyFavoured },
    })
      .select('name mealType country dietary nutrition image averageRating')
      .limit(30)
      .lean();

    if (!candidates.length) {
      return res.status(StatusCodes.OK).json({
        profile,
        summary: 'No meals with nutrition data are available to recommend yet.',
        recommendations: [],
        disclaimer: DISCLAIMER,
      });
    }

    // Only call OpenAI when the inputs have actually changed. A page reload with
    // the same order history and the same candidates serves the stored answer.
    //
    // One fixed-size set is generated and cached regardless of the requested
    // `limit`, then sliced on read — otherwise two pages asking for different
    // counts would invalidate each other and call the model on every view.
    const fingerprint = recommendationFingerprint({ profile, candidates });
    const cached = await NutritionRecommendation.findOne({ user: req.user.userId }).lean();

    let summary;
    let items;
    let generatedAt;
    let servedFromCache = false;

    if (cached && cached.fingerprint === fingerprint && req.query.refresh !== 'true') {
      ({ summary, items, generatedAt } = cached);
      servedFromCache = true;
    } else {
      const result = await recommendMealsForProfile({
        profile,
        candidates,
        limit: MAX_RECOMMENDATIONS,
      });
      summary = result.summary;
      items = (result.recommendations || []).map((r) => ({
        mealId: r.mealId,
        reason: r.reason,
        addresses: filterAddressesToGaps(r.addresses, profile.gaps),
      }));
      generatedAt = new Date();

      await NutritionRecommendation.findOneAndUpdate(
        { user: req.user.userId },
        { user: req.user.userId, fingerprint, summary, items, generatedAt },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }

    // Never trust stored ids either — a meal can be deleted after we cached it.
    const byId = new Map(candidates.map((m) => [String(m._id), m]));

    const recommendations = (items || [])
      .filter((r) => byId.has(r.mealId))
      .slice(0, limit)
      .map((r) => {
        const meal = byId.get(r.mealId);
        return {
          meal: {
            _id: meal._id,
            name: meal.name,
            image: meal.image,
            mealType: meal.mealType,
            country: meal.country,
            dietary: meal.dietary,
            averageRating: meal.averageRating,
            nutrition: meal.nutrition,
          },
          reason: r.reason,
          addresses: r.addresses,
        };
      });

    res.status(StatusCodes.OK).json({
      profile,
      summary,
      recommendations,
      cached: servedFromCache,
      generatedAt,
      disclaimer: DISCLAIMER,
    });
  } catch (error) {
    const { status, message } = describeOpenAIError(error);
    console.error('Nutrition recommendations failed:', error.message);
    res.status(status).json({ message });
  }
};
