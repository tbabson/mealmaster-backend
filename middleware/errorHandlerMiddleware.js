import { StatusCodes } from 'http-status-codes';
import multer from 'multer';

const GENERIC_MESSAGE = 'Something went wrong, try again later';

const errorHandlerMiddleware = (err, req, res, next) => {
  let statusCode = err.statusCode || StatusCodes.INTERNAL_SERVER_ERROR;
  let msg = err.message || GENERIC_MESSAGE;

  if (err.name === 'CastError') {
    statusCode = StatusCodes.BAD_REQUEST;
    msg = `Invalid value for ${err.path}`;
  } else if (err.name === 'ValidationError') {
    statusCode = StatusCodes.BAD_REQUEST;
    msg = Object.values(err.errors).map((e) => e.message).join(', ');
  } else if (err.code === 11000) {
    statusCode = StatusCodes.BAD_REQUEST;
    const fields = Object.keys(err.keyValue || {}).join(', ') || 'value';
    msg = `That ${fields} is already in use`;
  } else if (err instanceof multer.MulterError) {
    statusCode = StatusCodes.BAD_REQUEST;
    msg = err.code === 'LIMIT_FILE_SIZE' ? 'File is too large (max 5MB)' : err.message;
  } else if (err.type === 'entity.parse.failed') {
    statusCode = StatusCodes.BAD_REQUEST;
    msg = 'Malformed JSON body';
  }

  if (statusCode >= 500) {
    console.error(err);
    // Internal error text (driver errors, stack details) is for the logs, not the client.
    if (process.env.NODE_ENV === 'production') msg = GENERIC_MESSAGE;
  }

  // Both keys: most handlers historically responded with `message`, auth with `msg`.
  res.status(statusCode).json({ msg, message: msg });
};

export default errorHandlerMiddleware;
