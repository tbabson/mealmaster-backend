import User from '../models/UserSchema.js';
import { UnauthenticatedError } from '../errors/customErrors.js';

// Gate for calendar routes: the caller must have connected Google Calendar.
// The calendar client itself is built per call from the reminder owner's token
// (see insertCalendarEvent in ScheduleReminders.js).
export const authenticateGoogle = async (req, res, next) => {
    const user = await User.findById(req.user.userId).select('+googleRefreshToken');

    if (!user || !user.googleRefreshToken || !user.googleCalendarSyncEnabled) {
        throw new UnauthenticatedError('Google Calendar authentication required');
    }

    next();
};
