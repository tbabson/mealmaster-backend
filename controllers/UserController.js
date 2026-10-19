import User from '../models/UserSchema.js'
import { StatusCodes } from 'http-status-codes'
import { hashPassword, comparePassword } from '../utils/passwordUtils.js'
import { BadRequestError, NotFoundError, UnauthenticatedError } from '../errors/customErrors.js'
import Order from '../models/OrderModel.js';
import Reminder from '../models/ReminderModel.js'
import Cart from '../models/CartModel.js';
import Subscription from '../models/SubscriptionModel.js';
import ShoppingList from '../models/shoppingListModel.js';
import NutritionRecommendation from '../models/NutritionRecommendationModel.js';
import cloudinary from 'cloudinary';
import { validatePassword } from './authController.js';
import { containsFilter } from '../utils/escapeRegex.js';
import { getPagination } from '../utils/pagination.js';
import { removeTempFile } from '../utils/files.js';
import { cancelReminderJob } from './ScheduleReminders.js';

// Fields a user may change on their own profile. Everything else — role,
// orders, Google tokens — is never taken from the request body.
const UPDATABLE_FIELDS = ['fullName', 'email'];

export const getAllUsers = async (req, res) => {
    const { search, role, sort } = req.query;
    const queryObject = {};

    // Filtering
    if (role && role !== 'all') {
        queryObject.role = String(role);
    }

    // Handle search query
    if (search) {
        queryObject.$or = [
            { fullName: containsFilter(search) },
            { email: containsFilter(search) }
        ];
    }

    // Sorting
    const sortOptions = {
        newest: '-createdAt',
        oldest: 'createdAt',
        'a-z': 'fullName',
        'z-a': '-fullName',
    };

    const sortKey = sortOptions[sort] || sortOptions.newest;
    const { page, limit, skip } = getPagination(req.query, { defaultLimit: 12 });

    const users = await User.find(queryObject)
        .populate('orders')
        .populate('reminders')
        .sort(sortKey)
        .skip(skip)
        .limit(limit);

    // One query for every cart on the page instead of one per user
    const carts = await Cart.find({ userId: { $in: users.map((u) => u._id) } });
    const usersWithData = users.map((user) => ({
        ...user.toJSON(),
        cartItems: carts.filter((c) => String(c.userId) === String(user._id)),
    }));

    const totalUsers = await User.countDocuments(queryObject);
    const numOfPages = Math.ceil(totalUsers / limit);

    res.status(StatusCodes.OK).json({
        users: usersWithData,
        totalUsers,
        numOfPages,
        currentPage: page
    });
}

export const showCurrentUser = async (req, res) => {
    const user = await User.findById(req.user.userId);
    if (!user) {
        throw new NotFoundError('User not found');
    }
    res.status(StatusCodes.OK).json({ user });
};

// GET SINGLE USER CONTROLLER — self or admin (enforced by requireSelfOrAdmin on the route)
export const getUser = async (req, res) => {
    const user = await User.findById(req.params.id)
        .populate('orders')
        .populate('reminders');

    if (!user) {
        throw new NotFoundError('User not found');
    }

    const [cartItems, orders, reminders] = await Promise.all([
        Cart.find({ userId: user._id }),
        Order.find({ userId: user._id }).sort({ createdAt: -1 }),
        Reminder.find({ user: user._id }),
    ]);

    res.status(StatusCodes.OK).json({
        user,
        orders,
        cartItems,
        reminders,
    });
};

// EDIT USER CONTROLLER — always edits the caller's own profile
export const updateUser = async (req, res) => {
    try {
        const updates = {};
        for (const field of UPDATABLE_FIELDS) {
            if (req.body[field] === undefined) continue;
            if (typeof req.body[field] !== 'string' || !req.body[field].trim()) {
                throw new BadRequestError(`${field} must be a non-empty string`);
            }
            updates[field] = req.body[field].trim();
        }

        if (req.file) {
            const currentUser = await User.findById(req.user.userId);

            const result = await cloudinary.v2.uploader.upload(req.file.path, {
                folder: 'mealmaster/users',
                use_filename: true,
            });

            // Only remove the old image once the new one is safely stored
            if (currentUser?.cloudinaryId) {
                await cloudinary.v2.uploader.destroy(currentUser.cloudinaryId);
            }

            updates.profileImage = result.secure_url;
            updates.cloudinaryId = result.public_id;
        }

        const updatedUser = await User.findByIdAndUpdate(
            req.user.userId,
            updates,
            { new: true, runValidators: true }
        );

        res.status(StatusCodes.OK).json({ user: updatedUser });
    } finally {
        await removeTempFile(req.file);
    }
}

// DELETE USER CONTROLLER (admin)
export const deleteUser = async (req, res) => {
    const removedUser = await User.findByIdAndDelete(req.params.id)
    if (!removedUser) {
        throw new NotFoundError('User not found');
    }

    // Remove what only made sense for this user. Orders are kept for the books.
    const reminders = await Reminder.find({ user: removedUser._id }).select('_id');
    reminders.forEach((r) => cancelReminderJob(r._id));
    await Promise.all([
        Cart.deleteMany({ userId: removedUser._id }),
        Reminder.deleteMany({ user: removedUser._id }),
        Subscription.deleteMany({ user: removedUser._id }),
        ShoppingList.deleteMany({ user: removedUser._id }),
        NutritionRecommendation.deleteMany({ user: removedUser._id }),
    ]);
    if (removedUser.cloudinaryId) {
        await cloudinary.v2.uploader.destroy(removedUser.cloudinaryId);
    }

    res.status(StatusCodes.OK).json({ msg: 'user deleted', user: removedUser })
}

// UPDATE USER PASSWORD CONTROLLER
export const changeUserPassword = async (req, res) => {
    const { oldPassword, newPassword } = req.body;

    if (typeof oldPassword !== 'string' || !oldPassword) {
        throw new BadRequestError('Please provide your current password');
    }
    validatePassword(newPassword);

    const user = await User.findById(req.user.userId);

    const isValidUser = user && await comparePassword(oldPassword, user.password)

    if (!isValidUser) throw new UnauthenticatedError('Enter correct old password')

    user.password = await hashPassword(newPassword);
    await user.save();

    res.status(StatusCodes.OK).json({ msg: 'Success! Password Changed.' });
};
