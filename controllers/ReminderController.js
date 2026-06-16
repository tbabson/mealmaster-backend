import Reminder from '../models/ReminderModel.js';
import Subscription from '../models/SubscriptionModel.js';
import { StatusCodes } from 'http-status-codes';
import Meal from '../models/MealModel.js'; // Assuming a Meal model exists
//import nodemailer from 'nodemailer';
import { scheduleIndividualReminder } from './ScheduleReminders.js';
import { google } from 'googleapis';
import moment from 'moment-timezone';
import webPush from 'web-push';
import dotenv from 'dotenv';
dotenv.config();

// VAPID key configuration
const vapidKeys = {
    publicKey: process.env.VAPID_PUBLIC_KEY,
    privateKey: process.env.VAPID_PRIVATE_KEY
};

webPush.setVapidDetails(
    'mailto:babatunde.taiwoadekunle@gmail.com',
    vapidKeys.publicKey,
    vapidKeys.privateKey
);

// Save the push subscription in the database

export const savePushSubscription = async (req, res) => {
    // console.log('Received Subscription Data:', req.body);
    const { endpoint, keys } = req.body;
    const userId = req.user.userId; // Extract user ID from authenticated request

    // Validate subscription data
    if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
        console.error('Invalid subscription data:', { endpoint, keys });
        return res.status(StatusCodes.BAD_REQUEST).json({
            message: 'Invalid subscription data. Ensure endpoint, keys.p256dh, and keys.auth are provided.'
        });
    }

    try {
        // Save subscription to the database
        const subscription = await Subscription.create({
            endpoint,
            keys: {
                p256dh: keys.p256dh,
                auth: keys.auth,
            },
            user: userId, // Add the user ID
        });

        res.status(StatusCodes.CREATED).json({ message: 'Push subscription saved successfully', subscription });
    } catch (error) {
        console.error('Error saving subscription:', error); // Log the error details
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: 'Failed to save subscription' });
    }
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
    } = req.body;
    const userId = req.user.userId;

    try {
        // Validate or fetch the provided meal
        const meal = await Meal.findById(mealId);
        if (!meal) {
            return res
                .status(StatusCodes.BAD_REQUEST)
                .json({ message: 'Invalid meal ID provided' });
        }

        // Only validate subscription for push notifications
        let savedSubscription = null;
        if (notificationMethod === 'push') {
            if (!subscription || !subscription.endpoint || !subscription.keys) {
                return res.status(StatusCodes.BAD_REQUEST).json({
                    message: 'A valid push subscription is required to create a reminder with push notifications.'
                });
            }

            // Save the subscription for push notifications
            savedSubscription = await Subscription.create({
                endpoint: subscription.endpoint,
                keys: {
                    p256dh: subscription.keys.p256dh,
                    auth: subscription.keys.auth
                },
                user: userId
            });
        }

        const utcReminderTime = moment(reminderTime).utc().toISOString();

        const reminder = await Reminder.create({
            user: userId,
            meal: meal._id,
            reminderTime: utcReminderTime,
            notificationMethod,
            isRecurring,
            recurringFrequency,
            subscription: savedSubscription ? savedSubscription._id : null,
            note,
        });

        scheduleIndividualReminder(reminder);
        res.status(StatusCodes.CREATED).json({ reminder });
    } catch (error) {
        res
            .status(StatusCodes.INTERNAL_SERVER_ERROR)
            .json({ message: error.message });
    }
};

// @desc    Get a specific user's reminders
// @route   GET /api/reminders/user
export const getSingleUserReminders = async (req, res) => {
    const userId = req.user.userId; // Assuming the user is authenticated and userId is available

    try {
        // Fetch the reminders for the authenticated user
        const reminders = await Reminder.find({ user: userId }).populate('meal');
        if (!reminders.length) {
            return res.status(StatusCodes.NOT_FOUND).json({ message: 'No reminders found for this user' });
        }
        res.status(StatusCodes.OK).json({ reminders, count: reminders.length });
    } catch (error) {
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: error.message });
    }
};

// @desc Send push notification
// @route POST /api/reminders/send-push/:id
export const sendPushNotification = async (req, res) => {
    const { id } = req.params;

    try {
        const reminder = await Reminder.findById(id).populate('user meal');
        if (!reminder) {
            return res.status(StatusCodes.NOT_FOUND).json({ message: 'Reminder not found' });
        }

        // Check if push subscription exists in the reminder object
        if (!reminder.subscription || !reminder.subscription.endpoint) {
            return res.status(StatusCodes.BAD_REQUEST).json({ message: 'No push subscription found for the user' });
        }

        // Extract subscription details from the reminder
        const subscription = {
            endpoint: reminder.subscription.endpoint,
            keys: {
                p256dh: reminder.subscription.keys.p256dh,
                auth: reminder.subscription.keys.auth
            }
        };

        // Create the notification payload
        const payload = JSON.stringify({
            title: `Meal Reminder: ${reminder.meal.name}`,
            body: `Hello ${reminder.user.fullName}, it's time to prepare your meal: ${reminder.meal.name}. Ingredients: ${reminder.meal.ingredients.map(ingredient => ingredient.name).join(', ')}.`
        });

        // Send the push notification
        await webPush.sendNotification(subscription, payload);
        res.status(StatusCodes.OK).json({ message: 'Push notification sent successfully' });
    } catch (error) {
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: error.message });
    }
};

