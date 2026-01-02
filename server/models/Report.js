// Report model for MongoDB
const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
  roadId: {
    type: String,
    required: false,
    index: true // Index for faster queries
  },
  roadName: {
    type: String,
    required: true,
    index: true
  },
  reportType: {
    type: String,
    enum: ['light', 'medium', 'heavy', 'blocked', 'accident'],
    required: true,
    index: true
  },
  userId: {
    type: String,
    required: false
  },
  lat: {
    type: Number,
    required: true
  },
  lng: {
    type: Number,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true // Index for time-based queries
  }
}, {
  timestamps: true // Adds createdAt and updatedAt automatically
});

// Compound index for efficient queries by road and time
reportSchema.index({ roadId: 1, timestamp: -1 });
reportSchema.index({ roadName: 1, timestamp: -1 });
reportSchema.index({ lat: 1, lng: 1, timestamp: -1 }); // For location-based queries

module.exports = mongoose.models.Report || mongoose.model('Report', reportSchema);

