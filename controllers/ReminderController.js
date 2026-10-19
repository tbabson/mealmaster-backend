import Reminder from '../models/ReminderModel.js';
import Subscription from '../models/SubscriptionModel.js';
import { StatusCodes } from 'http-status-codes';
import Meal from '../models/MealModel.js';
import {
    scheduleIndividualReminder,
    cancelReminderJob,
    buildCalendarEvent,
    insertCalendarEvent,
    REMINDER_POPULATE,
} from './ScheduleReminders.js';
import moment from 'moment-timezone';
import webPush from 'web-push';
import { BadRequestError, NotFoundError } from '../errors/customErrors.js';
import { ownerFilter } from '../middleware/authMiddleware.js';

// VAPID key configuration — skipped (with a warning) rather than crashing the
// whole server at import time when the keys are not configured.
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    webPush.setVapidDetails(
        process.env.VAPID_SUBJECT || 'mailto:babatunde.taiwoadekunle@gmail.com',
        process.env.VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
    );
} else {
    console.warn('VAPID keys are not set — push notifications are disabled.');
}

const findOwnReminder = async (req) => {
    const reminder = await Reminder.findOne({ _id: req.params.id, ...ownerFilter(req) });
    if (!reminder) throw new NotFoundError('Reminder not found');
    return reminder;
};

const upsertSubscription = ({ endpoint, keys }, userId) =>
    Subscription.findOneAndUpdate(
        { endpoint },
        {
            endpoint,
            keys: {
                p256dh: keys.p256dh,
                auth: keys.auth,
            },
            user: userId,
        },
        { new: true, upsert: true, setDefaultsOnInsert: true }
    );

const isValidSubscription = (s) =>
    s && typeof s.endpoint === 'string' && s.keys && s.keys.p256dh && s.keys.auth;

// Save the push subscription in the database
export const savePushSubscription = async (req, res) => {
    if (!isValidSubscription(req.body)) {
        throw new BadRequestError('Invalid subscription data. Ensure endpoint, keys.p256dh, and keys.auth are provided.');
    }

    // Upsert on endpoint — a browser re-subscribing must not leave a stale row behind
    const subscription = await upsertSubscription(req.body, req.user.userId);

    res.status(StatusCodes.CREATED).json({ message: 'Push subscription saved successfully', subscription });
};

// @desc    Create a new meal reminder
// @route   POST /api/reminders
export const createReminder = async (req, res) => {
    const {
        meal: mealId,
        reminderTime,
        notificationMethod,
        isRecurring,
        recurringFrequency,
        subscription,
        note,
        timezone,
    } = req.body;
    const userId = req.user.userId;

    const meal = await Meal.findById(mealId);
    if (!meal) {
        throw new BadRequestError('Invalid meal ID provided');
    }

    if (!reminderTime || !moment(reminderTime).isValid()) {
        throw new BadRequestError('A valid reminder time is required');
    }

    // Only validate subscription for push notifications
    let savedSubscription = null;
    if (notificationMethod === 'push') {
        if (!isValidSubscription(subscription)) {
            throw new BadRequestError('A valid push subscription is required to create a reminder with push notifications.');
        }

        // Reuse the row for this endpoint rather than adding one per reminder
        savedSubscription = await upsertSubscription(subscription, userId);
    }

    const reminder = await Reminder.create({
        user: userId,
        meal: meal._id,
        reminderTime: moment(reminderTime).utc().toDate(),
        notificationMethod,
        isRecurring,
        recurringFrequency,
        subscription: savedSubscription ? savedSubscription._id : null,
        note,
        timezone: timezone || 'Africa/Lagos',
    });

    scheduleIndividualReminder(reminder);
    res.status(StatusCodes.CREATED).json({ reminder });
};

// @desc    Get a specific user's reminders
// @route   GET /api/reminders/user
export const getSingleUserReminders = async (req, res) => {
    const reminders = await Reminder.find({ user: req.user.userId }).populate('meal');
    if (!reminders.length) {
        return res.status(StatusCodes.NOT_FOUND).json({ message: 'No reminders found for this user' });
    }
    res.status(StatusCodes.OK).json({ reminders, count: reminders.length });
};

