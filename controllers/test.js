// // service-worker.js

// self.addEventListener('push', function (event) {
//   const data = event.data.json();

//   const options = {
//     body: data.body,
//     icon: 'images/icon.png', // Replace with your icon
//     badge: 'images/badge.png', // Replace with your badge image
//   };

//   event.waitUntil(
//     self.registration.showNotification(data.title, options)
//   );
// });

// //Request User Permission

// if ('serviceWorker' in navigator && 'PushManager' in window) {
//   navigator.serviceWorker.register('/service-worker.js')
//     .then(function (registration) {
//       console.log('Service Worker registered with scope:', registration.scope);

//       return Notification.requestPermission();
//     })
//     .then(function (permission) {
//       if (permission === 'granted') {
//         console.log('Notification permission granted.');

//         // Subscribe the user to push notifications
//         return subscribeUserToPush(registration);
//       } else {
//         console.error('Unable to get permission to notify.');
//       }
//     });
// }

// //Subscribe to Push Notifications

// function subscribeUserToPush(registration) {
//   const applicationServerKey = urlB64ToUint8Array('<Your Public VAPID Key>'); // Replace with your VAPID public key
//   return registration.pushManager.subscribe({
//     userVisibleOnly: true,
//     applicationServerKey: applicationServerKey,
//   }).then(function (subscription) {
//     console.log('User is subscribed:', subscription);

//     // You can now send the subscription object to your server
//     // subscription.endpoint contains the endpoint
//     // subscription.keys.p256dh contains the public key
//     // subscription.keys.auth contains the auth secret
//     saveSubscriptionToServer(subscription);
//   }).catch(function (err) {
//     console.log('Failed to subscribe the user: ', err);
//   });
// }

// // Convert URL-safe base64 string to Uint8Array
// function urlB64ToUint8Array(base64String) {
//   const padding = '='.repeat((4 - base64String.length % 4) % 4);
//   const base64 = (base64String + padding)
//     .replace(/-/g, '+')
//     .replace(/_/g, '/');

//   const rawData = window.atob(base64);
//   return Uint8Array.from([...rawData].map(char => char.charCodeAt(0)));
// }

////Define the Subscription Model

import mongoose from 'mongoose';

const subscriptionSchema = new mongoose.Schema({
  endpoint: {
    type: String,
    required: true
  },
  p256dh: {
    type: String,
    required: true
  },
  auth: {
    type: String,
    required: true
  }
}, { timestamps: true });

const Subscription = mongoose.model('Subscription', subscriptionSchema);

export default Subscription;


////Set Up the Service Layer

import Subscription from '../models/subscription';
import webPush from 'web-push';

// Configure VAPID keys
const vapidKeys = {
  publicKey: process.env.VAPID_PUBLIC_KEY,
  privateKey: process.env.VAPID_PRIVATE_KEY
};

webPush.setVapidDetails(
  'mailto:your-email@example.com',
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

export const saveSubscription = async (subscription) => {
  await Subscription.create({
    endpoint: subscription.endpoint,
    p256dh: subscription.keys.p256dh,
    auth: subscription.keys.auth
  });
};

export const sendNotification = async (title, body, image) => {
  const subscriptions = await Subscription.find();
  subscriptions.forEach((subscription) => {
    const sub = {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.p256dh,
        auth: subscription.auth
      }
    };
    const payload = JSON.stringify({
      notification: {
        title,
        body,
        image,
      },
    });
    webPush.sendNotification(sub, payload)
      .catch(error => console.error('Error sending notification:', error));
  });
};


////Create API Routes and Controllers

const { saveSubscription, sendNotification } = require('../../services/subscriptionService');

exports.subscribe = async (req, res) => {
  try {
    const subscription = req.body;
    await saveSubscription(subscription);
    res.status(201).json({ message: 'Subscription added successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to subscribe.' });
  }
};

exports.pushNotification = async (req, res) => {
  try {
    const { title, body, image } = req.body;
    await sendNotification(title, body, image);
    res.status(200).json({ message: 'Notification sent successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to send notification.' });
  }
};

/////Create src/api/routes/subscriptionRoutes.ts to define the API routes.


const { Router } = require('express');
const { subscribe, pushNotification } = require('../controllers/subscriptionController');

const router = Router();

router.post('/subscribe', subscribe);
router.post('/push', pushNotification);

module.exports = router;