// @desc    Sync reminder with Google Calendar
// @route   POST /api/reminders/calendar-sync/:id
export const syncWithCalendar = async (req, res) => {
    const { id } = req.params;

    try {
        const reminder = await Reminder.findById(id)
            .populate('user', 'email fullName')
            .populate('meal', 'name ingredients preparationSteps');

        if (!reminder) {
            return res.status(StatusCodes.NOT_FOUND)
                .json({ message: 'Reminder not found' });
        }

        // Get the authenticated Google Calendar client from middleware
        const calendar = google.calendar({ version: 'v3', auth: req.googleAuth });

        // Format ingredients and steps for the description
        const ingredientsList = reminder.meal.ingredients
            .map(i => `- ${i.name}`)
            .join('\n');

        const stepsList = reminder.meal.preparationSteps
            .map((step, i) => `${i + 1}. ${step.instruction}`)
            .join('\n');

        // Prepare event details with all meal information
        const event = {
            summary: `Meal Reminder: ${reminder.meal.name}`,
            description: `Time to prepare: ${reminder.meal.name}\n\n` +
                `Ingredients:\n${ingredientsList}\n\n` +
                `Steps:\n${stepsList}`,
            start: {
                dateTime: reminder.reminderTime,
                timeZone: 'UTC'
            },
            end: {
                dateTime: moment(reminder.reminderTime)
                    .add(1, 'hour')
                    .toISOString(),
                timeZone: 'UTC'
            },
            reminders: {
                useDefault: false,
                overrides: [
                    { method: 'email', minutes: 30 },
                    { method: 'popup', minutes: 15 }
                ]
            },
            attendees: [{ email: reminder.user.email }]
        };

        // Insert the event
        const response = await calendar.events.insert({
            calendarId: 'primary',
            resource: event,
            sendUpdates: 'all'
        });

        // Update reminder with calendar event ID
        reminder.calendarEventId = response.data.id;
        await reminder.save();

        res.status(StatusCodes.OK).json({
            message: 'Successfully synced with Google Calendar',
            eventLink: response.data.htmlLink,
            reminder
        });

    } catch (error) {
        console.error('Calendar sync error:', error);
        res.status(StatusCodes.INTERNAL_SERVER_ERROR)
            .json({
                message: 'Failed to sync with Google Calendar',
                error: error.message || 'Unknown error occurred'
            });
    }
};

// @desc    Get user reminders
// @route   GET /api/reminders
export const getUserReminders = async (req, res) => {
    const userId = req.user.userId;

    try {
        const reminders = await Reminder.find({ user: userId }).populate('meal');
        res.status(StatusCodes.OK).json({ reminders, count: reminders.length });
    } catch (error) {
        res
            .status(StatusCodes.INTERNAL_SERVER_ERROR)
            .json({ message: error.message });
    }
};

// @desc    Update reminder
// @route   PUT /api/reminders/:id
export const updateReminder = async (req, res) => {
    const { id } = req.params;
    const {
        reminderTime,
        notificationMethod,
        isRecurring,
        recurringFrequency,
        note,
    } = req.body;

    try {
        const reminder = await Reminder.findById(id);
        if (!reminder) {
            return res
                .status(StatusCodes.NOT_FOUND)
                .json({ message: 'Reminder not found' });
        }

        reminder.reminderTime = reminderTime || reminder.reminderTime;
        reminder.notificationMethod =
            notificationMethod || reminder.notificationMethod;
        reminder.isRecurring =
            isRecurring !== undefined ? isRecurring : reminder.isRecurring;
        reminder.recurringFrequency =
            recurringFrequency || reminder.recurringFrequency;
        reminder.note = note !== undefined ? note : reminder.note;
        //reminder.healthGoals = healthGoals || reminder.healthGoals;

        await reminder.save();

        // Populate meal so the frontend keeps the full meal object (not just an ID)
        await reminder.populate('meal');

        // Reschedule so the notification fires at the updated time
        scheduleIndividualReminder(reminder);

        res.status(StatusCodes.OK).json({ reminder });
    } catch (error) {
        res
            .status(StatusCodes.INTERNAL_SERVER_ERROR)
            .json({ message: error.message });
    }
};

// @desc    Delete reminder
// @route   DELETE /api/reminders/:id  
export const deleteReminder = async (req, res) => {
    const { id } = req.params;

    try {
        const reminder = await Reminder.findById(id);
        if (!reminder) {
            return res.status(StatusCodes.NOT_FOUND).json({ message: 'Reminder not found' });
        }

        await reminder.deleteOne();
        res.status(StatusCodes.OK).json({ message: 'Reminder deleted successfully' });
    } catch (error) {
        res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: error.message });
    }
};

