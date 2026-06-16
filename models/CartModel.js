import mongoose from 'mongoose';

const IngredientSchema = new mongoose.Schema({
    name: { type: String, required: true },
    quantity: { type: Number, required: true, min: 0 },
    price: { type: Number, required: true, min: 0 },
    unit: { type: String, default: 'g' }
});

const MealSchema = new mongoose.Schema({
    mealID: { type: mongoose.Schema.Types.ObjectId, ref: "Meal", required: true }, // If referencing Meal model
    name: { type: String, required: true },
    image: { type: String, default: '' },
    ingredients: [IngredientSchema]
});

const CartSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true }, // Ensures one cart per user
        cartItems: [MealSchema],
        // cartTotal: { type: Number, default: 0 },
        // shipping: { type: Number, default: 300 },
        // tax: { type: Number, default: 0 },
        // orderTotal: { type: Number, default: 0 }
    },
    { timestamps: true } // Automatically adds createdAt & updatedAt
);

export default mongoose.model('Cart', CartSchema);
