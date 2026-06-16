import { Router } from "express";
import express from 'express';
import { register, login, logout, handleGoogleAuth, revokeGoogleAccess } from '../controllers/authController.js';
import { authenticateUser } from '../middleware/authMiddleware.js';
import { google } from 'googleapis';
import rateLimiter from "express-rate-limit";

const router = Router();

const apiLimiter = rateLimiter({
    windowMs: 15 * 60 * 1000,
    max: 15,
    message: { msg: 'IP rate limit exceeded, retry in 15 minutes' },
});

router.post('/register', apiLimiter, register);
router.post('/login', apiLimiter, login);
router.get('/logout', logout);

// Google Calendar Authentication routes
router.get('/google', authenticateUser, (req, res) => {
    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
    );

    const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: [
            'https://www.googleapis.com/auth/calendar',
            'https://www.googleapis.com/auth/calendar.events'
        ],
        prompt: 'consent'
    });

    res.redirect(authUrl);
});

router.get('/google/callback', authenticateUser, handleGoogleAuth);
router.post('/google/revoke', authenticateUser, revokeGoogleAccess);

export default router;
