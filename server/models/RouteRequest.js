// RouteRequest model for MongoDB
const mongoose = require('mongoose');

const routeRequestSchema = new mongoose.Schema({
  start: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    name: { type: String, required: false },
    address: { type: String, required: false }
  },
  end: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    name: { type: String, required: false },
    address: { type: String, required: false }
  },
  routeCount: {
    type: Number,
    required: false,
    default: 0
  },
  hasFlaggedRoads: {
    type: Boolean,
    required: false,
    default: false
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true // Adds createdAt and updatedAt automatically
});

// Index for time-based queries
routeRequestSchema.index({ timestamp: -1 });

module.exports = mongoose.models.RouteRequest || mongoose.model('RouteRequest', routeRequestSchema);

