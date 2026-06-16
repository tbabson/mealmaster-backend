import mongoose from 'mongoose';

// Substitution Schema to represent ingredient alternatives
const SubstitutionSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [false, 'Substitution name is required'],
  },
  quantity: {
    type: Number,
    required: [false, 'Quantity is required'],
  },
  unit: {
    type: String, // E.g., grams, liters
    required: [false, 'Unit is required'],
  },
});

// Ingredient Schema
const IngredientSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Ingredient name is required'],
      trim: true,
    },
    quantity: {
      type: Number,
      required: [true, 'Quantity is required'],
    },
    unit: {
      type: String, // E.g., grams, liters
      required: [true, 'Unit is required'],
    },
    substitutions: {
      type: [SubstitutionSchema], // List of possible substitutions
    },
    meal: {
      type: mongoose.Schema.ObjectId,
      ref: 'Meal',
      required: true,
    },
    price: {
      type: Number,
      required: [true, 'Quantity is required'],
    },
    createdBy: {
      type: mongoose.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

export default mongoose.model('Ingredient', IngredientSchema);
