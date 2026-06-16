import { body, param, validationResult } from 'express-validator';
import { BadRequestError, NotFoundError } from '../errors/customError.js';

const withValidationErrors = (validateValues) => {
    return [
        validateValues, (req, res, next) => {
            const errors = validationResult(req)
            if (!errors.isEmpty()) {
                const errorMessages = errors.array().map((error) => error.msg);
                if (errorMessages[0].startsWith('no food')) {
                    throw new NotFoundError(errorMessages)
                }
                throw new BadRequestError(errorMessages)
            }
            next()
        },
    ]
}

// export const validateUserUpdate = withValidationErrors([
//     body('fullName')
//         .optional()
//         .isLength({ min: 2 })
//         .withMessage('Name must be at least 2 characters long'),
//     body('email')
//         .optional()
//         .isEmail()
//         .withMessage('Please provide a valid email'),
//     body('password')
//         .optional()
//         .isLength({ min: 6 })
//         .withMessage('Password must be at least 6 characters long'),
// ]);