import Order from '../models/OrderModel.js';
import Cart from '../models/CartModel.js';
import User from '../models/UserSchema.js';
import Meal from '../models/MealModel.js';
import Blog from '../models/BlogModel.js';
import Review from '../models/ReviewModel.js';
import { StatusCodes } from "http-status-codes";
import { ORDERS, DELIVERY } from "../utils/constants.js";
import { BadRequestError, NotFoundError } from '../errors/customErrors.js';
import { ownerFilter } from '../middleware/authMiddleware.js';
import { priceCartItems, calculateTotals } from '../utils/pricing.js';
import { containsFilter } from '../utils/escapeRegex.js';
import { getPagination } from '../utils/pagination.js';

// A Stripe order is created before the customer pays; until the webhook marks
// it paid it is just an open checkout, not a sale. Bank-transfer orders are
// real orders from the moment they are placed (payment is verified later).
export const PLACED_ORDER_FILTER = {
  $or: [{ paymentMethod: { $ne: 'stripe' } }, { isPaid: true }],
};

// ✅ Place an Order — from the caller's own server-side cart
export const placeOrder = async (req, res) => {
  const userId = req.user.userId;
  const { shippingAddress, paymentMethod, transactionId } = req.body;

  if (!shippingAddress || !paymentMethod) {
    throw new BadRequestError("Shipping address and payment method are required.");
  }

  const cart = await Cart.findOne({ userId });

  if (!cart || cart.cartItems.length === 0) {
    throw new BadRequestError("Cart is empty. Add items before placing an order.");
  }

  // Reprice against the catalogue — cart rows may hold stale or tampered prices
  const cartItems = await priceCartItems(cart.cartItems.map((item) => item.toObject()));
  const { taxPrice, shippingPrice, totalAmount } = calculateTotals(cartItems);

  const order = await Order.create({
    userId,
    cartItems,
    totalAmount,
    shippingAddress,
    paymentMethod,
    transactionId,
    taxPrice,
    shippingPrice,
    status: ORDERS.PENDING,
    deliveryStatus: DELIVERY.SCHEDULED,
  });

  await User.findByIdAndUpdate(userId, { $addToSet: { orders: order._id } });

  // Clear the cart after placing the order
  cart.cartItems = [];
  await cart.save();

  res.status(StatusCodes.CREATED).json(order);
};

// ✅ Get Orders for a User (self or admin, enforced on the route)
export const getUserOrders = async (req, res) => {
  const { userId } = req.params;
  const orders = await Order.find({ userId }).sort({ createdAt: -1 });
  res.status(StatusCodes.OK).json({ orders });
};

// ✅ Get Order by ID — owner or admin
export const getOrderById = async (req, res) => {
  const { orderId } = req.params;
  const order = await Order.findOne({ _id: orderId, ...ownerFilter(req, 'userId') })
    .populate('userId', 'fullName email');

  if (!order) {
    throw new NotFoundError("Order not found.");
  }

  res.status(StatusCodes.OK).json({ order });
};

// ✅ Get the order created for a Stripe Checkout session (order-success page).
// The webhook may not have marked it paid yet — isPaid tells the client which.
export const getOrderBySession = async (req, res) => {
  const { sessionId } = req.params;
  const order = await Order.findOne({
    transactionId: String(sessionId),
    paymentMethod: 'stripe',
    ...ownerFilter(req, 'userId'),
  });

  if (!order) {
    throw new NotFoundError("Order not found.");
  }

  res.status(StatusCodes.OK).json({ order });
};

// ✅ Update Order Status
export const updateOrderStatus = async (req, res) => {
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
    throw new NotFoundError("Order not found.");
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
};

// ✅ Update Delivery Status
export const updateDeliveryStatus = async (req, res) => {
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
    throw new NotFoundError("Order not found.");
  }

  order.deliveryStatus = deliveryStatus;

  // Update order status if delivery status changes
  if (deliveryStatus === DELIVERY.DELIVERED) {
    order.status = ORDERS.DELIVERED;
    order.deliveredAt = new Date();
  }

  await order.save();

  res.status(StatusCodes.OK).json({ order });
};

