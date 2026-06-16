import { google } from 'googleapis';
import dotenv from 'dotenv';
import User from '../models/UserSchema.js';
import { UnauthenticatedError } from '../errors/customErrors.js';
dotenv.config();

const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
);

export const authenticateGoogle = async (req, res, next) => {
    try {
        const user = await User.findById(req.user.userId);

        if (!user.googleRefreshToken || !user.googleCalendarSyncEnabled) {
            throw new UnauthenticatedError('Google Calendar authentication required');
        }

        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            process.env.GOOGLE_REDIRECT_URI
        );

        oauth2Client.setCredentials({
            refresh_token: user.googleRefreshToken
        });

        // Store the authenticated client in the request for use in the route handler
        req.googleAuth = oauth2Client;
        next();
    } catch (error) {
        next(error);
    }
};

export const handleGoogleCallback = async (req, res, next) => {
    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
    );

    try {
        const user = await User.findById(req.user.userId);
        if (!user) {
            throw new UnauthenticatedError('User not found');
        }

        if (!req.query.code) {
            throw new Error('Authorization code not received from Google');
        }

        req.googleAuth = oauth2Client;
        next();
    } catch (error) {
        const clientUrl = process.env.NODE_ENV === 'production'
            ? process.env.CLIENT_URL
            : 'http://localhost:5173';

        res.redirect(`${clientUrl}/create-reminder?calendar_auth=failed&error=${encodeURIComponent(error.message)}`);
    }
};