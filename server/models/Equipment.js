const mongoose = require('mongoose')

const bookingSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  start: { type: Date, required: true },
  end: { type: Date, required: true },
  purpose: { type: String, required: true, maxlength: 1000 },
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'cancelled', 'in_use', 'completed'], default: 'pending' },
  note: { type: String, default: '', maxlength: 1000 },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  checkedOutAt: Date,
  returnedAt: Date
}, { timestamps: true })

// Booking decisions and schedule conflicts are updated atomically in one document.
// This works with the user's standalone MongoDB, without requiring transactions.
const schema = new mongoose.Schema({
  name: { type: String, required: true, maxlength: 120 },
  assetCode: { type: String, required: true, unique: true, maxlength: 50 },
  category: { type: String, required: true, maxlength: 60 },
  location: { type: String, required: true, maxlength: 120 },
  description: { type: String, default: '', maxlength: 2000 },
  instructions: { type: String, default: '', maxlength: 2000 },
  status: { type: String, enum: ['available', 'maintenance', 'archived'], default: 'available' },
  sample: { type: Boolean, default: false },
  image: { type: String },
  revision: { type: Number, default: 0 },
  bookings: [bookingSchema]
}, { timestamps: true })
schema.index({ 'bookings.user': 1 })
schema.index({ 'bookings._id': 1 })

module.exports = mongoose.model('Equipment', schema)
