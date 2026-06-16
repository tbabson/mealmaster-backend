import mongoose from 'mongoose';

const StepSchema = new mongoose.Schema({
    stepNumber: {
        type: Number,
        required: true,
    },
    instruction: {
        type: String,
        required: true,
    },
    duration: {
        type: String, // e.g., '5 minutes'
        required: false,
    },
});

const PreparationStepSchema = new mongoose.Schema({
    meal: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Meal', // Reference to meal schema
        required: [true, 'Meal is required'],
    }],
    description: {
        type: String,
        required: [false, 'Description is required'],
    },
    skillLevel: {
        type: String,
        enum: ['Beginner', 'Intermediate', 'Advanced'],
        required: false,
        default: 'Beginner',
    },
    ingredients: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Ingredient', // Reference to Ingredient schema
        required: [false, 'Ingredients are required'],
    }],
    steps: {
        type: [StepSchema],
        required: true,
    },
    createdBy: {
        type: mongoose.Types.ObjectId,
        ref: 'User',
    },
},
    { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

export default mongoose.model('PreparationSteps', PreparationStepSchema);
