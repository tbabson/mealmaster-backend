import mongoose from 'mongoose';

const ReminderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false,
    },
    meal: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Meal',
      required: true,
    },
    reminderTime: {
      type: Date,
      required: [true, 'Reminder time is required'],
    },
    notificationMethod: {
      type: String,
      enum: ['email', 'push', 'calendar'],
      required: [true, 'Notification method is required'],
    },
    isRecurring: {
      type: Boolean,
      default: false,
    },
    recurringFrequency: {
      type: String,
      enum: ['daily', 'weekly', 'monthly'],
    },
    subscription: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subscription',
      required: function () {
        return this.notificationMethod === 'push';
      }
    },
    note: {
      type: String,
      maxlength: [500, 'Note cannot be more than 500 characters'],
      default: '',
    },
    notified: {
      type: Boolean,
      default: false,
    },
    // New Google Calendar specific fields
    calendarEventId: {
      type: String,
      sparse: true, // Allow null/undefined values
      description: 'Google Calendar event ID for synced reminders'
    },
    calendarSyncStatus: {
      type: String,
      enum: ['pending', 'synced', 'failed', 'not_applicable'],
      default: 'not_applicable'
    },
    calendarEventLink: {
      type: String,
      sparse: true,
      description: 'Direct link to the Google Calendar event'
    },
    lastSyncedAt: {
      type: Date,
      description: 'Timestamp of last successful Google Calendar sync'
    }
  },
  { timestamps: true }
);

// Index for efficient queries on calendar-related fields
ReminderSchema.index({ calendarEventId: 1 });
ReminderSchema.index({ calendarSyncStatus: 1 });

export default mongoose.model('Reminder', ReminderSchema);
