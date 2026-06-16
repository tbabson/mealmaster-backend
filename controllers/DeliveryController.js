import Delivery from '../models/DeliveryModel.js';
import { StatusCodes } from 'http-status-codes';
import Order from '../models/OrderModel.js'; // Import the Order model
import { NotFoundError } from '../errors/customErrors.js';


export const updateTrackingStatus = async (req, res) => {
    const { id: orderId } = req.params;  // The order ID will be passed as a parameter
    const { status } = req.body;

    try {
        // Step 1: Find the order by the provided orderId
        const order = await Order.findById(orderId);
        if (!order) {
            throw new NotFoundError(`Order with id: ${orderId} not found`);
        }

        // Step 2: Get the delivery ID from the order
        const deliveryId = order.delivery;
        if (!deliveryId) {
            throw new NotFoundError(`No delivery associated with this order`);
        }

        // Step 3: Find the delivery by its ID
        const delivery = await Delivery.findById(deliveryId);
        if (!delivery) {
            return res.status(StatusCodes.NOT_FOUND).json({ message: 'Delivery not found' });
        }

        // Step 4: Update the tracking status
        delivery.trackingUpdates.push({ status });
        delivery.deliveryStatus = status;
        await delivery.save();

        // Step 5: Respond with the updated delivery information
        res.status(StatusCodes.OK).json({ delivery });
    } catch (error) {
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: error.message });
    }
};


// @desc    Get tracking updates for a delivery
// @route   GET /api/v1/orders/:id/delivery/tracking
export const getTrackingUpdates = async (req, res) => {
    const { id: orderId } = req.params;  // The order ID will be passed as a parameter

    try {
        // Step 1: Find the order by the provided orderId
        const order = await Order.findById(orderId);
        if (!order) {
            throw new NotFoundError(`Order with id: ${orderId} not found`);
        }

        // Step 2: Get the delivery ID from the order
        const deliveryId = order.delivery;
        if (!deliveryId) {
            throw new NotFoundError(`No delivery associated with this order`);
        }

        // Step 3: Find the delivery by its ID
        const delivery = await Delivery.findById(deliveryId);
        if (!delivery) {
            return res.status(StatusCodes.NOT_FOUND).json({ message: 'Delivery not found' });
        }

        // Step 4: Respond with the tracking updates
        res.status(StatusCodes.OK).json({ trackingUpdates: delivery.trackingUpdates });
    } catch (error) {
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: error.message });
    }
};
