import OpenAI from 'openai';
import dotenv from 'dotenv';
dotenv.config();

// Set OPENAI_MODEL to whichever model your account has access to.
export const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

let client = null;

/**
 * Lazily construct the client so the server can boot without an OpenAI key —
 * only the nutrition routes should fail when it is missing.
 */
export const getOpenAI = () => {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set — nutrition features are unavailable.');
  }
  if (!client) {
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return client;
};

/**
 * Turn an OpenAI SDK error into an HTTP status + a message worth showing.
 * Billing and key problems are operator issues, not server faults — a bare 500
 * makes them look like bugs.
 */
export const describeOpenAIError = (error) => {
  if (/OPENAI_API_KEY is not set/.test(error?.message || '')) {
    return { status: 503, message: 'Nutrition features are not configured on this server.' };
  }
  switch (error?.status) {
    case 401:
      return { status: 503, message: 'The OpenAI API key was rejected. Check OPENAI_API_KEY.' };
    case 403:
      return { status: 503, message: 'This OpenAI key is not permitted to use the configured model.' };
    case 404:
      return {
        status: 503,
        message: `Model "${OPENAI_MODEL}" is unavailable to this account. Set OPENAI_MODEL to one you can access.`,
      };
    case 429:
      return error.code === 'insufficient_quota'
        ? { status: 402, message: 'The OpenAI account has no remaining credits. Add billing credit to generate nutrition data.' }
        : { status: 429, message: 'OpenAI rate limit reached. Try again shortly.' };
    case 500:
    case 503:
      return { status: 503, message: 'OpenAI is temporarily unavailable. Try again shortly.' };
    default:
      return { status: 500, message: error?.message || 'Nutrition request failed.' };
  }
};

// Structured Outputs requires every property listed in `required`
// and additionalProperties:false at each level.
const NUTRITION_SCHEMA = {
  type: 'object',
  properties: {
    servings: {
      type: 'number',
      description: 'How many servings the listed ingredient quantities produce.',
    },
    calories: { type: 'number', description: 'kcal per serving' },
    protein: { type: 'number', description: 'grams per serving' },
    carbohydrates: { type: 'number', description: 'grams per serving' },
    fat: { type: 'number', description: 'grams per serving' },
    fiber: { type: 'number', description: 'grams per serving' },
    sugar: { type: 'number', description: 'grams per serving' },
    sodium: { type: 'number', description: 'milligrams per serving' },
    highlights: {
      type: 'array',
      items: { type: 'string' },
      description:
        'Two to four short nutritional notes, e.g. "high in protein", "good source of fibre".',
    },
    caveats: {
      type: 'string',
      description:
        'What the estimate could not account for (missing quantities, cooking oil, unclear units). Empty string if none.',
    },
  },
  required: [
    'servings',
    'calories',
    'protein',
    'carbohydrates',
    'fat',
    'fiber',
    'sugar',
    'sodium',
    'highlights',
    'caveats',
  ],
  additionalProperties: false,
};

const NUTRITION_SYSTEM_PROMPT = `You are a nutrition analyst estimating the nutritional content of a dish from its ingredient list.

Rules:
- Report values PER SERVING, not for the whole recipe. First decide how many servings the quantities produce, then divide.
- Base estimates on standard food composition values for the named ingredients.
- Account for typical preparation for the cuisine (e.g. oil used for frying) and say so in caveats.
- If an ingredient lacks a quantity or the unit is ambiguous, assume a normal household portion and record that assumption in caveats.
- Return plain numbers with no units and no ranges. Round to one decimal place.
- Never refuse. If the data is thin, estimate anyway and explain the uncertainty in caveats.`;

/**
 * Estimate per-serving nutrition for a meal from its populated ingredients.
 * `meal` must have `name`, `country`, `mealType`, and a populated `ingredients` array.
 */
