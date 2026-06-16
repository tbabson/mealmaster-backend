import Order from '../models/OrderModel.js';
import Cart from '../models/CartModel.js';
import User from '../models/UserSchema.js';
import Meal from '../models/MealModel.js';
import Blog from '../models/BlogModel.js';
import Review from '../models/ReviewModel.js';
import { StatusCodes } from "http-status-codes";
import { ORDERS, DELIVERY } from "../utils/constants.js";

// ✅ Place an Order
export const placeOrder = async (req, res) => {
  try {
    const { userId, shippingAddress, paymentMethod, transactionId } = req.body;

    if (!userId || !shippingAddress || !paymentMethod) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        message: "User ID, shipping address, and payment method are required."
      });
    }

    const cart = await Cart.findOne({ userId });

    if (!cart || cart.cartItems.length === 0) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        message: "Cart is empty. Add items before placing an order."
      });
    }

    // Calculate order totals, matching the cart slice logic
    const totalAmount = cart.cartItems.reduce((total, meal) => {
      return total + meal.ingredients.reduce((sum, ing) => sum + ing.price * ing.quantity, 0);
    }, 0);

    const taxPrice = totalAmount * 0.1; // 10% tax rate from cart slice
    const shippingPrice = 300; // Default from cart slice

    // Generate a random tracking number
    const trackingNumber = `TRACK${Math.floor(Math.random() * 100000)}`;

    const order = new Order({
      userId,
      cartItems: cart.cartItems,
      totalAmount: totalAmount + taxPrice + shippingPrice,
      shippingAddress,
      paymentMethod,
      transactionId,
      taxPrice,
      shippingPrice,
      status: ORDERS.PENDING,
      deliveryStatus: DELIVERY.SCHEDULED,
      trackingNumber, // Set the tracking number here
    });

    await order.save();

    // Clear the cart after placing the order
    cart.cartItems = [];
    await cart.save();

    res.status(StatusCodes.CREATED).json(order);
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: "Failed to place order.",
      error: error.message
    });
  }
};



// ✅ Get Orders for a User
export const getUserOrders = async (req, res) => {
  try {
    const { userId } = req.params;
    const orders = await Order.find({ userId }).sort({ createdAt: -1 });
    res.status(StatusCodes.OK).json({ orders });
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: "Failed to retrieve orders.",
      error: error.message
    });
  }
};

// ✅ Get Order by ID
export const getOrderById = async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findById(orderId).populate('userId', 'name email');

    if (!order) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: "Order not found." });
    }

    res.status(StatusCodes.OK).json({ order });
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: "Failed to fetch order.",
      error: error.message
    });
  }
};

// ✅ Update Order Status
export const updateOrderStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;

    if (!Object.values(ORDERS).includes(status)) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        message: "Invalid order status.",
        validStatuses: Object.values(ORDERS)
      });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: "Order not found." });
    }

    order.status = status;

    // Update delivery status if relevant
    if (status === ORDERS.DELIVERED) {
      order.deliveryStatus = DELIVERY.DELIVERED;
      order.deliveredAt = new Date();
    } else if (status === ORDERS.PROCESSED) {
      // When the order is processed, delivery status becomes out for delivery
      order.deliveryStatus = DELIVERY.OUTFORDELIVERY;
    } else if (status === ORDERS.PROCESSING) {
      // If the order is processing, we can set delivery status to clearing
      order.deliveryStatus = DELIVERY.CLEARING;
    } else if (status === ORDERS.CANCELLED) {
      // If the order is cancelled, set delivery as failed
      order.deliveryStatus = DELIVERY.FAILED;
    }

    await order.save();

    res.status(StatusCodes.OK).json({ order });
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: "Failed to update order status.",
      error: error.message
    });
  }
};

// ✅ Update Delivery Status
export const updateDeliveryStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { deliveryStatus } = req.body;

    if (!Object.values(DELIVERY).includes(deliveryStatus)) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        message: "Invalid delivery status.",
        validStatuses: Object.values(DELIVERY)
      });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: "Order not found." });
    }

    order.deliveryStatus = deliveryStatus;

    // Update order status if delivery status changes
    if (deliveryStatus === DELIVERY.DELIVERED) {
      order.status = ORDERS.DELIVERED;
      order.deliveredAt = new Date();
    } else if (deliveryStatus === DELIVERY.FAILED) {
      // Optional: you might want to handle failed deliveries differently
      // For example, by allowing redelivery or cancellation
    }

    await order.save();

    res.status(StatusCodes.OK).json({ order });
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: "Failed to update delivery status.",
      error: error.message
    });
  }
};

