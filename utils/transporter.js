import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
dotenv.config();

// Email setup for Nodemailer
export const transporter = nodemailer.createTransport({
    service: 'Gmail',
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,// false for port 587
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

