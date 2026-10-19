import mongoose from 'mongoose';

const ShoppingListSchema = new mongoose.Schema(
    {
        name: {
            type: String,
        },
        ingredients: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Ingredient', // Linking ingredients to the shopping list
            },
        ],
        totalPrice: {
            type: Number,
            required: false,
        },
        meal: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Meal', // Link the shopping list to a specific meal
            required: true,
        },
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User', // Assuming user authentication
            required: true,
        },
        expiresAt: {
            type: Date,
            default: () => new Date(Date.now() + 24 * 60 * 60 * 1000), // Set expiration to 24 hours from creation
        },
        checkedOut: {
            type: Boolean,
            default: false, // False until user checks out
        },
    },
    { timestamps: true }
);

// TTL index: MongoDB deletes each list once its expiresAt has passed.
// (A second field-level `expires: '24h'` index on the same key was removed —
// it conflicted with this one and would have meant 48h.)
ShoppingListSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model('ShoppingList', ShoppingListSchema);