import cron from 'node-cron';
import moment from 'moment-timezone';
import Reminder from '../models/ReminderModel.js';
import {
  sendEmailReminder,
  sendPushNotification,
  syncWithCalendar,
} from './ReminderController.js';
import { getNextReminderTime } from './utils/timeUtils.js'; // Assuming this helper calculates recurring times

// Schedule the cron job to run every minute, adjusting for each user's local time
cron.schedule('* * * * *', async () => {
  try {
    const now = new Date();

    // Fetch reminders due within the next minute that haven't been notified
    const reminders = await Reminder.find({
      notified: false,
      reminderTime: { $lte: now },
    }).populate('user');

    for (const reminder of reminders) {
      const userTimezone = reminder.timezone || 'UTC'; // Default to UTC if timezone not set
      const reminderLocalTime = moment(reminder.reminderTime).tz(userTimezone).format('YYYY-MM-DD HH:mm:ss');

      // Compare current local time to the reminder time in the user’s timezone
      const nowLocalTime = moment().tz(userTimezone).format('YYYY-MM-DD HH:mm:ss');
      if (nowLocalTime >= reminderLocalTime) {
        console.log(`Cron triggered for user at local time: ${nowLocalTime} for reminder: ${reminder._id}`);

        // Send appropriate notification
        if (reminder.notificationMethod === 'email') {
          await sendEmailReminder({ params: { id: reminder._id } }, { status: () => ({ json: () => { } }) });
        } else if (reminder.notificationMethod === 'push') {
          await sendPushNotification({ params: { id: reminder._id } }, { status: () => ({ json: () => { } }) });
        } else if (reminder.notificationMethod === 'calendar') {
          await syncWithCalendar({ params: { id: reminder._id } }, { status: () => ({ json: () => { } }) });
        }

        // Update for recurring reminders if needed
        if (reminder.isRecurring && reminder.recurringFrequency) {
          reminder.reminderTime = getNextReminderTime(reminder.reminderTime, reminder.recurringFrequency);
        } else {
          reminder.notified = true; // Mark non-recurring reminders as notified
        }

        // Save changes
        await reminder.save();
      }
    }
  } catch (error) {
    console.error('Error processing reminders:', error);
  }
});



