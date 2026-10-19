import {
  UnauthenticatedError,
  UnauthorizedError,
} from '../errors/customErrors.js';
import { verifyJWT } from '../utils/tokenUtils.js';

export const authenticateUser = (req, res, next) => {
  const { token } = req.cookies;

  if (!token) throw new UnauthenticatedError('authentication invalid');

  try {
    const { userId, fullName, role } = verifyJWT(token);
    req.user = { userId, fullName, role };
    next();
  } catch (error) {
    const isProduction = process.env.NODE_ENV === 'production'
    res.clearCookie("token", { secure: isProduction, sameSite: isProduction ? 'none' : 'lax' });
    throw new UnauthenticatedError('authentication invalid');
  }
};

// For public routes that show more to signed-in users (e.g. drafts for admins):
// sets req.user when a valid token is present, never rejects.
export const attachUserIfPresent = (req, res, next) => {
  const { token } = req.cookies;
  if (token) {
    try {
      const { userId, fullName, role } = verifyJWT(token);
      req.user = { userId, fullName, role };
    } catch (error) {
      // invalid/expired token: treat as anonymous
    }
  }
  next();
};

export const authorizePermissions = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      throw new UnauthorizedError('Unauthorized to access this route');
    }
    next();
  };
};

export const isAdmin = (user) => user?.role === 'admin';

export const checkPermissions = (requestUser, resourceUserId) => {
  if (isAdmin(requestUser)) return;
  if (resourceUserId && requestUser.userId === resourceUserId.toString()) return;
  throw new UnauthorizedError('Not authorized to access this route');
};

// Route guard for URLs that name a user, e.g. /cart/:userId — callers may only
// address themselves unless they are an admin.
export const requireSelfOrAdmin = (param = 'userId') => (req, res, next) => {
  if (isAdmin(req.user) || req.params[param] === req.user.userId) return next();
  throw new UnauthorizedError('Not authorized to access this resource');
};

// Query filter that scopes a lookup to the caller's own documents; admins see
// everything. A non-owner then gets a 404 rather than a 403, so ids cannot be probed.
export const ownerFilter = (req, field = 'user') =>
  isAdmin(req.user) ? {} : { [field]: req.user.userId };
