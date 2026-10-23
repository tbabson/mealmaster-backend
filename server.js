//PACKAGE IMPORTS
// Must be the first import: ES module imports are hoisted, so a dotenv.config()
// call in this file's body would run only after every other module had loaded.
import 'dotenv/config';
import dns from 'dns';
import express from 'express';
const app = express();
import 'express-async-errors';
import morgan from 'morgan';
import mongoose from 'mongoose';
import cookieParser from 'cookie-parser';
import cloudinary from 'cloudinary';
import helmet from 'helmet';
import mongoSanitize from 'express-mongo-sanitize';
import rateLimiter from 'express-rate-limit';
import { initializeReminderSystem } from './controllers/ScheduleReminders.js';
import cors from 'cors';
import { validateGoogleConfig } from './utils/configValidation.js';
import { generateSitemap } from './utils/sitemapGenerator.js';
import { allowedOrigins } from './utils/clientUrl.js';

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
import nutritionRoutes from './routes/nutritionRoutes.js';

//public
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import path from 'path';

//Middleware
import errorHandlerMiddleware from './middleware/errorHandlerMiddleware.js';

import { handleStripeWebhook } from './controllers/paymentControllers.js';

// Some local networks cannot resolve MongoDB Atlas SRV records, so development
// defaults to Google DNS. Production keeps the host's resolver unless
// DNS_SERVERS (comma-separated) is set explicitly.
const dnsServers = process.env.DNS_SERVERS
  ?? (process.env.NODE_ENV === 'production' ? '' : '8.8.8.8,8.8.4.4');
if (dnsServers) {
  dns.setServers(dnsServers.split(',').map((s) => s.trim()).filter(Boolean));
}

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

// Render (and most PaaS) sit behind one reverse proxy. Without this every
// request appears to come from the proxy's IP — all users would share one
// rate-limit bucket — and req.protocol reports http instead of https.
app.set('trust proxy', 1);

if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Frontend served separately on Render Static Site

// Updated CORS configuration
// CLIENT_URL may list several origins (comma-separated); see utils/clientUrl.js.
// With a list, cors echoes back whichever origin matched and sets Vary: Origin.
const corsOrigins = allowedOrigins();
if (process.env.NODE_ENV === 'production' && !corsOrigins.length) {
  console.warn('CLIENT_URL is not set — browsers will be blocked by CORS.');
}
app.use(cors({
  origin: corsOrigins,
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


app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
// Strip `$` / `.` keys from body, query and params so request data cannot
// smuggle MongoDB operators (e.g. {"email": {"$ne": null}}) into queries.
app.use(mongoSanitize());
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", "https://res.cloudinary.com"],
        // you might need to include other sources too
      },
    },
  })
);

// Broad per-IP ceiling for the whole API; auth and AI routes have tighter limits.
app.use('/api/v1', rateLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 500,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { msg: 'Too many requests, please try again later', message: 'Too many requests, please try again later' },
}));

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
app.use('/api/v1/nutrition', nutritionRoutes);

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

// Any method, not just GET
app.use((req, res) => {
  res.status(404).json({ msg: 'Route not found', message: 'Route not found' });
});

app.use(errorHandlerMiddleware);

const port = process.env.PORT || 8000;

// A single dropped TLS handshake to Atlas (MongoNetworkError ECONNRESET) used to
// kill the process at boot. Retry with backoff before giving up.
const connectWithRetry = async (attempts = 6) => {
  for (let attempt = 1; ; attempt++) {
    try {
      await mongoose.connect(process.env.MONGO_URL, { serverSelectionTimeoutMS: 15000 });
      return;
    } catch (error) {
      if (attempt >= attempts) throw error;
      const delay = Math.min(2000 * 2 ** (attempt - 1), 30000);
      console.warn(
        `MongoDB connection failed (${error.name}: ${error.message.split('\n')[0]}). ` +
        `Retrying in ${delay / 1000}s (${attempt}/${attempts - 1})...`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
};

// After boot the driver reconnects on its own; just make outages visible in the logs
mongoose.connection.on('disconnected', () => console.warn('MongoDB disconnected — the driver will keep retrying'));
mongoose.connection.on('reconnected', () => console.log('MongoDB reconnected'));

try {
  await connectWithRetry();
  await initializeReminderSystem(); // Start the reminder scheduler (needs an open DB connection)
  app.listen(port, '0.0.0.0', () => {
    console.log(`server running on PORT ${port}...`);

  });
} catch (error) {
  console.log(error);
  process.exit(1);
}
