import { StatusCodes } from 'http-status-codes';
import Stripe from 'stripe';
import Order from '../models/OrderModel.js';
import User from '../models/UserSchema.js';

// Initialize Stripe with secret key
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
console.log(process.env.STRIPE_SECRET_KEY ? "Stripe key is set" : "Stripe key is missing");

/**
 * Create a Stripe checkout session
 */
export const createStripeSession = async (req, res) => {
    try {
        const { cartItems, shippingAddress, userId, totalAmount } = req.body;
        console.log("Request Body:", req.body);

        if (!cartItems || !cartItems.length || !userId || !shippingAddress) {
            return res.status(StatusCodes.BAD_REQUEST).json({
                message: 'Missing required checkout information'
            });
        }

        // Create a temporary order in the database (not paid yet)
        const tempOrder = await Order.create({
            userId,
            cartItems,
            shippingAddress,
            paymentMethod: 'stripe',
            taxPrice: totalAmount * 0.1, // Example calculation; adjust as needed
            shippingPrice: shippingAddress.shippingPrice || 300,
            totalAmount,
            isPaid: false, // mark as not paid yet
        });

        // Create line items for Stripe using your cart data
        const lineItems = cartItems.map(meal => {
            const mealTotal = meal.ingredients.reduce((sum, ing) => sum + ing.price * ing.quantity, 0);
            return {
                price_data: {
                    currency: 'ngn',
                    product_data: {
                        name: meal.name,
                        description: meal.ingredients.map(ing => `${ing.name} (${ing.quantity} ${ing.unit})`).join(', '),
                        images: meal.image ? [meal.image] : [],
                    },
                    unit_amount: Math.round(mealTotal * 100), // amount in kobo
                },
                quantity: 1,
            };
        });

        // Add shipping as a line item
        lineItems.push({
            price_data: {
                currency: 'ngn',
                product_data: {
                    name: 'Shipping',
                    description: 'Standard shipping',
                },
                unit_amount: Math.round((shippingAddress.shippingPrice || 300) * 100),
            },
            quantity: 1,
        });

        // Create the Stripe checkout session with metadata containing the temporary order ID and userId
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            mode: 'payment',
            line_items: lineItems,
            customer_email: req.user?.email, // if available from JWT
            metadata: {
                orderId: tempOrder._id.toString(),
                userId: userId,
            },
            success_url: `${process.env.CLIENT_URL}/order-success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.CLIENT_URL}/checkout`,
        });

        res.status(StatusCodes.OK).json({ sessionId: session.id });
    } catch (error) {
        console.error('Stripe session error:', error);
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
            message: 'Failed to create payment session',
            error: error.message
        });
    }
};

/**
 * Handle Stripe webhook events
 */
export const handleStripeWebhook = async (req, res) => {
    const signature = req.headers['stripe-signature'];

    let event;
    try {
        event = stripe.webhooks.constructEvent(
            req.body,
            signature,
            process.env.STRIPE_WEBHOOK_SECRET
        );
    } catch (error) {
        console.error('Webhook signature verification failed:', error.message);
        return res.status(StatusCodes.BAD_REQUEST).json({ message: error.message });
    }

    // Handle the checkout.session.completed event
    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;

        try {
            // Extract temporary order reference from metadata
            const orderId = session.metadata.orderId;
            const userId = session.metadata.userId; // if needed

            if (!orderId) {
                throw new Error('No orderId found in session metadata');
            }

            // Update the temporary order to mark it as paid
            const updatedOrder = await Order.findByIdAndUpdate(
                orderId,
                {
                    paymentResult: {
                        id: session.id,
                        status: session.payment_status,
                        update_time: new Date().toISOString(),
                        email_address: session.customer_details?.email,
                    },
                    isPaid: true,
                    paidAt: new Date(),
                    transactionId: session.id,
                },
                { new: true }
            );

            // Optionally, update the user's orders array
            await User.findByIdAndUpdate(userId, { $push: { orders: updatedOrder._id } });

            console.log('Payment successful, order updated:', updatedOrder._id);
        } catch (error) {
            console.error('Error processing successful payment:', error);
        }
    }

    res.status(StatusCodes.OK).json({ received: true });
};

/**
 * Create order with Bank Transfer payment
 */
export const createBankTransferOrder = async (req, res) => {
    try {
        const {
            cartItems,
            shippingAddress,
            paymentMethod,
            paymentResult,
            taxPrice,
            shippingPrice,
            totalAmount,
            transactionId
        } = req.body;

        if (!cartItems || !cartItems.length || !shippingAddress) {
            return res.status(StatusCodes.BAD_REQUEST).json({
                message: 'Missing required order information'
            });
        }

        // Create new order with pending payment status
        const order = await Order.create({
            userId: req.user.userId,
            cartItems,
            shippingAddress,
            paymentMethod,
            paymentResult: {
                ...paymentResult,
                status: 'pending' // Mark as pending for bank transfer
            },
            taxPrice,
            shippingPrice,
            totalAmount,
            isPaid: false, // Bank transfers need verification before marking as paid
            transactionId: transactionId || `BT-${Date.now()}`
        });

        // Update user's orders array
        await User.findByIdAndUpdate(req.user.userId, { $push: { orders: order._id } });

        // Return the order details
        res.status(StatusCodes.CREATED).json({
            order,
            message: 'Order placed successfully. We will process it once your payment is verified.'
        });
    } catch (error) {
        console.error('Error creating order:', error);
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
            message: 'Failed to create order',
            error: error.message
        });
    }
};