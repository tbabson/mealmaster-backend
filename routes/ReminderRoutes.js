import express from 'express';
import { createReminder, sendPushNotification, savePushSubscription, syncWithCalendar, getUserReminders, updateReminder, getSingleUserReminders, deleteReminder } from '../controllers/ReminderController.js';
import {
    authenticateUser,
    authorizePermissions,
} from '../middleware/authMiddleware.js';
import { authenticateGoogle } from '../middleware/googleAuthMiddleware.js';

const router = express.Router();

// Create a new reminder
router.post('/', authenticateUser, createReminder);

// Send push notification
router.post('/send-push/:id', authenticateUser, sendPushNotification);

// Save push subscription
router.post('/subscribe', authenticateUser, savePushSubscription);

// Sync reminder with calendar (with Google authentication)
router.post('/calendar-sync/:id', authenticateUser, authenticateGoogle, syncWithCalendar);

// Get all user reminders
router.get('/', authenticateUser, authorizePermissions('admin'), getUserReminders);

// Get reminders for single user
router.get('/user', authenticateUser, getSingleUserReminders);

// Update a reminder
router.patch('/:id', authenticateUser, updateReminder);

// Delete a reminder
router.delete('/:id', authenticateUser, deleteReminder);

export default router;