// @desc Send push notification
// @route POST /api/reminders/send-push/:id
export const sendPushNotification = async (req, res) => {
    const { id } = req.params;

    const reminder = await Reminder.findOne({ _id: id, ...ownerFilter(req) })
        .populate(REMINDER_POPULATE)
        .populate('subscription');
    if (!reminder) {
        throw new NotFoundError('Reminder not found');
    }

    if (!reminder.subscription || !reminder.subscription.endpoint) {
        throw new BadRequestError('No push subscription found for the user');
    }

    const subscription = {
        endpoint: reminder.subscription.endpoint,
        keys: {
            p256dh: reminder.subscription.keys.p256dh,
            auth: reminder.subscription.keys.auth
        }
    };

    const payload = JSON.stringify({
        title: `Meal Reminder: ${reminder.meal.name}`,
        body: `Hello ${reminder.user.fullName}, it's time to prepare your meal: ${reminder.meal.name}. Ingredients: ${reminder.meal.ingredients.map(ingredient => ingredient.name).join(', ')}.`,
        icon: reminder.meal.image || '/icons/icon-192.png',
        badge: '/icons/badge-72.png',
        data: { url: `/meals/${reminder.meal._id}` },
    });

    try {
        await webPush.sendNotification(subscription, payload);
        res.status(StatusCodes.OK).json({ message: 'Push notification sent successfully' });
    } catch (error) {
        // The browser discarded this subscription — drop it instead of retrying forever
        if (error.statusCode === 404 || error.statusCode === 410) {
            await Subscription.findByIdAndDelete(reminder.subscription._id);
            await Reminder.findByIdAndUpdate(id, { subscription: null });
            return res.status(StatusCodes.GONE).json({
                message: 'This push subscription has expired. Re-enable notifications on that device.'
            });
        }
        throw error;
    }
};

// @desc    Sync reminder with Google Calendar
// @route   POST /api/reminders/calendar-sync/:id
export const syncWithCalendar = async (req, res) => {
    const reminder = await Reminder.findOne({ _id: req.params.id, ...ownerFilter(req) })
        .populate(REMINDER_POPULATE);

    if (!reminder) {
        throw new NotFoundError('Reminder not found');
    }

    try {
        const event = {
            ...buildCalendarEvent(reminder),
            attendees: [{ email: reminder.user.email }],
        };
        const created = await insertCalendarEvent(reminder, event);

        reminder.calendarEventId = created.id;
        reminder.calendarEventLink = created.htmlLink;
        reminder.calendarSyncStatus = 'synced';
        reminder.lastSyncedAt = new Date();
        await reminder.save();

        res.status(StatusCodes.OK).json({
            message: 'Successfully synced with Google Calendar',
            eventLink: created.htmlLink,
            reminder
        });
    } catch (error) {
        console.error('Calendar sync error:', error);
        await Reminder.findByIdAndUpdate(reminder._id, { calendarSyncStatus: 'failed' });
        res.status(StatusCodes.BAD_GATEWAY).json({ message: 'Failed to sync with Google Calendar' });
    }
};

// @desc    All reminders (admin)
// @route   GET /api/reminders
export const getUserReminders = async (req, res) => {
    const reminders = await Reminder.find({})
        .populate('meal')
        .populate('user', 'fullName email')
        .sort({ reminderTime: 1 });
    res.status(StatusCodes.OK).json({ reminders, count: reminders.length });
};

// @desc    Update reminder
// @route   PATCH /api/reminders/:id
export const updateReminder = async (req, res) => {
    const {
        reminderTime,
        notificationMethod,
        isRecurring,
        recurringFrequency,
        note,
    } = req.body;

    const reminder = await findOwnReminder(req);

    if (reminderTime) {
        if (!moment(reminderTime).isValid()) {
            throw new BadRequestError('A valid reminder time is required');
        }
        reminder.reminderTime = moment(reminderTime).utc().toDate();
        // A new time means a new, unsent occurrence
        reminder.notified = false;
    }
    reminder.notificationMethod = notificationMethod || reminder.notificationMethod;
    reminder.isRecurring = isRecurring !== undefined ? isRecurring : reminder.isRecurring;
    reminder.recurringFrequency = recurringFrequency || reminder.recurringFrequency;
    reminder.note = note !== undefined ? note : reminder.note;

    await reminder.save();

    // Populate meal so the frontend keeps the full meal object (not just an ID)
    await reminder.populate('meal');

    // Replaces the previously scheduled job, so the old time no longer fires
    scheduleIndividualReminder(reminder);

    res.status(StatusCodes.OK).json({ reminder });
};

// @desc    Delete reminder
// @route   DELETE /api/reminders/:id
export const deleteReminder = async (req, res) => {
    const reminder = await findOwnReminder(req);

    cancelReminderJob(reminder._id);
    await reminder.deleteOne();
    res.status(StatusCodes.OK).json({ message: 'Reminder deleted successfully' });
};
