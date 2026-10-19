import schedule from 'node-schedule';
import Reminder from '../models/ReminderModel.js';
import { sendEmail } from '../utils/transporter.js';
import moment from 'moment-timezone';
import { google } from 'googleapis';
import webPush from 'web-push';
import Subscription from '../models/SubscriptionModel.js';
import User from '../models/UserSchema.js';

// A reminder found overdue at boot (missed during a restart or sleep) is still
// sent if it is at most this late; older one-off reminders are skipped and
// recurring ones jump to their next future occurrence.
const MISSED_REMINDER_GRACE_MS =
  (Number(process.env.MISSED_REMINDER_GRACE_MINUTES) || 60) * 60 * 1000;

// reminderId -> node-schedule Job, so updates and deletes can cancel the old job
const jobs = new Map();

// Everything the email, push and calendar senders read from a reminder
const REMINDER_POPULATE = [
  {
    path: 'meal',
    select: 'name image ingredients preparationSteps',
    populate: [
      { path: 'ingredients', select: 'name quantity unit' },
      { path: 'preparationSteps', select: 'description skillLevel steps' },
    ],
  },
  { path: 'user', select: 'email fullName' },
];

// ----- Google API Setup -----

// A fresh client per call: a shared module-level client with per-user
// credentials let concurrent reminders write to the wrong user's calendar.
const getCalendarClientForUser = async (userId) => {
  const user = await User.findById(userId).select('+googleRefreshToken');
  if (!user || !user.googleRefreshToken) {
    throw new Error('No refresh token found for user');
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  oauth2Client.setCredentials({ refresh_token: user.googleRefreshToken });
  return oauth2Client;
};

// ----- Helper Functions for Meal Preparation -----

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const hasValidPreparationSteps = (meal) => {
  return meal.preparationSteps &&
    Array.isArray(meal.preparationSteps) &&
    meal.preparationSteps.length > 0 &&
    meal.preparationSteps[0].steps &&
    Array.isArray(meal.preparationSteps[0].steps) &&
    meal.preparationSteps[0].steps.length > 0;
};

export const formatPreparationSteps = (meal) => {
  if (!hasValidPreparationSteps(meal)) {
    return 'No preparation steps provided.';
  }

  return meal.preparationSteps[0].steps.map(({ stepNumber, instruction, duration }) =>
    `Step ${stepNumber}: ${instruction} (Duration: ${duration || 'N/A'})`
  ).join('\n');
};

// Google Calendar event body for a reminder whose meal is populated per REMINDER_POPULATE
export const buildCalendarEvent = (reminder) => {
  const ingredientsList = (reminder.meal.ingredients || [])
    .map(i => `- ${i.name}`)
    .join('\n');

  return {
    summary: `Meal Reminder: ${reminder.meal.name}`,
    description: `Time to prepare: ${reminder.meal.name}\n\n` +
      `Ingredients:\n${ingredientsList}\n\n` +
      `Steps:\n${formatPreparationSteps(reminder.meal)}`,
    start: {
      dateTime: moment(reminder.reminderTime).toISOString(),
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
  };
};

export const insertCalendarEvent = async (reminder, event = buildCalendarEvent(reminder)) => {
  const auth = await getCalendarClientForUser(reminder.user._id);
  const calendar = google.calendar({ version: 'v3', auth });
  const response = await calendar.events.insert({
    calendarId: 'primary',
    resource: event,
    sendUpdates: 'all'
  });
  return response.data;
};

// ----- Notification Functions -----

const sendEmailReminder = async (reminder) => {
  try {
    const { meal, user, reminderTime, timezone } = reminder;
    const tz = timezone || process.env.USER_TIMEZONE || 'Africa/Lagos';
    const formattedTime = moment(reminderTime).tz(tz).format('dddd, MMMM Do YYYY [at] h:mm A (z)');

    const ingredientNames = meal.ingredients.map(({ name }) => name).join(', ');
    const textSteps = formatPreparationSteps(meal);
    const appUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

    const mealName = escapeHtml(meal.name);
    const userName = escapeHtml(user.fullName);

    // ── Ingredient rows ──────────────────────────────────────────────────────
    const ingredientRows = meal.ingredients.map(({ name, quantity, unit }) => `
      <tr>
        <td style="padding:8px 0;border-bottom:1px solid #f1f5f9;vertical-align:middle;">
          <table cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="width:8px;height:8px;background:#28842b;border-radius:50%;vertical-align:middle;"></td>
              <td style="padding-left:10px;font-size:14px;color:#334155;font-weight:500;text-transform:capitalize;vertical-align:middle;">
                ${escapeHtml(name)}${quantity ? `<span style="color:#94a3b8;font-weight:400;"> &mdash; ${escapeHtml(quantity)}${unit ? ' ' + escapeHtml(unit) : ''}</span>` : ''}
              </td>
            </tr>
          </table>
        </td>
      </tr>`).join('');

    // ── Preparation step rows ────────────────────────────────────────────────
    const stepRows = hasValidPreparationSteps(meal)
      ? meal.preparationSteps[0].steps.map(({ stepNumber, instruction, duration }) => `
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid #f1f5f9;vertical-align:top;">
            <table cellpadding="0" cellspacing="0" border="0" width="100%">
              <tr>
                <td style="width:28px;vertical-align:top;padding-top:2px;">
                  <div style="width:26px;height:26px;background:#ff5722;border-radius:50%;text-align:center;line-height:26px;font-size:11px;font-weight:800;color:#fff;">${escapeHtml(stepNumber)}</div>
                </td>
                <td style="padding-left:12px;font-size:14px;color:#334155;line-height:1.6;vertical-align:top;">
                  ${escapeHtml(instruction)}
                  ${duration ? `<div style="margin-top:3px;font-size:12px;color:#94a3b8;">&#9201; ${escapeHtml(duration)}</div>` : ''}
                </td>
              </tr>
            </table>
          </td>
        </tr>`).join('')
      : `<tr><td style="font-size:14px;color:#94a3b8;padding:8px 0;">No preparation steps provided.</td></tr>`;

    const mailOptions = {
      from: { email: process.env.BREVO_SENDER_EMAIL, name: 'MealMaster' },
      to: [{ email: user.email, name: user.fullName }],
      replyTo: process.env.BREVO_REPLY_TO || process.env.BREVO_SENDER_EMAIL,
      subject: `Reminder: Time to prepare ${meal.name}!`,

      // ── Plain-text fallback ──────────────────────────────────────────────
      text: `Hi ${user.fullName},

Your meal reminder is here!

Meal: ${meal.name}
Scheduled: ${formattedTime}

Ingredients: ${ingredientNames}

${textSteps}

View your reminders: ${appUrl}/reminders

---
You're receiving this because you set a meal reminder on MealMaster.
Please do not reply to this email.`,

      // ── HTML email ───────────────────────────────────────────────────────
      html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>Meal Reminder — MealMaster</title>
</head>
<body style="margin:0;padding:0;background:#f0f4f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f0f4f0;padding:32px 16px;">
    <tr>
      <td align="center">

        <!-- ── Card ─────────────────────────────────────────── -->
        <table width="600" cellpadding="0" cellspacing="0" border="0"
               style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.10);">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#143315 0%,#0f2210 100%);padding:28px 40px;text-align:center;">
              <p style="margin:0;font-size:24px;font-weight:800;color:#ffffff;letter-spacing:-0.3px;">&#127869; MealMaster</p>
              <p style="margin:6px 0 0;font-size:11px;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:0.12em;">Meal Reminder</p>
            </td>
          </tr>

          <!-- Meal image -->
          ${meal.image ? `
          <tr>
            <td style="padding:0;line-height:0;">
              <img src="${escapeHtml(meal.image)}" alt="${mealName}" width="600"
                   style="width:100%;max-width:600px;height:220px;object-fit:cover;display:block;">
            </td>
          </tr>` : ''}

          <!-- Greeting -->
          <tr>
            <td style="padding:32px 40px 0;">
              <p style="margin:0 0 6px;font-size:12px;color:#ff5722;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;">&#9200; Time to cook!</p>
              <h1 style="margin:0 0 14px;font-size:26px;font-weight:800;color:#143315;line-height:1.25;">${mealName}</h1>
              <p style="margin:0;font-size:15px;color:#475569;line-height:1.7;">
                Hi <strong style="color:#143315;">${userName}</strong> &#128075;,<br>
                Your meal reminder is here. Everything you need to prepare
                <strong style="color:#143315;">${mealName}</strong> is below — happy cooking!
              </p>
            </td>
          </tr>

          <!-- Scheduled time pill -->
          <tr>
            <td style="padding:20px 40px 0;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="background:#fff8f0;border:2px solid #ff5722;border-radius:10px;padding:14px 20px;">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td>
                          <p style="margin:0;font-size:11px;color:#ff5722;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;">Scheduled for</p>
                          <p style="margin:5px 0 0;font-size:16px;font-weight:700;color:#143315;">${escapeHtml(formattedTime)}</p>
                        </td>
                        <td align="right" style="font-size:30px;vertical-align:middle;">&#128336;</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding:28px 40px 0;">
              <hr style="border:0;border-top:1px solid #f1f5f9;margin:0;">
            </td>
          </tr>

          <!-- Ingredients -->
          <tr>
            <td style="padding:24px 40px 0;">
              <p style="margin:0 0 14px;font-size:12px;color:#28842b;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;">&#129382; Ingredients</p>
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                ${ingredientRows}
              </table>
            </td>
          </tr>

          <!-- Preparation Steps -->
          <tr>
            <td style="padding:28px 40px 0;">
              <p style="margin:0 0 14px;font-size:12px;color:#ff5722;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;">&#128203; Preparation Steps</p>
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                ${stepRows}
              </table>
            </td>
          </tr>

          <!-- CTA buttons -->
          <tr>
            <td style="padding:32px 40px 36px;text-align:center;">
              <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
                <tr>
                  <td style="padding-right:12px;">
                    <a href="${appUrl}/meals/${meal._id}"
                       style="display:inline-block;background:#ff5722;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:14px 32px;border-radius:8px;letter-spacing:0.02em;">
                      Order Meal &rarr;
                    </a>
                  </td>
                  <td>
                    <a href="${appUrl}/reminders"
                       style="display:inline-block;background:#ffffff;color:#28842b;text-decoration:none;font-size:15px;font-weight:700;padding:13px 32px;border-radius:8px;letter-spacing:0.02em;border:2px solid #28842b;">
                      View Reminders
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc;padding:20px 40px;border-top:1px solid #f1f5f9;">
              <p style="margin:0;font-size:12px;color:#94a3b8;text-align:center;line-height:1.7;">
                You're receiving this because you set a meal reminder on MealMaster.<br>
                This is an automated message &mdash; please do not reply to this email.
              </p>
            </td>
          </tr>

        </table>
        <!-- ── End card ────────────────────────────────────────── -->

      </td>
    </tr>
  </table>

</body>
</html>`
    };

    await sendEmail(mailOptions);
    return true;
  } catch (error) {
    console.error('Error sending email reminder:', error);
    if (error.response) {
      console.error('Brevo response failed:', error.response);
    }
    return false;
  }
};

const sendPushNotification = async (reminder) => {
  const subscriptionId = reminder.subscription?._id || reminder.subscription;
  try {
    const subscription = await Subscription.findById(subscriptionId).lean();
    if (!subscription) {
      console.error('No subscription found for the reminder');
      return false;
    }

    if (!subscription.keys || !subscription.keys.auth || !subscription.keys.p256dh) {
      console.error('Subscription missing required keys');
      return false;
    }

    const payload = JSON.stringify({
      title: `Meal Reminder: ${reminder.meal.name}`,
      body: `Hello! It's time to prepare your meal: ${reminder.meal.name}. Check the details in your app.`,
      icon: reminder.meal.image || '/icons/icon-192.png',
      badge: '/icons/badge-72.png',
      image: reminder.meal.image,
      data: {
        mealId: reminder.meal._id,
        url: `/meals/${reminder.meal._id}`,
        imageSize: {
          width: 150,
          height: 150
        }
      },
      vibrate: [200, 100, 200],
    });

    const pushSubscription = {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth
      }
    };

    await webPush.sendNotification(pushSubscription, payload);
    console.log('Push notification sent successfully');
    return true;
  } catch (error) {
    // 404/410 mean the browser threw the subscription away — stop pushing to it
    if (error.statusCode === 404 || error.statusCode === 410) {
      console.log(`Pruning expired push subscription ${subscriptionId}`);
      await Subscription.findByIdAndDelete(subscriptionId);
      await Reminder.findByIdAndUpdate(reminder._id, { subscription: null });
      return false;
    }
    console.error('Error sending push notification:', error);
    return false;
  }
};

const syncWithCalendar = async (reminder) => {
  try {
    await insertCalendarEvent(reminder);
    return true;
  } catch (error) {
    console.error('Error syncing with calendar:', error);
    return false;
  }
};

// ----- Reminder Scheduling Functions -----

const getNextReminderTime = (currentReminderTime, frequency) => {
  const nextTime = new Date(currentReminderTime);
  switch (frequency) {
    case 'daily':
      nextTime.setDate(nextTime.getDate() + 1);
      break;
    case 'weekly':
      nextTime.setDate(nextTime.getDate() + 7);
      break;
    case 'monthly':
      nextTime.setMonth(nextTime.getMonth() + 1);
      break;
    default:
      return null;
  }
  return nextTime;
};

// First occurrence strictly after `after`, stepping from `from` by `frequency`
export const nextOccurrenceAfter = (from, frequency, after = new Date()) => {
  let next = getNextReminderTime(from, frequency);
  while (next && next <= after) {
    next = getNextReminderTime(next, frequency);
  }
  return next;
};

const processReminder = async (reminderId, scheduledFor) => {
  try {
    // Atomically claim this occurrence. If the reminder was edited (time no
    // longer matches), deleted, or already sent by another instance, the
    // claim fails and this run is a no-op — no duplicate notifications.
    const reminder = await Reminder.findOneAndUpdate(
      { _id: reminderId, notified: false, reminderTime: scheduledFor },
      { $set: { notified: true } },
      { new: true }
    )
      .populate(REMINDER_POPULATE)
      .lean();

    if (!reminder) return false;

    if (!reminder.meal || !reminder.user) {
      console.error(`Reminder ${reminderId} references a missing meal or user; skipping`);
      return false;
    }

    let notificationSent = false;
    switch (reminder.notificationMethod) {
      case 'email':
        notificationSent = await sendEmailReminder(reminder);
        break;
      case 'push':
        notificationSent = await sendPushNotification(reminder);
        break;
      case 'calendar':
        notificationSent = await syncWithCalendar(reminder);
        break;
      default:
        console.log(`Unknown notification method: ${reminder.notificationMethod}`);
    }

    if (!notificationSent) {
      console.error(`Reminder ${reminderId} could not be delivered via ${reminder.notificationMethod}`);
    }

    // Recurring reminders continue even if this one delivery failed
    if (reminder.isRecurring && reminder.recurringFrequency) {
      const nextReminderTime = nextOccurrenceAfter(scheduledFor, reminder.recurringFrequency);
      if (nextReminderTime) {
        const updated = await Reminder.findOneAndUpdate(
          { _id: reminderId, reminderTime: scheduledFor },
          { $set: { reminderTime: nextReminderTime, notified: false } },
          { new: true }
        );
        if (updated) scheduleIndividualReminder(updated);
      }
    }

    return notificationSent;
  } catch (error) {
    console.error('Error processing reminder:', error);
    return false;
  }
};

export const cancelReminderJob = (reminderId) => {
  const key = String(reminderId);
  const job = jobs.get(key);
  if (job) {
    job.cancel();
    jobs.delete(key);
  }
};

// (Re)schedule a reminder. Always replaces any job already registered for it,
// so calling this after an update never leaves the old time armed.
export const scheduleIndividualReminder = (reminder) => {
  const key = String(reminder._id);
  cancelReminderJob(key);

  if (reminder.notified) return null;

  const scheduledFor = new Date(reminder.reminderTime);

  // node-schedule silently ignores dates in the past — run those now instead
  if (scheduledFor.getTime() <= Date.now()) {
    setImmediate(() => processReminder(key, scheduledFor));
    return null;
  }

  const job = schedule.scheduleJob(scheduledFor, () => {
    jobs.delete(key);
    processReminder(key, scheduledFor);
  });
  if (job) jobs.set(key, job);
  return job;
};

export const initializeReminderSystem = async () => {
  try {
    console.log('Initializing reminder system...');
    const reminders = await Reminder.find({ notified: false });
    const now = Date.now();
    let missed = 0;

    for (const reminder of reminders) {
      const overdueBy = now - new Date(reminder.reminderTime).getTime();

      if (overdueBy <= MISSED_REMINDER_GRACE_MS) {
        // Future, or only slightly late — schedule (late ones fire immediately)
        scheduleIndividualReminder(reminder);
      } else if (reminder.isRecurring && reminder.recurringFrequency) {
        // Long overdue recurring reminder: skip the stale occurrences
        reminder.reminderTime = nextOccurrenceAfter(reminder.reminderTime, reminder.recurringFrequency);
        await reminder.save();
        scheduleIndividualReminder(reminder);
      } else {
        // Long overdue one-off reminder: too late to be useful
        reminder.notified = true;
        await reminder.save();
        missed++;
      }
    }

    console.log(`Scheduled ${reminders.length - missed} reminder(s); skipped ${missed} missed one-off reminder(s).`);
  } catch (error) {
    console.error('Error initializing reminder system:', error.message);
  }
};

export { REMINDER_POPULATE };