// ✅ Update Payment Status (admin, e.g. after verifying a bank transfer)
export const updatePaymentStatus = async (req, res) => {
  const { orderId } = req.params;
  const { isPaid, paymentResult } = req.body;

  if (typeof isPaid !== 'boolean') {
    throw new BadRequestError('isPaid must be true or false');
  }

  const order = await Order.findById(orderId);
  if (!order) {
    throw new NotFoundError("Order not found.");
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
    const { id, status, update_time, email_address } = paymentResult;
    order.paymentResult = { id, status, update_time, email_address };
  }

  await order.save();

  res.status(StatusCodes.OK).json({ order });
};

// ✅ Admin Stats
export const getAdminStats = async (req, res) => {
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
    totalRevenue,
    pendingOrders,
  ] = await Promise.all([
    Order.countDocuments(PLACED_ORDER_FILTER),
    User.countDocuments(),
    Meal.countDocuments(),
    Blog.countDocuments(),
    Review.countDocuments(),

    // Orders grouped by status
    Order.aggregate([
      { $match: PLACED_ORDER_FILTER },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),

    // Orders grouped by delivery status
    Order.aggregate([
      { $match: PLACED_ORDER_FILTER },
      { $group: { _id: '$deliveryStatus', count: { $sum: 1 } } },
    ]),

    // 5 most recent orders with user info
    Order.find(PLACED_ORDER_FILTER)
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('userId', 'fullName email'),

    // Monthly orders + revenue (paid orders only) for last 6 months
    Order.aggregate([
      { $match: { ...PLACED_ORDER_FILTER, createdAt: { $gte: sixMonthsAgo } } },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
          },
          orders: { $sum: 1 },
          revenue: { $sum: { $cond: ['$isPaid', '$totalAmount', 0] } },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]),

    // Top 5 meals by how many times they appear in orders
    Order.aggregate([
      { $match: PLACED_ORDER_FILTER },
      { $unwind: '$cartItems' },
      { $group: { _id: '$cartItems.name', orders: { $sum: 1 } } },
      { $sort: { orders: -1 } },
      { $limit: 5 },
    ]),

    Order.aggregate([
      { $match: { isPaid: true } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } },
    ]),

    Order.countDocuments({ ...PLACED_ORDER_FILTER, status: ORDERS.PENDING }),
  ]);

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
};

// ✅ Delete an Order
export const deleteOrder = async (req, res) => {
  const { orderId } = req.params;

  const order = await Order.findByIdAndDelete(orderId);
  if (!order) {
    throw new NotFoundError("Order not found.");
  }

  await User.findByIdAndUpdate(order.userId, { $pull: { orders: order._id } });
  res.status(StatusCodes.OK).json({ message: "Order deleted successfully." });
};

// ✅ Get All Orders (Admin)
export const getAllOrders = async (req, res) => {
  const { search, status, delivery, sort } = req.query;
  const { limit, skip } = getPagination({ page: req.query.page, limit: 10 });

  // Build query
  const queryObject = {};

  // Add filters
  if (status && status !== 'all') {
    queryObject.status = String(status);
  }
  if (delivery && delivery !== 'all') {
    queryObject.deliveryStatus = String(delivery);
  }
  if (search) {
    queryObject.$or = [
      { 'shippingAddress.fullName': containsFilter(search) },
      { trackingNumber: containsFilter(search) }
    ];
  }

  const sortOptions = {
    oldest: 'createdAt',
    'amount-highest': '-totalAmount',
    'amount-lowest': 'totalAmount',
  };

  const orders = await Order.find(queryObject)
    .sort(sortOptions[sort] || '-createdAt')
    .skip(skip)
    .limit(limit)
    .populate('userId', 'fullName email');
  const totalOrders = await Order.countDocuments(queryObject);
  const numOfPages = Math.ceil(totalOrders / limit);

  res.status(StatusCodes.OK).json({
    orders,
    totalOrders,
    numOfPages,
  });
};
