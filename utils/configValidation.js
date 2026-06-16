import dotenv from 'dotenv';
dotenv.config();

export const validateGoogleConfig = () => {
    const requiredVars = [
        'GOOGLE_CLIENT_ID',
        'GOOGLE_CLIENT_SECRET',
        'GOOGLE_REDIRECT_URI'
    ];

    const missingVars = requiredVars.filter(varName => !process.env[varName]);

    if (missingVars.length > 0) {
        throw new Error(
            `Missing required Google Calendar environment variables: ${missingVars.join(', ')}. ` +
            'Please check your .env file and ensure all required variables are set.'
        );
    }

    return {
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        redirectUri: process.env.GOOGLE_REDIRECT_URI
    };
};