cron.schedule('* * * * *', async () => {
  const localTime = new Date().toLocaleString('en-US', { timeZone: 'Africa/Lagos' });
  console.log('Cron job triggered at', localTime);


  if (reminder.notificationMethod === 'email') {
    await sendEmailAndUpdateReminder(reminder);
  } else if (reminder.notificationMethod === 'push') {
    // Add logic to send push notification if needed
  } else if (reminder.notificationMethod === 'calendar') {
    // Add logic to sync with calendar if needed
  }






  import cron from 'node-cron';
  import Reminder from '../models/ReminderModel.js';
  import { transporter } from './emailService.js'; // Ensure this is imported
  import {
    sendEmailReminder,
    sendPushNotification,
    syncWithCalendar,
  } from './ReminderController.js';
  import { StatusCodes } from 'http-status-codes';

  // Function to calculate the next reminder time based on frequency
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
        return null; // For non-recurring reminders
    }

    return nextTime;
  };

  // Automatically sends an email and updates the reminder schema after sending
  const sendEmailAndUpdateReminder = async (reminder) => {
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: reminder.user.email,
      subject: `Meal Reminder: ${reminder.meal.name}`,
      text: `Hello ${reminder.user.fullName}, just a reminder to prepare your meal: ${reminder.meal.name} at ${reminder.reminderTime}.`,
    };

    try {
      await transporter.sendMail(mailOptions);
      console.log(`Email sent for reminder ID: ${reminder._id}`);
      reminder.notified = true; // Mark as notified after successful email
      await reminder.save();
    } catch (error) {
      console.error(`Error sending email for reminder ID ${reminder._id}:`, error);
    }
  };

  // Function to check for reminders that are due and trigger notifications
  export const scheduleReminders = () => {
    cron.schedule('* * * * *', async () => {
      try {
        const now = new Date();

        // Find reminders that are due and haven't been notified yet
        const dueReminders = await Reminder.find({
          notified: false,
        }).populate(['user', 'meal']);

        // Process each due reminder
        for (const reminder of dueReminders) {
          const userTimezone = reminder.timezone || 'UTC'; // Default to UTC if timezone not set

          // Get the reminder time in the user's local timezone
          const reminderLocalTime = new Date(reminder.reminderTime).toLocaleString('en-US', { timeZone: userTimezone });
          const reminderDate = new Date(reminderLocalTime); // Convert back to Date for comparison

          // Compare the reminder time with the current time in the user's timezone
          if (reminderDate <= now) {
            // Send notifications based on the method
            if (reminder.notificationMethod === 'email') {
              await sendEmailAndUpdateReminder(reminder);
            } else if (reminder.notificationMethod === 'push') {
              await sendPushNotification({ params: { id: reminder._id } }, { status: () => ({ json: () => { } }) });
            } else if (reminder.notificationMethod === 'calendar') {
              await syncWithCalendar({ params: { id: reminder._id } }, { status: () => ({ json: () => { } }) });
            }

            // Update next reminder time if it's a recurring reminder
            if (reminder.isRecurring && reminder.recurringFrequency) {
              const nextReminderTime = getNextReminderTime(reminder.reminderTime, reminder.recurringFrequency);
              reminder.reminderTime = nextReminderTime || reminder.reminderTime;
              reminder.isRecurring = !!nextReminderTime; // Stop recurring if next time is invalid
            }

            // Save updated reminder
            await reminder.save();
          }
        }
      } catch (error) {
        console.error('Error processing reminders:', error);
      }
    });
  };




  import cron from 'node-cron';
  import Reminder from '../models/ReminderModel.js';
  import {
    sendEmailReminder,
    sendPushNotification,
    syncWithCalendar,
  } from './ReminderController.js';
  import { StatusCodes } from 'http-status-codes';

  // Function to calculate the next reminder time based on frequency
  // const getNextReminderTime = (currentReminderTime, frequency) => {
  //   const nextTime = new Date(currentReminderTime);

  //   switch (frequency) {
  //     case 'daily':
  //       nextTime.setDate(nextTime.getDate() + 1);
  //       break;
  //     case 'weekly':
  //       nextTime.setDate(nextTime.getDate() + 7);
  //       break;
  //     case 'monthly':
  //       nextTime.setMonth(nextTime.getMonth() + 1);
  //       break;
  //     // Add more cases for other frequencies if needed
  //     default:
  //       return null; // For non-recurring reminders
  //   }

  //   return nextTime;
  // };

  // // Function to check for reminders that are due and trigger notifications
  // export const scheduleReminders = () => {
  //   // Run every minute to check for upcoming reminders
  //   cron.schedule('* * * * *', async () => {
  //     try {
  //       const now = new Date();

  //       // Find reminders that are due for notification and haven't been notified yet
  //       const dueReminders = await Reminder.find({
  //         reminderTime: { $lte: new Date(new Date().getTime() + 60000) }, // 1-minute buffer
  //         notified: false,
  //       }).populate(['user', 'meal']);


  //       // Process each due reminder
  //       for (const reminder of dueReminders) {
  //         // Send the appropriate notification
  //         if (reminder.notificationMethod === 'email') {
  //           await sendEmailReminder({ params: { id: reminder._id } }, { status: () => ({ json: () => { } }) });
  //         } else if (reminder.notificationMethod === 'push') {
  //           await sendPushNotification(
  //             { params: { id: reminder._id } },
  //             { status: () => ({ json: () => {} }) }
  //           );
  //         } else if (reminder.notificationMethod === 'calendar') {
  //           await syncWithCalendar(
  //             { params: { id: reminder._id } },
  //             { status: () => ({ json: () => {} }) }
  //           );
  //         }

  //         // If recurring, update the reminderTime to the next occurrence
  //         if (reminder.isRecurring && reminder.recurringFrequency) {
  //           const nextReminderTime = getNextReminderTime(
  //             reminder.reminderTime,
  //             reminder.recurringFrequency
  //           );
  //           if (nextReminderTime) {
  //             reminder.reminderTime = nextReminderTime;
  //           } else {
  //             reminder.isRecurring = false; // Stop recurring if frequency is not recognized
  //           }
  //         } else {
  //           // If non-recurring, mark as notified
  //           reminder.notified = true;
  //         }

  //         // Save the updated reminder
  //         await reminder.save();
  //       }
  //     } catch (error) {
  //       console.error('Error processing reminders:', error);
  //     }
  //   });
  // };




  // Function to calculate the next reminder time based on frequency
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
      // Add more cases for other frequencies if needed
      default:
        return null; // For non-recurring reminders
    }

    return nextTime;
  };

  // Function to check for reminders that are due and trigger notifications
  export const scheduleReminders = () => {
    // Run every minute to check for upcoming reminders
    cron.schedule('* * * * *', async () => {
      try {
        const now = new Date();

        // Find reminders that are due for notification and haven't been notified yet
        const dueReminders = await Reminder.find({
          reminderTime: { $lte: new Date(new Date().getTime() + 60000) }, // 1-minute buffer
          notified: false,
        }).populate(['user', 'meal']);


        // Process each due reminder
        for (const reminder of dueReminders) {
          // Send the appropriate notification
          if (reminder.notificationMethod === 'email') {
            await sendEmailReminder({ params: { id: reminder._id } }, { status: () => ({ json: () => { } }) });
          } else if (reminder.notificationMethod === 'push') {
            await sendPushNotification(
              { params: { id: reminder._id } },
              { status: () => ({ json: () => { } }) }
            );
          } else if (reminder.notificationMethod === 'calendar') {
            await syncWithCalendar(
              { params: { id: reminder._id } },
              { status: () => ({ json: () => { } }) }
            );
          }

          // If recurring, update the reminderTime to the next occurrence
          if (reminder.isRecurring && reminder.recurringFrequency) {
            const nextReminderTime = getNextReminderTime(
              reminder.reminderTime,
              reminder.recurringFrequency
            );
            if (nextReminderTime) {
              reminder.reminderTime = nextReminderTime;
            } else {
              reminder.isRecurring = false; // Stop recurring if frequency is not recognized
            }
          } else {
            // If non-recurring, mark as notified
            reminder.notified = true;
          }

          // Save the updated reminder
          await reminder.save();
        }
      } catch (error) {
        console.error('Error processing reminders:', error);
      }
    });
  }; // Send email reminder
  router.post('/reminders/send-email/:id', authenticateUser, sendEmailReminder);





  import { google } from 'googleapis';
  import fs from 'fs';

  // Load client secrets from a local file
  const CREDENTIALS_PATH = 'path/to/credentials.json'; // Path to Google API credentials file
  const TOKEN_PATH = 'path/to/token.json'; // Path where OAuth tokens will be saved

  // Set up OAuth2 client
  const authClient = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  // Load tokens if they exist
  const loadSavedToken = () => {
    try {
      const token = fs.readFileSync(TOKEN_PATH, 'utf-8');
      authClient.setCredentials(JSON.parse(token));
    } catch (err) {
      console.error('Error loading token:', err);
    }
  };

  // Save new tokens to disk
  const saveToken = (token) => {
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(token));
    console.log('Token stored to', TOKEN_PATH);
  };

  // Function to authenticate with Google Calendar API
  const authenticateGoogleAPI = async () => {
    const authUrl = authClient.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/calendar', 'https://www.googleapis.com/auth/calendar/events'],
    });
    console.log('Authorize this app by visiting this URL:', authUrl);

    // Exchange code for tokens (if necessary)
    authClient.getToken(authCode, (err, token) => {
      if (err) {
        console.error('Error retrieving access token', err);
        return;
      }
      authClient.setCredentials(token);
      saveToken(token);
    });
  };

  // Function to add an event to Google Calendar
  const syncWithCalendar = async (reminder) => {
    try {
      // Authenticate or use saved token
      loadSavedToken();

      const calendar = google.calendar({ version: 'v3', auth: authClient });

      // Calendar event details
      const event = {
        summary: `Meal Reminder: ${reminder.meal.name}`,
        description: `It's time to prepare your meal: ${reminder.meal.name}`,
        start: {
          dateTime: reminder.reminderTime.toISOString(),
          timeZone: 'UTC',
        },
        end: {
          dateTime: new Date(new Date(reminder.reminderTime).getTime() + 60 * 60 * 1000).toISOString(), // 1-hour duration
          timeZone: 'UTC',
        },
      };

      // Insert the event into the calendar
      const calendarEvent = await calendar.events.insert({
        calendarId: 'primary', // Main user calendar
        resource: event,
      });

      console.log(`Calendar synced for reminder ${reminder._id}: Event ID: ${calendarEvent.data.id}`);
      return true;

    } catch (error) {
      console.error('Error syncing with calendar:', error);
      return false;
    }
  };



  //////  GOOGLE SYNC CALENDAR //////
  import { google } from 'googleapis';
  import { StatusCodes } from 'http-status-codes';

  // Google Calendar API setup
  const calendar = google.calendar({ version: 'v3' });
  const calendarId = process.env.GOOGLE_CALENDAR_ID;

  // Function to sync with Google Calendar
  const syncWithCalendar = async (reminder) => {
    try {
      const event = {
        summary: `Meal Reminder: ${reminder.meal.name}`,
        description: `Hello ${reminder.user.fullName}, just a reminder to prepare your meal: ${reminder.meal.name} at ${reminder.reminderTime}.`,
        start: {
          dateTime: reminder.reminderTime.toISOString(),
        },
        end: {
          dateTime: new Date(reminder.reminderTime.getTime() + 60 * 60 * 1000).toISOString(), // 1 hour event
        },
      };

      await calendar.events.insert({
        calendarId: calendarId,
        resource: event,
      });

      console.log(`Calendar synced for reminder ${reminder._id}`);
      return true;
    } catch (error) {
      console.error('Error syncing with Google Calendar:', error);
      return false;
    }
  };

  //////  GOOGLE SYNC CALENDAR2 //////
  import cron from 'node-cron';
  import Reminder from '../models/ReminderModel.js';
  import { StatusCodes } from 'http-status-codes';
  import nodemailer from 'nodemailer';
  import { google } from 'googleapis';

  // Configure Google Calendar API
  const calendar = google.calendar({ version: 'v3' });
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n')
    },
    scopes: ['https://www.googleapis.com/auth/calendar']
  });

  // Function to sync with calendar
  const syncWithCalendar = async (reminder) => {
    try {
      // Set up the event details
      const event = {
        summary: `Meal Reminder: ${reminder.meal.name}`,
        description: `Hello ${reminder.user.fullName}, just a reminder to prepare your meal: ${reminder.meal.name} at ${reminder.reminderTime}.`,
        start: {
          dateTime: reminder.reminderTime.toISOString()
        },
        end: {
          dateTime: new Date(reminder.reminderTime.getTime() + 30 * 60000).toISOString() // 30-minute event
        }
      };

      // Create the calendar event
      await calendar.events.insert({
        auth: await auth.getClient(),
        calendarId: 'primary',
        resource: event
      });

      console.log(`Calendar synced for reminder ${reminder._id}`);
      return true;
    } catch (error) {
      console.error('Error syncing with calendar:', error);
      return false;
    }
  };





