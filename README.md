# MealMaster

A full-stack meal planning and food e-commerce platform built with Node.js, Express, MongoDB, and React. MealMaster lets users discover meals, manage a shopping cart, place orders with multiple payment options, schedule meal reminders synced to Google Calendar, and read a curated food blog — all backed by a complete admin dashboard.

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [API Reference](#api-reference)
- [Scripts](#scripts)
- [Integrations](#integrations)
- [Security](#security)

---

## Features

### User-Facing

- **Authentication** — Register/login with email & password or Google OAuth
- **Meal Discovery** — Browse and filter meals by type (Breakfast, Lunch, Dinner, Dessert, Snack, Junk) and dietary preference (vegan, vegetarian, gluten-free, halal, kosher)
- **Meal Details** — View ingredients, preparation steps, ratings, and reviews per meal
- **Shopping Cart** — Persistent cart synced between localStorage and server for authenticated users
- **Checkout & Payments** — Supports Stripe, PayPal, and Bank Transfer
- **Order Tracking** — Full order lifecycle: Pending → Processing → Processed → Delivered/Cancelled with delivery status updates
- **Meal Reminders** — Schedule one-time or recurring (daily, weekly, monthly) meal reminders delivered via email, push notification, or Google Calendar events
- **Shopping Lists** — Generate shopping lists from meals and track purchased items
- **Nutritional Information** — Per-serving calories, protein, carbs, fat, fibre, sugar, and sodium for every meal, estimated from its ingredient list
- **Personalised Nutrition Insights** — Your ordering history aggregated into an average meal, compared against reference daily values, with AI-explained meal recommendations that balance out the gaps
- **Reviews & Ratings** — Submit and view meal reviews with star ratings
- **Blog** — Read food articles with categories, comments, search, and related article suggestions
- **Progressive Web App** — Installable to the home screen, works offline via a service worker, and receives Web Push meal reminders via VAPID (installation is required for push on iOS)

### Admin Dashboard

- Manage meals, blog posts, orders, users, reviews, reminders, and carts (CRUD)
- Role-based access control separating admin and regular user capabilities
- Monitor real-time order and delivery statuses

### SEO & Discoverability

- Dynamic XML sitemap generation
- JSON-LD schema markup (Organization, Breadcrumb, Blog)
- Per-page meta tags and OpenGraph support via React Helmet Async

---

## Tech Stack

### Backend

| Layer              | Technology                                                   |
| ------------------ | ------------------------------------------------------------ |
| Runtime            | Node.js (ES Modules)                                         |
| Framework          | Express.js 4.21                                              |
| Database           | MongoDB with Mongoose 8.7                                    |
| Authentication     | JWT + Google OAuth2                                          |
| Payments           | Stripe 17.7, PayPal SDK                                      |
| File Uploads       | Cloudinary, Multer, express-fileupload                       |
| Email              | Brevo transactional email API                                |
| AI                 | OpenAI (nutrition estimation & recommendations)              |
| Push Notifications | web-push (VAPID)                                             |
| Scheduling         | node-cron, node-schedule                                     |
| Security           | Helmet, express-rate-limit, express-mongo-sanitize, bcryptjs |
| SEO                | sitemap                                                      |
| Logging            | Morgan                                                       |

### Frontend

| Layer            | Technology                          |
| ---------------- | ----------------------------------- |
| UI Library       | React 18.3                          |
| Build Tool       | Vite 5.4                            |
| Routing          | React Router 6.28                   |
| State Management | Redux Toolkit 2.5 + Redux Persist 6 |
| Data Fetching    | TanStack React Query 5.61           |
| Styling          | Styled Components 6.1               |
| Animations       | Framer Motion 12                    |
| Icons            | Lucide React, React Icons           |
| Payments         | Stripe.js, PayPal React SDK         |
| Rich Text        | React Quill 2 (blog editor)         |
| Date Utilities   | date-fns, dayjs, moment-timezone    |
| Notifications    | React Toastify                      |
| HTTP Client      | Axios 1.7                           |
| Security         | DOMPurify                           |

---

## Project Structure

```
mealmaster/
├── server.js                    # Express entry point
├── package.json                 # Root dependencies & scripts
│
├── controllers/                 # Request handlers / business logic
│   ├── authController.js
│   ├── MealControllers.js
│   ├── BlogController.js
│   ├── OrderController.js
│   ├── CartController.js
│   ├── ReminderController.js
│   ├── ReviewController.js
│   ├── paymentControllers.js
│   ├── DeliveryController.js
│   ├── shoppingListController.js
│   ├── NutritionController.js   # Nutrition estimation & recommendations
│   └── ScheduleReminders.js     # Cron job runner
│
├── routes/                      # API route definitions
│   ├── authRoutes.js
│   ├── MealRoutes.js
│   ├── BlogRoutes.js
│   ├── OrderRoutes.js
│   ├── CartRoutes.js
│   ├── ReminderRoutes.js
│   ├── ReviewRoutes.js
│   ├── paymentRoutes.js
│   ├── ingredientRoutes.js
│   ├── prepStepRoutes.js
│   ├── nutritionRoutes.js
│   └── shoppingListRoutes.js
│
├── models/                      # Mongoose schemas
│   ├── UserSchema.js
│   ├── MealModel.js
│   ├── OrderModel.js
│   ├── CartModel.js
│   ├── ReminderModel.js
│   ├── BlogModel.js
│   ├── ReviewModel.js
│   ├── IngredientsModel.js
│   ├── DeliveryModel.js
│   ├── SubscriptionModel.js
│   ├── NutritionRecommendationModel.js  # Cached AI recommendations, per user
│   └── HealthGoalModel.js
│
├── middleware/
│   ├── authMiddleware.js        # JWT verification & role checks
│   ├── errorHandlerMiddleware.js
│   ├── multer.js
│   └── validationMiddleware.js
│
├── utils/
│   ├── constants.js             # Enums for meal types, order statuses, etc.
│   ├── cloudinary.js
│   ├── tokenUtils.js
│   ├── passwordUtils.js
│   ├── transporter.js           # Brevo email client
│   ├── openai.js                # OpenAI client, prompts & error mapping
│   ├── nutritionProfile.js      # Deterministic order-history aggregation
│   └── sitemapGenerator.js
│
├── errors/                      # Custom error classes
│
└── client/                      # React frontend
    ├── vite.config.js           # Dev proxy → http://localhost:5000/api
    └── src/
        ├── App.jsx              # Route definitions
        ├── store.js             # Redux store with persistence
        ├── pages/               # Page components (Meals, Cart, Orders, Admin…)
        ├── components/          # Reusable UI components
        ├── Features/            # Redux slices (cart, user, blog, review, reminder)
        ├── actionsAndLoaders/   # React Router data loaders & actions
        └── utils/               # API helpers
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- MongoDB Atlas account (or local MongoDB instance)
- Accounts for Cloudinary, Stripe, and Google Cloud (for OAuth & Calendar)

### Installation

1. Clone the repository:

   ```bash
   git clone <repository-url>
   cd mealmaster
   ```

2. Install all dependencies (backend + frontend):

   ```bash
   npm run setup-project
   ```

3. Create a `.env` file in the project root (see [Environment Variables](#environment-variables)).

4. Start the development servers:

   ```bash
   npm run dev
   ```

   The backend runs on `http://localhost:5000` and the frontend on `http://localhost:5173`. The Vite dev server proxies `/api` requests to the backend automatically.

---

## Environment Variables

Create a `.env` file in the backend root. It is gitignored — never commit real values.

### Backend

| Variable | Required | Purpose |
| -------- | -------- | ------- |
| `NODE_ENV` | ✅ | `development` or `production`. Controls cookie `Secure`/`SameSite` flags and CORS origins. |
| `PORT` | — | Server port (defaults to `8000`). |
| `MONGO_URL` | ✅ | MongoDB connection string. |
| `JWT_SECRET` | ✅ | Signing secret for auth tokens. |
| `JWT_EXPIRES_IN` | ✅ | Token lifetime, e.g. `1d`. |
| `CLIENT_URL` | ✅ | Frontend origin. Used for CORS and OAuth/Stripe redirects. |
| `CLOUD_NAME`, `CLOUD_API_KEY`, `CLOUD_API_SECRET` | ✅ | Cloudinary image hosting. |
| `BREVO_API_KEY` | ✅ | Brevo transactional email. |
| `BREVO_SENDER_EMAIL` | ✅ | Must be a **verified sender** or on a Brevo-authenticated domain, or sends fail with `400`. |
| `BREVO_SENDER_NAME` | — | Display name on outgoing mail (defaults to `MealMaster`). |
| `BREVO_REPLY_TO` | — | Reply-to address; falls back to the sender. |
| `OPENAI_API_KEY` | — | Required only for nutrition features. Without it the server still boots and only `/nutrition` routes fail, with a `503`. |
| `OPENAI_MODEL` | — | Defaults to `gpt-4o-mini`. Set to any model your account can access. |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | ✅ | Stripe payments and webhook signature verification. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | ✅ | Google OAuth and Calendar sync. |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | ✅ | Web Push signing key pair. |

### Frontend

Vite only exposes variables prefixed with `VITE_`. **Never put a secret here — anything prefixed `VITE_` is shipped to the browser.**

| Variable | Required | Purpose |
| -------- | -------- | ------- |
| `VITE_API_URL` | production | Backend base URL, e.g. `https://mealmaster1.onrender.com/api/v1`. Leave unset in development — Vite proxies `/api` to the local backend. |
| `VITE_VAPID_PUBLIC_KEY` | ✅ | Must be the exact counterpart of the backend's `VAPID_PRIVATE_KEY`, or the push service rejects every message. Public by design. |

---

## API Reference

All endpoints are prefixed with `/api/v1`, except `/`, `/health`, and `/sitemap.xml`.

**Full interactive reference:** the deployed API serves a complete endpoint-by-endpoint reference at its root — [https://mealmaster1.onrender.com/](https://mealmaster1.onrender.com/) — covering all 83 routes with request bodies, response shapes, auth requirements, and error cases.

| Prefix              | Resource                                 |
| ------------------- | ---------------------------------------- |
| `/auth`             | Register, login, Google OAuth, logout    |
| `/meals`            | Meal CRUD, filtering, search             |
| `/blogs`            | Blog posts, comments                     |
| `/orders`           | Create and retrieve orders               |
| `/cart`             | Add, update, and remove cart items       |
| `/reminders`        | Schedule and manage meal reminders       |
| `/users`            | User profile, preferences, order history |
| `/reviews`          | Meal reviews and ratings                 |
| `/payment`          | Stripe payment intent, webhook handler   |
| `/ingredients`      | Ingredient management                    |
| `/preparationSteps` | Preparation step sequences               |
| `/shoppingLists`    | Shopping list CRUD                       |
| `/nutrition`        | Meal nutrition, personal profile, AI recommendations |
| `/health`           | Liveness check (reports database connectivity) |
| `/sitemap.xml`      | Auto-generated XML sitemap               |

---

## Scripts

| Command                        | Description                                            |
| ------------------------------ | ------------------------------------------------------ |
| `npm run dev`                  | Start backend and frontend concurrently                |
| `npm run server`               | Start backend only (nodemon)                           |
| `npm run client`               | Start frontend only (Vite dev server)                  |
| `npm run setup-project`        | Install all dependencies (backend + frontend)          |
| `npm run setup-production-app` | Install dependencies and build frontend for production |

Frontend-only scripts (run from `client/`):

| Command           | Description                      |
| ----------------- | -------------------------------- |
| `npm run dev`     | Start Vite dev server            |
| `npm run build`   | Build for production             |
| `npm run preview` | Preview production build locally |
| `npm run lint`    | Run ESLint                       |

---

## Integrations

| Service                 | Purpose                                            |
| ----------------------- | -------------------------------------------------- |
| **MongoDB Atlas**       | Cloud-hosted database                              |
| **Cloudinary**          | Image hosting and optimization for meals and blogs |
| **Stripe**              | Secure payment processing with webhook support     |
| **PayPal**              | Alternative payment method                         |
| **Google OAuth2**       | Social login                                       |
| **Google Calendar API** | Sync meal reminders as calendar events             |
| **Brevo**               | Transactional email (meal reminders)                |
| **OpenAI**              | Nutrition estimation and personalised recommendations |
| **Web Push API**        | PWA push notifications                             |

---

## Security

- **Password hashing** — bcryptjs with salt rounds
- **JWT authentication** — Short-lived tokens with HTTP-only cookies
- **Rate limiting** — 15 requests per 15 minutes on auth endpoints
- **Input sanitization** — express-mongo-sanitize prevents NoSQL injection
- **Security headers** — Helmet sets safe HTTP response headers
- **CORS** — Configured explicitly for allowed origins
- **Role-based access** — Admin routes protected at both the API and frontend routing layers
- **Stripe webhook verification** — Signature validation on all webhook events
- **XSS protection** — DOMPurify sanitizes any rendered HTML on the frontend
