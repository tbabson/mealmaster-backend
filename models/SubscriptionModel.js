import mongoose from 'mongoose';

const SubscriptionSchema = new mongoose.Schema({
    endpoint: {
        type: String,
        required: true,
        // One row per browser endpoint. The controllers upsert on this field;
        // the index is what stops concurrent subscribes racing into duplicates.
        unique: true,
    },
    keys: {
        p256dh: {
            type: String,
            required: true,
        },
        auth: {
            type: String,
            required: true,
        }
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
}, { timestamps: true });

export default mongoose.model('Subscription', SubscriptionSchema);