To get the `GOOGLE_CALENDAR_ID` for your Google Calendar, follow these steps:

  1. ** Create a Google Cloud Platform project **:
  - Go to the Google Cloud Console(https://console.cloud.google.com/).
    - Create a new project or select an existing one.

2. ** Enable the Google Calendar API **:
    - In the Google Cloud Console, navigate to the "APIs & Services" section.
   - Click on "Library" and search for "Google Calendar API".
   - Click on the "Google Calendar API" and then click "Enable" to enable the API for your project.

3. ** Set up OAuth credentials **:
  - In the "APIs & Services" section, go to the "Credentials" tab.
   - Click on "Create credentials" and select "OAuth client ID".
   - Choose the application type(e.g., "Desktop app" or "Web application") and provide the necessary information.
   - Once the OAuth client ID is created, make note of the "Client ID" and "Client secret".

4. ** Get the Calendar ID **:
  - Go to the Google Calendar web interface(https://calendar.google.com/).
    - Click on the calendar you want to use for your reminders.
   - Click on the three - dot menu next to the calendar and select "Settings and sharing".
   - Scroll down to the "Integrate calendar" section and copy the "Calendar ID" value.

5. ** Set the environment variables **:
  - In your application, set the following environment variables:
  - `GOOGLE_CALENDAR_ID`: The Calendar ID you copied in the previous step.
     - `GOOGLE_CLIENT_ID`: The Client ID you obtained in step 3.
    - `GOOGLE_CLIENT_SECRET`: The Client secret you obtained in step 3.

  Now, your application can use the `GOOGLE_CALENDAR_ID` environment variable to sync reminders with the specified Google Calendar.

Remember to also follow the steps to set up OAuth consent and configure the necessary scopes for your Google Cloud Platform project to allow your application to access the Google Calendar API.


    //////////////////////////////////////////////

    import { Link, useLoaderData } from "react-router-dom";
  import Wrapper from "../assets/wrappers/RecommendedMealsContainer";
  import { useState, useEffect } from "react";

  const RecommendedMealsContainer = () => {
    const { meals } = useLoaderData(); // meals is an array
    const [shuffledMeals, setShuffledMeals] = useState([]);
    const [mealType, setMealType] = useState("");

    // Function to determine meal type based on the time of day
    const getMealType = () => {
      const currentHour = new Date().getHours();
      if (currentHour >= 6 && currentHour < 12) return "Breakfast";
      if (currentHour >= 12 && currentHour < 17) return "Lunch";
      return "Dinner";
    };

    // Function to shuffle an array
    const shuffleArray = (array) => {
      return array.sort(() => Math.random() - 0.5);
    };

    useEffect(() => {
      // Get current meal type
      const type = getMealType();
      setMealType(type);

      // Filter meals based on meal type and recommendation status
      const filteredMeals = meals.meals.filter(
        (meal) => meal.isRecommended === true && meal.mealType === type
      );

      // Shuffle meals
      setShuffledMeals(shuffleArray(filteredMeals).slice(0, 5)); // Limit to 5 meals

      // Set an interval to reshuffle meals every 30 minutes
      const interval = setInterval(() => {
        setShuffledMeals(shuffleArray(filteredMeals).slice(0, 5)); // Limit to 5 meals
      }, 30 * 60 * 1000); // 30 minutes in milliseconds

      // Clear interval when component unmounts
      return () => clearInterval(interval);
    }, [meals]);

    if (!shuffledMeals || shuffledMeals.length === 0) {
      return <p>No recommended meals available for {mealType}</p>;
    }

    return (
      <Wrapper>
        <div className="recommended-meals-container">
          {/* <h3>Recommended {mealType} Meals</h3> */}
          {shuffledMeals.map((meal) => {
            const { _id, image, name, cuisine } = meal;
            return (
              <Link key={_id} to={`/meals/${_id}`} className="recommended-meal">
                <figure>
                  <img src={image} alt={name} />
                </figure>
                <div className="meal-details">
                  <h2>{name}</h2>
                  <p>{cuisine}</p>
                </div>
              </Link>
            );
          })}
        </div>
      </Wrapper>
    );
  };

  export default RecommendedMealsContainer;




  ///////present CSS

  import styled from 'styled-components'

  const Wrapper = styled.nav`
  background: var(--transparent-background);
  position: relative;


@media (max-width: 768px){
.nav-center {
    width: 80%;
    margin: 0 auto;
    padding: 0.5rem 0;
  }
  
 .logo {
    width: 100px;
    height: auto;
  }
}

.nav-display {
    display: flex;
    justify-content: space-between;
    align-items: center; 
  }

/* .button .nav-toggle{
  display: inline-block;
  margin: 0;
  padding: 0;
} */

  .nav-toggle {
    font-size: 2rem;
    color: var(--primary-600);
    background: none;
    border: none;
    cursor: pointer;
    transition: var(--transition);
  }

.nav-links{
z-index: 1200;

}

a.nav-link{
       padding-bottom: 0;
          margin-bottom: 0;
          display: inline-block;
          height: 10%;
      
}


  .nav-toggle:hover {
    color: var(--secondary-500);
  }
  .nav-links-container {
    overflow: hidden;
    transition: var(--transition);
    position: absolute;  // Change this from relative to absolute
    //bottom: 5%;  // Position it above the nav toggle
    left: 0;
    right: 30px;
    background: var(--transparent-background);  // Add background
    overflow: hidden;
    //margin-top: 0.3rem;
    transition: var(--transition);
    max-height: 0;  // Change height to max-height
  }
  .show-menu {
    /* height: auto; */
    max-height: 500px;  // Adjust this value as needed
  }
  .nav-links {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 1rem 0;
    align-items: flex-end;
    height: 300px;
    width: 98%;
    
  }
  .nav-link {
    font-weight: 600;
    color: var(--primary-600);
    transition: var(--transition);
    letter-spacing: var(--letter-spacing);
    background-color: rgba(255, 255, 255, 0.9);
    padding: 0.5rem 1rem;
    border-radius: 6px;
  }
  .nav-link:hover {
    color: var(--secondary-600);
  }
 
  .active {
    color: var(--secondary-600);
  }
  /* .active span {
    color: var(--secondary-900);
  } */


  @media (min-width: 768px) {
    .nav-toggle {
      display: none;
    }
    .nav-links-container {
           position: static;  // Reset position for larger screens
      max-height: none;  // Reset max-height
      overflow: none;
      background: none;  // Remove background
      //margin-top: -8.5rem;

    }
.nav-link {
    margin-top: 8px;
     background-color: rgba(255, 255, 255, 0);
  }

  /* .logo {
    margin-top: -1.5rem;
  } */

.nav-links {
      display: flex;
      flex-direction: row;
      justify-content: flex-end;
       //margin-top: -10px;
       align-items: normal;
      height: 50%;
      //margin-left: 2rem;
    }


    /* .a.nav-link{
          padding-bottom: 0;
          margin-bottom: 0;
          display: inline-block;
    } */

}


    
  
`

  export default Wrapper