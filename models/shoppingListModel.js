// import mongoose from 'mongoose';

// const ShoppingListSchema = new mongoose.Schema({
//     name: {
//         type: String,
//         required: [true, 'List name is required'],
//     },
//     ingredients: [{
//         type: mongoose.Schema.Types.ObjectId,
//         ref: 'Ingredient', // Linking ingredients to the shopping list
//     }],
//     meal: {
//         type: mongoose.Schema.Types.ObjectId,
//         ref: 'Meal', // Link the shopping list to a specific meal
//         required: true,
//     },
//     user: {
//         type: mongoose.Schema.Types.ObjectId,
//         ref: 'User', // Assuming user authentication
//         required: false,
//     },
// }, { timestamps: true });

// export default mongoose.model('ShoppingList', ShoppingListSchema);


import mongoose from 'mongoose';

const ShoppingListSchema = new mongoose.Schema(
    {
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
            index: { expires: '24h' }, // Automatically remove expired lists from DB
        },
        checkedOut: {
            type: Boolean,
            default: false, // False until user checks out
        },
    },
    { timestamps: true }
);

// Create an index to automatically delete expired shopping lists
ShoppingListSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model('ShoppingList', ShoppingListSchema);
