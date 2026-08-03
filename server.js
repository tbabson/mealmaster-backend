//PACKAGE IMPORTS
import * as dotenv from 'dotenv';
dotenv.config();
import dns from 'dns';
dns.setServers(['8.8.8.8', '8.8.4.4']);
import express from 'express';
const app = express();
import 'express-async-errors';
import morgan from 'morgan';
import mongoose from 'mongoose';
import cookieParser from 'cookie-parser';
import cloudinary from 'cloudinary';
import helmet from 'helmet';
import { initializeReminderSystem } from './controllers/ScheduleReminders.js';
import cors from 'cors';
import { validateGoogleConfig } from './utils/configValidation.js';
import { generateSitemap } from './utils/sitemapGenerator.js';

//CUSTOM IMPORTS
//routers
import authRouter from './routes/authRoutes.js';
import mealRouter from './routes/MealRoutes.js';
import blogRouter from './routes/BlogRoutes.js';
import ingredientRouter from './routes/ingredientRoutes.js';
import preparationRouter from './routes/prepStepRoutes.js';
import shoppingListsRouter from './routes/shoppingListRoutes.js';
import ordersRouter from './routes/OrderRoutes.js';
import reminderRoutes from './routes/ReminderRoutes.js';
import reviewRoutes from './routes/ReviewRoutes.js';
import userRoutes from './routes/UserRoutes.js';
import cartRoutes from './routes/CartRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';

//public
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import path from 'path';

//Middleware
import errorHandlerMiddleware from './middleware/errorHandlerMiddleware.js';

import { handleStripeWebhook } from './controllers/paymentControllers.js';

// Validate required configurations
try {
  validateGoogleConfig();
} catch (error) {
  console.error('Configuration Error:', error.message);
  process.exit(1);
}

cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_API_KEY,
  api_secret: process.env.CLOUD_API_SECRET,
});

const __dirname = dirname(fileURLToPath(import.meta.url));
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Frontend served separately on Render Static Site

// Updated CORS configuration
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? process.env.CLIENT_URL
    : ['http://localhost:5173', 'http://localhost:5000'],
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// IMPORTANT: Add the Stripe webhook route BEFORE the JSON body parser
// This ensures the raw body is available for Stripe signature verification
app.post('/api/v1/payment/webhook',
  express.raw({ type: 'application/json' }),
  handleStripeWebhook
);


app.use(express.json());
app.use(cookieParser());
app.use(
  helmet.contentSecurityPolicy({
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", "https://res.cloudinary.com"],
      // you might need to include other sources too
    },
  })
);

// Sitemap endpoint
app.get('/sitemap.xml', async (req, res) => {
  try {
    const baseURL = `${req.protocol}://${req.get('host')}`;
    const sitemap = await generateSitemap(baseURL);
    res.header('Content-Type', 'application/xml');
    res.send(sitemap);
  } catch (error) {
    console.error('Sitemap generation error:', error);
    res.status(500).send('Error generating sitemap');
  }
});


// app.get('/', (req, res) => {
//   res.send('hello world');
// });

app.use('/api/v1/auth', authRouter);
app.use('/api/v1/meals', mealRouter);
app.use('/api/v1/blogs', blogRouter);
app.use('/api/v1/ingredients', ingredientRouter);
app.use('/api/v1/preparationSteps', preparationRouter);
app.use('/api/v1/shoppingLists', shoppingListsRouter);
app.use('/api/v1/orders', ordersRouter);
app.use('/api/v1/reminders', reminderRoutes);
app.use('/api/v1/reviews', reviewRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/cart', cartRoutes);
app.use('/api/v1/payment', paymentRoutes);

// API reference page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Health check — reports DB connectivity, 503 when the database is unreachable
app.get('/health', (req, res) => {
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  const dbState = states[mongoose.connection.readyState] || 'unknown';
  const healthy = mongoose.connection.readyState === 1;

  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    database: dbState,
  });
});

app.get('*', (req, res) => {
  res.status(404).json({ msg: 'Route not found' });
});



app.use(errorHandlerMiddleware);

const port = process.env.PORT || 8000;

try {
  await mongoose.connect(process.env.MONGO_URL);
  await initializeReminderSystem(); // Start the reminder scheduler (needs an open DB connection)
  app.listen(port, '0.0.0.0', () => {
    console.log(`server running on PORT ${port}...`);

  });
} catch (error) {
  console.log(error);
  process.exit(1);
}
