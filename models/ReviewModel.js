import mongoose from "mongoose";


const ReviewSchema = new mongoose.Schema({
    rating: {
        type: Number,
        min: 1,
        max: 5,
    },
    title: {
        type: String,
        trim: true,
        maxLength: 100,
    },
    comment: {
        type: String,
    },
    user: {
        type: mongoose.Schema.ObjectId,
        ref: 'User',
    },
    meal: {
        type: mongoose.Schema.ObjectId,
        ref: 'Meal',
    },
},
    { timestamps: true }
)
ReviewSchema.index({ meal: 1, user: 1 }, { unique: true, sparse: true })

ReviewSchema.statics.calculateAverageRating = async function (mealId) {
    const result = await this.aggregate([
        { $match: { meal: mealId } }, {
            $group: {
                _id: null, averageRating: { $avg: "$rating" },
                numOfReviews: { $sum: 1 }
            }
        }
    ])
    try {
        await this.model('Meal').findOneAndUpdate(
            { _id: mealId },
            {
                averageRating: Math.ceil(result[0]?.averageRating || 0),
                numOfReviews: result[0]?.numOfReviews || 0,

            }
        )
    } catch (error) {
        console.log(error);
    }
}

ReviewSchema.post('save', async function () {
    await this.constructor.calculateAverageRating(this.meal)

})

ReviewSchema.post('deleteOne', { document: true, query: false }, async function () {
    await this.constructor.calculateAverageRating(this.meal);
});



export default mongoose.model('Review', ReviewSchema)