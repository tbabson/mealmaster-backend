// CLIENT_URL may hold one origin or a comma-separated list, e.g.
//   CLIENT_URL=https://mealmaster-nine.vercel.app,https://www.example.com
// The first entry is the canonical frontend used for redirects (Stripe, OAuth).
// Vite dev (3200) and preview (4173) per the frontend's vite.config.js, plus
// Vite's default 5173. Normally these go through Vite's /api proxy (same origin),
// so this only matters when the frontend calls the API URL directly.
const DEV_ORIGINS = [
  'http://localhost:3200',
  'http://localhost:4173',
  'http://localhost:5173',
  'http://localhost:5000',
];

// Origins never carry a trailing slash, so "https://x.app/" would never match
const normalise = (url) => url.trim().replace(/\/+$/, '');

export const configuredClientUrls = () =>
  (process.env.CLIENT_URL || '').split(',').map(normalise).filter(Boolean);

// Origins allowed to call the API with credentials
export const allowedOrigins = () =>
  process.env.NODE_ENV === 'production'
    ? configuredClientUrls()
    : [...new Set([...DEV_ORIGINS, ...configuredClientUrls()])];

// The canonical frontend (first CLIENT_URL entry), e.g. for Stripe redirects
export const primaryClientUrl = () => configuredClientUrls()[0];
