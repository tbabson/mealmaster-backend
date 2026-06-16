import mongoose from 'mongoose';
import { ORDERS, DELIVERY } from "../utils/constants.js"


const OrderSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },
        cartItems: [
            {
                mealID: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: "Meal",
                    required: true
                },
                name: {
                    type: String,
                    required: true
                },
                image: {
                    type: String,
                    default: ''
                },
                ingredients: [
                    {
                        name: {
                            type: String,
                            required: true
                        },
                        quantity: {
                            type: Number,
                            required: true,
                            min: 0
                        },
                        price: {
                            type: Number,
                            required: true,
                            min: 0
                        },
                        unit: {
                            type: String,
                            default: 'g'
                        }
                    }
                ]
            }
        ],
        shippingAddress: {
            fullName: { type: String, required: true },
            address: { type: String, required: true },
            city: { type: String, required: true },
            postalCode: { type: String, required: true },
            country: { type: String, required: true },
            phone: { type: String, required: true }
        },
        paymentMethod: {
            type: String,
            required: true,
            enum: ['stripe', 'bankTransfer']
        },
        paymentResult: {
            id: { type: String },
            status: { type: String },
            update_time: { type: String },
            email_address: { type: String }
        },
        taxPrice: {
            type: Number,
            required: true,
            default: 0.0
        },
        shippingPrice: {
            type: Number,
            required: true,
            default: 300 // Matching the cart slice shipping default
        },
        totalAmount: {
            type: Number,
            required: true
        },
        status: {
            type: String,
            enum: Object.values(ORDERS),
            default: ORDERS.PENDING,
        },
        isPaid: {
            type: Boolean,
            required: true,
            default: false
        },
        paidAt: {
            type: Date
        },
        deliveryStatus: {
            type: String,
            enum: Object.values(DELIVERY),
            default: DELIVERY.SCHEDULED,
        },
        deliveredAt: {
            type: Date
        },
        trackingNumber: {
            type: String,
            default: function () {
                return `TRACK${Math.floor(Math.random() * 100000)}`;
            },
        },
        transactionId: {
            type: String
        }
    },
    { timestamps: true }
);

export default mongoose.model('Order', OrderSchema);

