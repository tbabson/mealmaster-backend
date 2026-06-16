import { StatusCodes } from "http-status-codes"
import User from '../models/UserSchema.js'
import { comparePassword, hashPassword } from "../utils/passwordUtils.js"
import { UnauthenticatedError, BadRequestError } from "../errors/customErrors.js"
import { createJWT } from "../utils/tokenUtils.js"
import { google } from 'googleapis'

export const register = async (req, res) => {
  const isFirstAccount = await User.countDocuments() === 0
  req.body.role = isFirstAccount ? 'admin' : 'user'

  if (req.body.password.length < 8) {
    throw new UnauthenticatedError('Password must be at least 8 characters long');
  }

  const hashedPassword = await hashPassword(req.body.password)
  req.body.password = hashedPassword

  const user = await User.create(req.body)
  res.status(StatusCodes.CREATED).json({ msg: 'user created' })
}

export const login = async (req, res) => {
  const user = await User.findOne({ email: req.body.email })

  const isValidUser = user && (await comparePassword(req.body.password, user.password))

  if (!isValidUser) throw new UnauthenticatedError('invalid credentials')

  const token = createJWT({ userId: user._id, role: user.role, fullName: user.fullName })

  const oneDay = 1000 * 60 * 60 * 24

  res.cookie('token', token, {
    httpOnly: true,
    expires: new Date(Date.now() + oneDay),
    secure: process.env.NODE_ENV === 'production',
  })
  res.status(StatusCodes.OK).json({ msg: 'user logged in' })
}

export const logout = (req, res) => {
  res.cookie('token', 'logout', {
    httpOnly: true,
    expires: new Date(Date.now()),
  })
  res.status(StatusCodes.OK).json({ msg: 'user logged out!' })
}

export const handleGoogleAuth = async (req, res) => {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

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
    user.googleRefreshToken = tokens.refresh_token;
    user.googleCalendarSyncEnabled = true;
    user.lastGoogleCalendarSync = new Date();
    await user.save();

    // Redirect back to reminder creation with absolute URL
    const clientUrl = process.env.NODE_ENV === 'production'
      ? process.env.CLIENT_URL
      : 'http://localhost:5173';

    res.redirect(`${clientUrl}/create-reminder?calendar_auth=success`);
  } catch (error) {
    console.error('Google Calendar auth error:', error);
    const clientUrl = process.env.NODE_ENV === 'production'
      ? process.env.CLIENT_URL
      : 'http://localhost:5173';

    res.redirect(`${clientUrl}/create-reminder?calendar_auth=failed&error=${encodeURIComponent(error.message)}`);
  }
};

export const revokeGoogleAccess = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    user.googleRefreshToken = null;
    user.googleCalendarSyncEnabled = false;
    await user.save();
    res.status(StatusCodes.OK).json({ message: 'Google Calendar access revoked' });
  } catch (error) {
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ message: error.message });
  }
};
