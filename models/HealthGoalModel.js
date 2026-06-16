import mongoose from 'mongoose';

// HealthGoal schema to track user health-related goals for meal reminders
const HealthGoalSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    goalType: {
        type: String,
        enum: ['calories', 'protein', 'carbs', 'fats'],
        required: true,
    },
    goalValue: {
        type: Number,
        required: true,
    },
}, { timestamps: true });

export default mongoose.model('HealthGoal', HealthGoalSchema);
