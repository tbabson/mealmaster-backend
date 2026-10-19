import mongoose from 'mongoose';
import { MEAL, DIETARY } from "../utils/constants.js"

// Estimated nutrition for one serving, derived from the meal's ingredient list.
// An approximation for guidance — not a lab analysis, and not medical advice.
const NutritionSchema = new mongoose.Schema(
  {
    servings: { type: Number, default: 1 },
    calories: { type: Number }, // kcal
    protein: { type: Number }, // g
    carbohydrates: { type: Number }, // g
    fat: { type: Number }, // g
    fiber: { type: Number }, // g
    sugar: { type: Number }, // g
    sodium: { type: Number }, // mg
    highlights: { type: [String], default: [] }, // e.g. "high protein"
    caveats: { type: String, default: '' }, // what the estimate could not account for
    source: { type: String, default: 'openai' },
    model: { type: String },
    generatedAt: { type: Date },
  },
  { _id: false }
);

const MealSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please provide the name of the meal'],
    },
    mealType: {
      type: String,
      enum: Object.values(MEAL),
      default: MEAL.BREAKFAST,
      required: [true, 'Please provide the meal type'],
    },
    country: {
      type: String,
      required: [true, 'Please specify the cuisine type'],
    },

    dietary: {
      type: [String],
      enum: Object.values(DIETARY),
      default: "none",
    },

    ingredients: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Ingredient', // Reference to Ingredient schema
        required: [false, 'Please provide ingredients for the meal'],
      },
    ],
    preparationSteps: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'PreparationSteps', // Reference to Ingredient schema
        required: [false, 'Please provide preparation Step for the meal'],
      },
    ],

    isRecommended: {
      type: Boolean,
      default: false,
    },

    image: {
      type: String, // URL for the image stored in Cloudinary
      required: [false, 'Please upload a meal image'],
    },
    cloudinaryId: {
      type: String, // To store Cloudinary public ID for deletion, if needed
    },
    nutrition: {
      type: NutritionSchema,
      default: null,
    },
    averageRating: {
      type: Number,
      default: 0,
    },
    numOfReviews: {
      type: Number,
      default: 0,
    },
    createdBy: {
      type: mongoose.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

MealSchema.virtual('reviews', {
  ref: 'Review', localField: '_id', foreignField: 'meal',
  justOne: false,
  // match: { rating: 5 },
})

// Cascade when a meal document is deleted (the controller calls meal.deleteOne()).
// This used to be a query-only hook, so it never ran and left orphans behind.
MealSchema.pre('deleteOne', { document: true, query: false }, async function () {
  const mealId = this._id;
  await Promise.all([
    mongoose.model('Review').deleteMany({ meal: mealId }),
    mongoose.model('Ingredient').deleteMany({ meal: mealId }),
    mongoose.model('PreparationSteps').deleteMany({ meal: mealId }),
  ]);
});

export default mongoose.model('Meal', MealSchema);