export const estimateMealNutrition = async (meal) => {
  const openai = getOpenAI();

  const ingredients = (meal.ingredients || []).map(({ name, quantity, unit }) => ({
    name,
    quantity: quantity ?? null,
    unit: unit ?? null,
  }));

  if (!ingredients.length) {
    throw new Error(`Meal "${meal.name}" has no ingredients to analyse.`);
  }

  const payload = {
    meal: meal.name,
    cuisine: meal.country,
    mealType: meal.mealType,
    dietary: meal.dietary,
    ingredients,
  };

  const completion = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    messages: [
      { role: 'system', content: NUTRITION_SYSTEM_PROMPT },
      { role: 'user', content: JSON.stringify(payload) },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'meal_nutrition', strict: true, schema: NUTRITION_SCHEMA },
    },
  });

  const choice = completion.choices[0];
  if (choice.finish_reason === 'length') {
    throw new Error('Nutrition estimate was truncated — raise max_tokens or shorten the input.');
  }
  if (choice.message.refusal) {
    throw new Error(`Model declined the nutrition request: ${choice.message.refusal}`);
  }

  const parsed = JSON.parse(choice.message.content);

  return {
    ...parsed,
    servings: parsed.servings > 0 ? parsed.servings : 1,
    source: 'openai',
    model: completion.model,
    generatedAt: new Date(),
  };
};

// ---------------------------------------------------------------- recommendations

const RECOMMENDATION_SCHEMA = {
  type: 'object',
  properties: {
    summary: {
      type: 'string',
      description:
        "Two sentences describing what this person's ordering pattern looks like nutritionally.",
    },
    recommendations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          mealId: { type: 'string', description: 'The id of a meal from the candidate list.' },
          reason: {
            type: 'string',
            description: 'One sentence on the nutritional benefit, referencing concrete numbers.',
          },
          addresses: {
            type: 'array',
            items: { type: 'string' },
            description: 'Which of the supplied gap labels this meal helps with.',
          },
        },
        required: ['mealId', 'reason', 'addresses'],
        additionalProperties: false,
      },
    },
  },
  required: ['summary', 'recommendations'],
  additionalProperties: false,
};

const RECOMMENDATION_SYSTEM_PROMPT = `You recommend meals from a fixed catalogue based on what a customer has already been eating.

You are given:
- their average per-meal nutrition across past orders, already computed
- gap labels already computed against reference daily values
- a candidate list of meals with per-serving nutrition

Rules:
- Choose ONLY from the candidate list. Use each meal's exact id. Never invent a meal or an id.
- Rank by how well the meal closes the stated gaps. Prefer meals that improve a shortfall without worsening an excess.
- Do not recalculate the averages or gaps — they are given and correct. Reason from them.
- Cite concrete numbers from the candidate's nutrition in each reason.
- Give general dietary guidance only. Never diagnose, never reference disease, never present this as medical advice.
- Return at most the number of recommendations requested, fewest if the candidates genuinely do not help.`;

/**
 * Rank candidate meals against a computed nutrition profile.
 * Returns { summary, recommendations: [{ mealId, reason, addresses }] }.
 */
export const recommendMealsForProfile = async ({ profile, candidates, limit = 5 }) => {
  const openai = getOpenAI();

  const payload = {
    averagePerMeal: profile.averagePerMeal,
    gaps: profile.gaps,
    ordersAnalysed: profile.ordersAnalysed,
    mostOrdered: profile.mostOrdered,
    requestedCount: limit,
    candidates: candidates.map((m) => ({
      id: String(m._id),
      name: m.name,
      mealType: m.mealType,
      country: m.country,
      dietary: m.dietary,
      nutrition: {
        calories: m.nutrition.calories,
        protein: m.nutrition.protein,
        carbohydrates: m.nutrition.carbohydrates,
        fat: m.nutrition.fat,
        fiber: m.nutrition.fiber,
        sugar: m.nutrition.sugar,
        sodium: m.nutrition.sodium,
      },
    })),
  };

  const completion = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    messages: [
      { role: 'system', content: RECOMMENDATION_SYSTEM_PROMPT },
      { role: 'user', content: JSON.stringify(payload) },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'meal_recommendations', strict: true, schema: RECOMMENDATION_SCHEMA },
    },
  });

  const choice = completion.choices[0];
  if (choice.message.refusal) {
    throw new Error(`Model declined the recommendation request: ${choice.message.refusal}`);
  }

  return JSON.parse(choice.message.content);
};
