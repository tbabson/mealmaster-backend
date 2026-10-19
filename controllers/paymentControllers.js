import { StatusCodes } from 'http-status-codes';
import Stripe from 'stripe';
import Order from '../models/OrderModel.js';
import User from '../models/UserSchema.js';
import { BadRequestError } from '../errors/customErrors.js';
import { priceCartItems, calculateTotals } from '../utils/pricing.js';
import { primaryClientUrl } from '../utils/clientUrl.js';

// Initialize Stripe with secret key
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
if (!process.env.STRIPE_SECRET_KEY) {
    console.warn('STRIPE_SECRET_KEY is not set — card payments will fail.');
}

const toKobo = (naira) => Math.round(naira * 100);

const requireCheckoutInput = ({ cartItems, shippingAddress }) => {
    if (!Array.isArray(cartItems) || !cartItems.length || !shippingAddress) {
        throw new BadRequestError('Missing required checkout information');
    }
};

/**
 * Create a Stripe checkout session.
 *
 * Only meal ids, ingredient names and quantities are taken from the client.
 * Prices, tax and shipping are computed here, and the order belongs to the
 * authenticated user — never to a userId in the body.
 */
export const createStripeSession = async (req, res) => {
    requireCheckoutInput(req.body);
    const userId = req.user.userId;

    const cartItems = await priceCartItems(req.body.cartItems);
    if (!cartItems.length) {
        throw new BadRequestError('Your cart is empty');
    }
    const { taxPrice, shippingPrice, totalAmount } = calculateTotals(cartItems);

    // Create a temporary order in the database (not paid yet)
    const tempOrder = await Order.create({
        userId,
        cartItems,
        shippingAddress: req.body.shippingAddress,
        paymentMethod: 'stripe',
        taxPrice,
        shippingPrice,
        totalAmount,
        isPaid: false, // the webhook marks it paid
    });

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
                unit_amount: toKobo(mealTotal),
            },
            quantity: 1,
        };
    });

    // Charge exactly what the order records: items + tax + shipping
    lineItems.push(
        {
            price_data: {
                currency: 'ngn',
                product_data: { name: 'Tax', description: 'VAT (10%)' },
                unit_amount: toKobo(taxPrice),
            },
            quantity: 1,
        },
        {
            price_data: {
                currency: 'ngn',
                product_data: { name: 'Shipping', description: 'Standard shipping' },
                unit_amount: toKobo(shippingPrice),
            },
            quantity: 1,
        }
    );

    const user = await User.findById(userId).select('email');

    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            mode: 'payment',
            line_items: lineItems,
            customer_email: user?.email,
            metadata: {
                orderId: tempOrder._id.toString(),
                userId: String(userId),
            },
            success_url: `${primaryClientUrl()}/order-success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${primaryClientUrl()}/checkout`,
        });

        await Order.findByIdAndUpdate(tempOrder._id, { transactionId: session.id });
        res.status(StatusCodes.OK).json({ sessionId: session.id });
    } catch (error) {
        // No session means no way to pay — don't leave the order behind
        await Order.findByIdAndDelete(tempOrder._id);
        console.error('Stripe session error:', error);
        res.status(StatusCodes.BAD_GATEWAY).json({ message: 'Failed to create payment session' });
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
        return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Invalid signature' });
    }

    const session = event.data.object;
    const orderId = session?.metadata?.orderId;

    try {
        if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
            // Async methods complete with payment_status "unpaid" and settle later
            if (!orderId || session.payment_status !== 'paid') {
                return res.status(StatusCodes.OK).json({ received: true });
            }

            // Only flips an unpaid order — Stripe retries deliveries, so this must be idempotent
            const updatedOrder = await Order.findOneAndUpdate(
                { _id: orderId, isPaid: false },
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

            if (updatedOrder) {
                await User.findByIdAndUpdate(updatedOrder.userId, { $addToSet: { orders: updatedOrder._id } });
                console.log('Payment successful, order updated:', updatedOrder._id);
            }
        } else if (event.type === 'checkout.session.expired' && orderId) {
            // Abandoned checkout: remove the placeholder order
            await Order.deleteOne({ _id: orderId, isPaid: false, paymentMethod: 'stripe' });
        }
    } catch (error) {
        console.error('Error processing Stripe webhook:', error);
        // 500 makes Stripe retry the delivery later
        return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ received: false });
    }

    res.status(StatusCodes.OK).json({ received: true });
};

/**
 * Create order with Bank Transfer payment
 */
export const createBankTransferOrder = async (req, res) => {
    requireCheckoutInput(req.body);
    const userId = req.user.userId;

    const cartItems = await priceCartItems(req.body.cartItems);
    if (!cartItems.length) {
        throw new BadRequestError('Your cart is empty');
    }
    const { taxPrice, shippingPrice, totalAmount } = calculateTotals(cartItems);

    const transactionId = typeof req.body.transactionId === 'string' && req.body.transactionId.trim()
        ? req.body.transactionId.trim().slice(0, 100)
        : `BT-${Date.now()}`;

    const order = await Order.create({
        userId,
        cartItems,
        shippingAddress: req.body.shippingAddress,
        paymentMethod: 'bankTransfer',
        paymentResult: { status: 'pending' }, // verified by an admin before it is marked paid
        taxPrice,
        shippingPrice,
        totalAmount,
        isPaid: false,
        transactionId,
    });

    await User.findByIdAndUpdate(userId, { $addToSet: { orders: order._id } });

    res.status(StatusCodes.CREATED).json({
        order,
        message: 'Order placed successfully. We will process it once your payment is verified.'
    });
};
