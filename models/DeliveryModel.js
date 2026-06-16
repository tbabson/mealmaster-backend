import mongoose from 'mongoose';
import { DELIVERY } from "../utils/constants.js"
import _default from "http-status-codes";

// Delivery Schema
const DeliverySchema = new mongoose.Schema({
    order: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Order',
        required: false,
    },
    deliveryTime: {
        type: Date,
        required: [false, 'Delivery time is required'],
    },
    deliveryAddress: {
        street: { type: String, required: false },
        city: { type: String, required: false },
        state: { type: String, required: false },
        postalCode: { type: String, required: false },
    },
    deliveryStatus: {
        type: String,
        enum: Object.values(DELIVERY),
        default: DELIVERY.SCHEDULED,
    },
    trackingNumber: {
        type: String,
        required: [false, 'Tracking number is required'],
    },
    trackingUpdates: [
        {
            status: { type: String },
            updatedAt: { type: Date, default: Date.now },
        },
    ],
}, { timestamps: true });

export default mongoose.model('Delivery', DeliverySchema);
