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
  profileImage: {
    type: String,
  },
  cloudinaryId: {
    type: String,
  },
  // Google Calendar Authentication fields
  // select:false — a long-lived credential; only load it explicitly with
  // .select('+googleRefreshToken') where a Google client is built.
  googleRefreshToken: {
    type: String,
    sparse: true,
    select: false,
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
  delete obj.googleRefreshToken
  return obj
}

export default mongoose.model('User', UserSchema);
