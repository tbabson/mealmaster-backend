import mongoose from 'mongoose';

/**
 * Cached OpenAI recommendations, one row per user.
 *
 * Kept in its own collection rather than on the user document so admin user
 * queries do not drag this payload around.
 *
 * `fingerprint` is a hash of everything the recommendation depends on — order
 * history, computed gaps, and the candidate meal set. Same fingerprint means the
 * stored answer is still the answer, so we serve it without calling OpenAI.
 */
const NutritionRecommendationSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            unique: true,
        },
        fingerprint: {
            type: String,
            required: true,
        },
        summary: { type: String, default: '' },
        items: [
            {
                _id: false,
                mealId: { type: String, required: true },
                reason: { type: String, default: '' },
                addresses: { type: [String], default: [] },
            },
        ],
        model: { type: String },
        generatedAt: { type: Date, default: Date.now },
    },
    { timestamps: true }
);

export default mongoose.model('NutritionRecommendation', NutritionRecommendationSchema);