// ✅ Update Payment Status
export const updatePaymentStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { isPaid, paymentResult } = req.body;

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: "Order not found." });
    }

    order.isPaid = isPaid;
    if (isPaid) {
      order.paidAt = new Date();

      // If payment is confirmed, update order status to processed 
      // (only if it was in pending state)
      if (order.status === ORDERS.PENDING) {
        order.status = ORDERS.PROCESSED;
      }
    }

    if (paymentResult) {
      order.paymentResult = paymentResult;
    }

    await order.save();

    res.status(StatusCodes.OK).json({ order });
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: "Failed to update payment status.",
      error: error.message
    });
  }
};

// ✅ Admin Stats
export const getAdminStats = async (req, res) => {
  try {
    const now = new Date();
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

    const [
      totalOrders,
      totalUsers,
      totalMeals,
      totalBlogs,
      totalReviews,
      ordersByStatus,
      ordersByDelivery,
      recentOrders,
      monthlyData,
      topMeals,
    ] = await Promise.all([
      Order.countDocuments(),
      User.countDocuments(),
      Meal.countDocuments(),
      Blog.countDocuments(),
      Review.countDocuments(),

      // Orders grouped by status
      Order.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),

      // Orders grouped by delivery status
      Order.aggregate([
        { $group: { _id: '$deliveryStatus', count: { $sum: 1 } } },
      ]),

      // 5 most recent orders with user info
      Order.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('userId', 'fullName email'),

      // Monthly orders + revenue for last 6 months
      Order.aggregate([
        { $match: { createdAt: { $gte: sixMonthsAgo } } },
        {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' },
            },
            orders: { $sum: 1 },
            revenue: { $sum: '$totalAmount' },
          },
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } },
      ]),

      // Top 5 meals by how many times they appear in orders
      Order.aggregate([
        { $unwind: '$cartItems' },
        { $group: { _id: '$cartItems.name', orders: { $sum: 1 } } },
        { $sort: { orders: -1 } },
        { $limit: 5 },
      ]),
    ]);

    const totalRevenue = await Order.aggregate([
      { $match: { isPaid: true } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } },
    ]);

    const pendingOrders = await Order.countDocuments({ status: ORDERS.PENDING });

    // Fill in missing months so chart always shows 6 bars
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const filledMonthly = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const found = monthlyData.find(
        (m) => m._id.year === d.getFullYear() && m._id.month === d.getMonth() + 1
      );
      filledMonthly.push({
        month: monthNames[d.getMonth()],
        orders: found?.orders || 0,
        revenue: found?.revenue || 0,
      });
    }

    res.status(StatusCodes.OK).json({
      totals: {
        orders: totalOrders,
        revenue: totalRevenue[0]?.total || 0,
        users: totalUsers,
        meals: totalMeals,
        blogs: totalBlogs,
        reviews: totalReviews,
        pendingOrders,
      },
      ordersByStatus,
      ordersByDelivery,
      recentOrders,
      monthlyData: filledMonthly,
      topMeals,
    });
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: 'Failed to fetch admin stats.',
      error: error.message,
    });
  }
};

// ✅ Delete an Order
export const deleteOrder = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: "Order not found." });
    }

    await order.deleteOne();
    res.status(StatusCodes.OK).json({ message: "Order deleted successfully." });
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: "Failed to delete order.",
      error: error.message
    });
  }
};

// ✅ Get All Orders (Admin)
export const getAllOrders = async (req, res) => {
  try {
    const { search, status, delivery, sort, page = 1 } = req.query;
    const limit = 10; // Number of orders per page

    // Build query
    const queryObject = {};

    // Add filters
    if (status && status !== 'all') {
      queryObject.status = status;
    }
    if (delivery && delivery !== 'all') {
      queryObject.deliveryStatus = delivery;
    }
    if (search) {
      queryObject.$or = [
        { 'shippingAddress.fullName': { $regex: search, $options: 'i' } },
        { trackingNumber: { $regex: search, $options: 'i' } }
      ];
    }

    // Create query
    let result = Order.find(queryObject);

    // Sort orders
    switch (sort) {
      case 'oldest':
        result = result.sort('createdAt');
        break;
      case 'amount-highest':
        result = result.sort('-totalAmount');
        break;
      case 'amount-lowest':
        result = result.sort('totalAmount');
        break;
      default:
        result = result.sort('-createdAt');
    }

    // Setup pagination
    const skip = (page - 1) * limit;
    result = result.skip(skip).limit(limit);

    // Execute query
    const orders = await result.populate('userId', 'name email').exec();
    const totalOrders = await Order.countDocuments(queryObject);
    const numOfPages = Math.ceil(totalOrders / limit);

    res.status(StatusCodes.OK).json({
      orders,
      totalOrders,
      numOfPages,
    });
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: "Failed to fetch orders",
      error: error.message
    });
  }
};
