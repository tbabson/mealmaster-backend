import dotenv from 'dotenv';
dotenv.config();

// Email setup for Brevo (transactional email HTTP API)
const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

const DEFAULT_SENDER_NAME = process.env.BREVO_SENDER_NAME || 'MealMaster';
const DEFAULT_SENDER_EMAIL = process.env.BREVO_SENDER_EMAIL;

// Accepts 'a@b.com', 'Name <a@b.com>', { email, name } or an array of any of those
const toRecipient = (value) => {
    if (!value) return null;
    if (typeof value === 'object') {
        return value.email ? { email: value.email, ...(value.name && { name: value.name }) } : null;
    }

    const match = String(value).match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
    if (match) {
        const name = match[1].trim();
        return { email: match[2].trim(), ...(name && { name }) };
    }
    return { email: String(value).trim() };
};

const toRecipientList = (value) => {
    if (!value) return undefined;
    const list = (Array.isArray(value) ? value : String(value).split(','))
        .map(toRecipient)
        .filter(Boolean);
    return list.length ? list : undefined;
};

/**
 * Send a transactional email through Brevo.
 * Returns the Brevo response body (contains `messageId`).
 */
export const sendEmail = async ({
    to,
    subject,
    html,
    text,
    from,
    replyTo,
    cc,
    bcc,
    attachments,
    tags,
} = {}) => {
    if (!process.env.BREVO_API_KEY) {
        throw new Error('BREVO_API_KEY is not set — cannot send email.');
    }

    const recipients = toRecipientList(to);
    if (!recipients) {
        throw new Error('sendEmail requires at least one recipient.');
    }

    const sender = toRecipient(from) || {
        email: DEFAULT_SENDER_EMAIL,
        name: DEFAULT_SENDER_NAME,
    };
    if (!sender.email) {
        throw new Error('No sender address — set BREVO_SENDER_EMAIL or pass `from`.');
    }
    if (!sender.name) sender.name = DEFAULT_SENDER_NAME;

    const payload = {
        sender,
        to: recipients,
        subject,
        ...(html && { htmlContent: html }),
        ...(text && { textContent: text }),
        ...(replyTo && { replyTo: toRecipient(replyTo) }),
        ...(toRecipientList(cc) && { cc: toRecipientList(cc) }),
        ...(toRecipientList(bcc) && { bcc: toRecipientList(bcc) }),
        ...(attachments && { attachment: attachments }),
        ...(tags && { tags }),
    };

    const response = await fetch(BREVO_API_URL, {
        method: 'POST',
        headers: {
            'api-key': process.env.BREVO_API_KEY,
            'content-type': 'application/json',
            accept: 'application/json',
        },
        body: JSON.stringify(payload),
    });

    const body = await response.text();

    if (!response.ok) {
        const error = new Error(`Brevo request failed (${response.status}): ${body}`);
        error.status = response.status;
        error.response = body;
        throw error;
    }

    return body ? JSON.parse(body) : {};
};

// Back-compat shim so existing `transporter.sendMail(mailOptions)` calls keep working
export const transporter = {
    sendMail: (mailOptions) => sendEmail(mailOptions),
};
