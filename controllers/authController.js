import { StatusCodes } from "http-status-codes"
import User from '../models/UserSchema.js'
import { comparePassword, hashPassword } from "../utils/passwordUtils.js"
import { UnauthenticatedError, BadRequestError } from "../errors/customErrors.js"
import { createJWT } from "../utils/tokenUtils.js"
import { google } from 'googleapis'
import { primaryClientUrl } from '../utils/clientUrl.js'

const MIN_PASSWORD_LENGTH = 8

const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0

export const validatePassword = (password) => {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    throw new BadRequestError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters long`);
  }
}

export const register = async (req, res) => {
  const { fullName, email, password } = req.body

  if (!isNonEmptyString(fullName) || !isNonEmptyString(email)) {
    throw new BadRequestError('Please provide your full name and email')
  }
  validatePassword(password)

  // Only these fields are accepted — never role, orders or Google tokens from the client
  const isFirstAccount = await User.countDocuments() === 0
  await User.create({
    fullName: fullName.trim(),
    email: email.trim(),
    password: await hashPassword(password),
    role: isFirstAccount ? 'admin' : 'user',
  })

  res.status(StatusCodes.CREATED).json({ msg: 'user created' })
}

export const login = async (req, res) => {
  const { email, password } = req.body

  if (!isNonEmptyString(email) || typeof password !== 'string') {
    throw new UnauthenticatedError('invalid credentials')
  }

  const user = await User.findOne({ email: email.trim() })

  const isValidUser = user && (await comparePassword(password, user.password))

  if (!isValidUser) throw new UnauthenticatedError('invalid credentials')

  const token = createJWT({ userId: user._id, role: user.role, fullName: user.fullName })

  const oneDay = 1000 * 60 * 60 * 24
  const isProduction = process.env.NODE_ENV === 'production'

  res.cookie('token', token, {
    httpOnly: true,
    expires: new Date(Date.now() + oneDay),
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
  })
  res.status(StatusCodes.OK).json({ msg: 'user logged in' })
}

export const logout = (req, res) => {
  const isProduction = process.env.NODE_ENV === 'production'
  res.cookie('token', 'logout', {
    httpOnly: true,
    expires: new Date(Date.now()),
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
  })
  res.status(StatusCodes.OK).json({ msg: 'user logged out!' })
}

export const handleGoogleAuth = async (req, res) => {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  const clientUrl = process.env.NODE_ENV === 'production'
    ? primaryClientUrl()
    : 'http://localhost:5173';

  try {
    const { code } = req.query;
    if (!code) {
      throw new Error('No authorization code received from Google');
    }

    const { tokens } = await oauth2Client.getToken(code);
    if (!tokens.refresh_token) {
      throw new Error('No refresh token received. User may need to revoke access and try again.');
    }

    // Update user with refresh token
    const user = await User.findById(req.user.userId);
    if (!user) {
      throw new Error('User not found');
    }
    user.googleRefreshToken = tokens.refresh_token;
    user.googleCalendarSyncEnabled = true;
    user.lastGoogleCalendarSync = new Date();
    await user.save();

    res.redirect(`${clientUrl}/create-reminders?calendar_auth=success`);
  } catch (error) {
    console.error('Google Calendar auth error:', error);
    res.redirect(`${clientUrl}/create-reminders?calendar_auth=failed&error=${encodeURIComponent(error.message)}`);
  }
};

export const revokeGoogleAccess = async (req, res) => {
  await User.findByIdAndUpdate(req.user.userId, {
    googleRefreshToken: null,
    googleCalendarSyncEnabled: false,
  });
  res.status(StatusCodes.OK).json({ message: 'Google Calendar access revoked' });
};
