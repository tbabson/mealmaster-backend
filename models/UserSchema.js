import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
  fullName: {
    type: String,
    required: [true, 'Please provide your full name'],
  },
  email: {
    type: String,
    required: [true, 'Please provide an email address'],
    unique: true,
  },
  password: {
    type: String,
    required: [true, 'Please provide a password'],
    minlength: 6,
  },
  orders: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
    },
  ],
  cartItems: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Cart',
    },
  ],
  reminders: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Reminder',
    },
  ],
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user',
  },
  // Google Calendar Authentication fields
  googleRefreshToken: {
    type: String,
    sparse: true,
  },
  googleCalendarSyncEnabled: {
    type: Boolean,
    default: false
  },
  lastGoogleCalendarSync: {
    type: Date,
    sparse: true
  }
}, { timestamps: true });

UserSchema.methods.toJSON = function () {
  let obj = this.toObject()
  delete obj.password
  return obj
}

export default mongoose.model('User', UserSchema);
