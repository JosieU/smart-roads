// Load environment variables (for API keys)
// Load .env from server directory (works whether running from root or server directory)
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const roadReports = require('./data/roadReports');
const routeService = require('./services/routeService');
const geocodingService = require('./services/geocodingService');
const { connectDB } = require('./config/database');
const Report = require('./models/Report');
const Feedback = require('./models/Feedback');
const RouteRequest = require('./models/RouteRequest');

const app = express();
// Store feedback in memory (fallback, primary is database)
let feedbackStore = [];
// Store route requests for analytics (fallback, primary is database)
let routeRequests = [];
// Store active dashboard sessions (simple in-memory session store)
// In production, consider using Redis or database for session storage
const dashboardSessions = new Map();

const PORT = process.env.PORT || 5000;

// Configure CORS - Allow all Vercel deployment URLs
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    // Allow localhost for development
    if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
      return callback(null, true);
    }
    
    // Allow all Vercel deployment URLs (production and preview deployments)
    if (origin.includes('vercel.app') || origin.includes('smart-roads')) {
      return callback(null, true);
    }
    
    // Default: allow the request
    callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  optionsSuccessStatus: 200
}));

app.use(bodyParser.json());

// Serve static files from React build in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/build')));
}

// Simple in-memory cache for search results (5 minute TTL)
const searchCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Place search (autocomplete)
app.get('/api/places/search', async (req, res) => {
  const { q } = req.query;
  
  if (!q) {
    return res.status(400).json({ error: 'Query parameter "q" is required' });
  }

  const queryLower = q.toLowerCase().trim();
  
  // Check cache first
  const cacheKey = queryLower;
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log(`Cache hit for: ${q}`);
    return res.json({ places: cached.results });
  }

  try {
    console.log(`Searching for: ${q}`);
    const results = await geocodingService.searchPlaces(q);
    
    // Cache the results
    searchCache.set(cacheKey, {
      results: results,
      timestamp: Date.now()
    });
    
    // Clean old cache entries (keep cache size reasonable)
    if (searchCache.size > 100) {
      const now = Date.now();
      for (const [key, value] of searchCache.entries()) {
        if (now - value.timestamp > CACHE_TTL) {
          searchCache.delete(key);
        }
      }
    }
    
    res.json({ places: results });
  } catch (error) {
    console.error('Place search error:', error);
    console.error('Error stack:', error.stack);
    
    // Return more detailed error in development, generic in production
    const errorMessage = process.env.NODE_ENV === 'development' 
      ? `Failed to search places: ${error.message}`
      : 'Failed to search places. Please try again.';
    
    res.status(500).json({ 
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Geocode a place name to coordinates
app.post('/api/geocode', async (req, res) => {
  const { placeName } = req.body;
  
  if (!placeName) {
    return res.status(400).json({ error: 'placeName is required' });
  }

  try {
    const result = await geocodingService.geocode(placeName);
    res.json(result);
  } catch (error) {
    console.error('Geocode error:', error);
    res.status(500).json({ error: 'Failed to geocode place' });
  }
});

// Refresh traffic data for a specific route
app.post('/api/routes/refresh-traffic', async (req, res) => {
  const { route, start, end } = req.body;
  
  if (!route || !start || !end) {
    return res.status(400).json({ error: 'route, start, and end are required' });
  }

  try {
    const now = new Date();
    const currentDayOfWeek = now.getDay();
    const currentHour = now.getHours();
    
    // Recalculate traffic data for route segments
    const routeReports = route.roadSegments.map((segment) => {
      let reports = [];
      
      // PRIORITY 1: Match by nearby coordinates
      if (segment.geometry && segment.geometry.length > 0) {
        const reportMap = new Map();
        for (const point of segment.geometry) {
          const nearbyReports = await roadReports.getReportsNearLocation(point.lat, point.lng, 200);
          nearbyReports.forEach(r => {
            const key = r.id || JSON.stringify(r);
            if (!reportMap.has(key)) {
              reportMap.set(key, r);
            }
          });
        }
        reports = Array.from(reportMap.values());
      }
      
      // PRIORITY 2: Match by roadId
      if (reports.length === 0) {
        reports = await roadReports.getReportsForRoad(segment.roadId);
      }
      
      // PRIORITY 3: Match by street name
      if (reports.length === 0 && segment.roadName) {
        reports = await roadReports.getReportsByStreetName(segment.roadName);
      }
      
      // Filter recent reports (within last 10 minutes)
      const recentReports = reports.filter(r => {
        const reportTime = new Date(r.timestamp);
        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
        return reportTime > tenMinutesAgo;
      });
      
      // Historical pattern
      let historicalPattern = null;
      let historicalMessage = null;
      
      if (recentReports.length === 0) {
        historicalPattern = await roadReports.getHistoricalPattern(
          segment.roadId,
          segment.roadName,
          currentDayOfWeek,
          currentHour
        );
        
        if (historicalPattern) {
          const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
          const lastReportDate = new Date(historicalPattern.lastReportDate);
          const weeksAgo = Math.floor((now - lastReportDate) / (7 * 24 * 60 * 60 * 1000));
          
          historicalMessage = `No live reports. Last ${dayNames[currentDayOfWeek]} at this time: ${historicalPattern.type} traffic (${historicalPattern.count} report${historicalPattern.count > 1 ? 's' : ''}${weeksAgo > 0 ? `, ${weeksAgo} week${weeksAgo > 1 ? 's' : ''} ago` : ''})`;
        }
      }
      
      return {
        ...segment,
        reports: reports,
        recentReports: recentReports,
        reportCount: reports.length,
        recentReportCount: recentReports.length,
        reportSummary: roadReports.getReportSummary(reports) || { light: 0, medium: 0, heavy: 0, blocked: 0, accident: 0 },
        recentReportSummary: roadReports.getReportSummary(recentReports) || { light: 0, medium: 0, heavy: 0, blocked: 0, accident: 0 },
        historicalPattern: historicalPattern,
        historicalMessage: historicalMessage,
        hasLiveData: recentReports.length > 0
      };
    }));
    
    // Calculate traffic summary
    const heavyCount = routeReports.filter(seg => seg.reportSummary && seg.reportSummary.heavy > 0).length;
    const mediumCount = routeReports.filter(seg => seg.reportSummary && seg.reportSummary.medium > 0).length;
    const lightCount = routeReports.filter(seg => seg.reportSummary && seg.reportSummary.light > 0).length;
    const blockedCount = routeReports.filter(seg => seg.reportSummary && seg.reportSummary.blocked > 0).length;
    
    const updatedRoute = {
      ...route,
      roadSegments: routeReports,
      hasFlaggedRoads: routeReports.some(seg => seg.reports.length > 0),
      trafficSummary: {
        heavy: heavyCount,
        medium: mediumCount,
        light: lightCount,
        blocked: blockedCount
      }
    };

    res.json({ route: updatedRoute });
  } catch (error) {
    console.error('Route traffic refresh error:', error);
    res.status(500).json({ error: 'Failed to refresh route traffic data' });
  }
});

// Get alternative routes for a destination (now uses coordinates)
app.post('/api/routes/alternatives', async (req, res) => {
  const { start, end } = req.body;
  
  if (!start || !end) {
    return res.status(400).json({ error: 'start and end coordinates are required' });
  }

  try {
    // Ensure we have lat/lng
    let startCoords = start.lat && start.lng ? start : await geocodingService.geocode(start.name || start);
    let endCoords = end.lat && end.lng ? end : await geocodingService.geocode(end.name || end);

    // Get all flagged roads
    const flaggedRoads = roadReports.getFlaggedRoads();
    
    // Generate alternative routes
    const routes = await routeService.generateRoutes(startCoords, endCoords, flaggedRoads);
  
  // Add report information to each route
  const now = new Date();
  const currentDayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const currentHour = now.getHours();
  
  const routesWithReports = routes.map(route => {
    const routeReports = route.roadSegments.map(segment => {
      let reports = [];
      
      // PRIORITY 1: Match by nearby coordinates (MOST RELIABLE - handles business names vs street names)
      // Check ALL points along the route segment, not just the first one
      if (segment.geometry && segment.geometry.length > 0) {
        const allNearbyReports = new Set(); // Use Set to avoid duplicates
        // Check every point in the segment geometry (increased radius to 200m for better matching)
        for (const point of segment.geometry) {
          const nearbyReports = roadReports.getReportsNearLocation(point.lat, point.lng, 200);
          nearbyReports.forEach(r => allNearbyReports.add(r.id || JSON.stringify(r))); // Track by ID or full object
        }
        // Convert Set back to array of actual report objects
        const reportMap = new Map();
        for (const point of segment.geometry) {
          const nearbyReports = roadReports.getReportsNearLocation(point.lat, point.lng, 200);
          nearbyReports.forEach(r => {
            const key = r.id || JSON.stringify(r);
            if (!reportMap.has(key)) {
              reportMap.set(key, r);
            }
          });
        }
        reports = Array.from(reportMap.values());
      }
      
      // PRIORITY 2: Match by roadId (exact match) - only if no coordinate matches
      if (reports.length === 0) {
        reports = roadReports.getReportsForRoad(segment.roadId);
      }
      
      // PRIORITY 3: Match by street name (fuzzy matching) - last resort
      // This helps when coordinates aren't available, but business names won't match street names
      if (reports.length === 0 && segment.roadName) {
        reports = roadReports.getReportsByStreetName(segment.roadName);
      }
      
      // Filter recent reports (within last 10 minutes)
      const recentReports = reports.filter(r => {
        const reportTime = new Date(r.timestamp);
        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
        return reportTime > tenMinutesAgo;
      });
      
      // If no recent reports, try historical data (same day of week, same time)
      let historicalPattern = null;
      let historicalMessage = null;
      
      if (recentReports.length === 0) {
        historicalPattern = roadReports.getHistoricalPattern(
          segment.roadId,
          segment.roadName,
          currentDayOfWeek,
          currentHour
        );
        
        if (historicalPattern) {
          const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
          const lastReportDate = new Date(historicalPattern.lastReportDate);
          const weeksAgo = Math.floor((now - lastReportDate) / (7 * 24 * 60 * 60 * 1000));
          
          historicalMessage = `No live reports. Last ${dayNames[currentDayOfWeek]} at this time: ${historicalPattern.type} traffic (${historicalPattern.count} report${historicalPattern.count > 1 ? 's' : ''}${weeksAgo > 0 ? `, ${weeksAgo} week${weeksAgo > 1 ? 's' : ''} ago` : ''})`;
        }
      }
      
      return {
        ...segment,
        reports: reports,
        recentReports: recentReports,
        reportCount: reports.length,
        recentReportCount: recentReports.length,
        reportSummary: roadReports.getReportSummary(reports) || { light: 0, medium: 0, heavy: 0, blocked: 0, accident: 0 },
        recentReportSummary: roadReports.getReportSummary(recentReports) || { light: 0, medium: 0, heavy: 0, blocked: 0, accident: 0 },
        historicalPattern: historicalPattern,
        historicalMessage: historicalMessage,
        hasLiveData: recentReports.length > 0
      };
    });
    
    // Calculate traffic summary
    const heavyCount = routeReports.filter(seg => seg.reportSummary && seg.reportSummary.heavy > 0).length;
    const mediumCount = routeReports.filter(seg => seg.reportSummary && seg.reportSummary.medium > 0).length;
    const lightCount = routeReports.filter(seg => seg.reportSummary && seg.reportSummary.light > 0).length;
    const blockedCount = routeReports.filter(seg => seg.reportSummary && seg.reportSummary.blocked > 0).length;
    
    return {
      ...route,
      roadSegments: routeReports,
      hasFlaggedRoads: routeReports.some(seg => seg.reports.length > 0),
      trafficSummary: {
        heavy: heavyCount,
        medium: mediumCount,
        light: lightCount,
        blocked: blockedCount
      }
    };
  });

    // Track route request for analytics (save to database and memory)
    const routeRequestData = {
      start: startCoords,
      end: endCoords,
      routeCount: routesWithReports.length,
      hasFlaggedRoads: routesWithReports.some(r => r.hasFlaggedRoads),
      timestamp: new Date()
    };
    
    // Save to database (async, don't wait)
    connectDB().then(() => {
      const routeRequest = new RouteRequest(routeRequestData);
      routeRequest.save().catch(err => {
        console.error('Error saving route request to database:', err.message);
      });
    }).catch(err => {
      console.error('Error connecting to database for route request:', err.message);
    });
    
    // Also save to memory (for immediate access)
    routeRequests.push({
      id: routeRequests.length + 1,
      ...routeRequestData,
      timestamp: routeRequestData.timestamp.toISOString()
    });
    
    // Keep only last 1000 requests to prevent memory issues
    if (routeRequests.length > 1000) {
      routeRequests = routeRequests.slice(-1000);
    }

    res.json({ 
      routes: routesWithReports,
      start: startCoords,
      end: endCoords
    });
  } catch (error) {
    console.error('Route generation error:', error);
    res.status(500).json({ error: 'Failed to generate routes' });
  }
});

// Get all road reports (read from database first, fallback to file)
app.get('/api/reports', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    // Build query
    let query = {};
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) {
        query.timestamp.$gte = new Date(startDate);
      }
      if (endDate) {
        // Add one day to include the entire end date
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.timestamp.$lte = end;
      }
    }
    
    // Try to get from database first
    await connectDB();
    const dbReports = await Report.find(query).sort({ timestamp: -1 }).lean();
    
    if (dbReports && dbReports.length > 0) {
      // Convert MongoDB documents to format expected by frontend
      const formattedReports = dbReports.map(report => ({
        id: report._id.toString(),
        roadId: report.roadId,
        roadName: report.roadName,
        reportType: report.reportType,
        userId: report.userId,
        lat: report.lat,
        lng: report.lng,
        timestamp: report.timestamp
      }));
      return res.json({ reports: formattedReports, source: 'database' });
    }
    
    // Fallback to file system if database is empty
    let fileReports = roadReports.getAllReports();
    
    // Apply date filtering to file reports if needed
    if (startDate || endDate) {
      fileReports = fileReports.filter(r => {
        const reportDate = new Date(r.timestamp);
        if (startDate && reportDate < new Date(startDate)) return false;
        if (endDate) {
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          if (reportDate > end) return false;
        }
        return true;
      });
    }
    
    res.json({ reports: fileReports, source: 'file' });
  } catch (error) {
    console.error('Error fetching reports from database:', error);
    // Fallback to file system on error
    try {
      const fileReports = roadReports.getAllReports();
      res.json({ reports: fileReports, source: 'file', error: 'Database unavailable, using file system' });
    } catch (fileError) {
      res.status(500).json({ error: 'Failed to fetch reports', details: error.message });
    }
  }
});

// Submit a road report (can use coordinates or roadId)
app.post('/api/reports', async (req, res) => {
  const { roadId, roadName, reportType, userId, lat, lng } = req.body;
  
  if (!reportType) {
    return res.status(400).json({ error: 'reportType is required' });
  }

  // If coordinates provided, find nearest road
  let finalRoadId = roadId;
  let finalRoadName = roadName;
  
  if (lat && lng && !roadId) {
    // Generate a road ID based on coordinates (rounded to ~100m precision)
    finalRoadId = `road_${Math.floor(lat * 100)}_${Math.floor(lng * 100)}`;
    try {
      // Prioritize road names for reporting (not place names)
      const locationInfo = await geocodingService.reverseGeocode(lat, lng, true);
      
      // Prioritize road name over place name
      let streetName = locationInfo.road || locationInfo.name;
      
      // If we still don't have a good road name, try to extract from address
      if (!streetName || streetName.includes('Location') || streetName.includes('Address') || !locationInfo.road) {
        const addressParts = locationInfo.address.split(',');
        // Look for road/street/avenue in address parts (prioritize KN, KG, DR patterns)
        const roadPart = addressParts.find(part => {
          const partLower = part.toLowerCase().trim();
          return partLower.includes('kn') || 
                 partLower.includes('kg') || 
                 partLower.includes('dr') ||
                 partLower.includes('road') || 
                 partLower.includes('street') || 
                 partLower.includes('avenue') ||
                 partLower.includes('ave') ||
                 partLower.includes('st');
        });
        streetName = roadPart ? roadPart.trim() : (locationInfo.road || locationInfo.name || `Road at ${lat.toFixed(4)}, ${lng.toFixed(4)}`);
      }
      
      finalRoadName = streetName;
    } catch (error) {
      console.error('Reverse geocode error:', error);
      finalRoadName = `Road at ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    }
  }

  if (!finalRoadId) {
    return res.status(400).json({ error: 'roadId or coordinates (lat, lng) are required' });
  }

  try {
    // Prepare report data
    const reportData = {
      roadId: finalRoadId,
      roadName: finalRoadName || `Road ${finalRoadId}`,
      reportType, // 'light', 'medium', 'heavy', 'blocked', 'accident'
      userId: userId || `user_${Date.now()}`,
      lat: lat || null,
      lng: lng || null,
      timestamp: new Date()
    };

    // Dual-write: Save to both database and file system
    let savedReport = null;
    let dbError = null;
    let fileError = null;

    // Try to save to database first
    try {
      await connectDB();
      const dbReport = new Report(reportData);
      savedReport = await dbReport.save();
      console.log('Report saved to MongoDB:', savedReport._id);
    } catch (error) {
      dbError = error;
      console.error('Error saving report to database:', error.message);
      // Continue to file system as fallback
    }

    // Also save to file system (for backup and migration period)
    try {
      const fileReport = roadReports.addReport({
        ...reportData,
        timestamp: reportData.timestamp.toISOString()
      });
      if (!savedReport) {
        // Use file report if database save failed
        savedReport = { ...fileReport, _id: fileReport.id };
      }
      console.log('Report saved to file system');
    } catch (error) {
      fileError = error;
      console.error('Error saving report to file system:', error.message);
    }

    // If both failed, return error
    if (dbError && fileError) {
      throw new Error('Failed to save report to both database and file system');
    }

    // Convert MongoDB document to plain object for response
    const reportResponse = savedReport.toObject ? savedReport.toObject() : savedReport;
    
    res.json({ 
      report: reportResponse, 
      message: 'Thank you! Your report will help other drivers.',
      savedTo: dbError ? 'file' : fileError ? 'database' : 'both'
    });
  } catch (error) {
    console.error('Error adding report:', error);
    console.error('Error details:', error.stack);
    res.status(500).json({ error: 'Failed to submit report', details: error.message });
  }
});

// Get reports for a specific road
app.get('/api/reports/road/:roadId', (req, res) => {
  const { roadId } = req.params;
  const reports = roadReports.getReportsForRoad(roadId);
  const summary = roadReports.getReportSummary(reports);
  
  res.json({ 
    roadId, 
    reports, 
    summary,
    totalReports: reports.length 
  });
});

// Reverse geocode coordinates to get street name (for traffic reporting)
app.post('/api/reports/reverse-geocode', async (req, res) => {
  const { lat, lng } = req.body;
  
  if (!lat || !lng) {
    return res.status(400).json({ error: 'lat and lng are required' });
  }

  try {
    // Prioritize road names for reporting (not place names)
    const locationInfo = await geocodingService.reverseGeocode(lat, lng, true);
    
    // Prioritize road name over place name for reporting
    let streetName = locationInfo.road || locationInfo.name;
    
    // If we still don't have a good road name, try to extract from address
    if (!streetName || streetName.includes('Location') || streetName.includes('Address') || !locationInfo.road) {
      const addressParts = locationInfo.address.split(',');
      // Look for road/street/avenue in address parts (prioritize KN, KG, DR patterns)
      const roadPart = addressParts.find(part => {
        const partLower = part.toLowerCase().trim();
        return partLower.includes('kn') || 
               partLower.includes('kg') || 
               partLower.includes('dr') ||
               partLower.includes('road') || 
               partLower.includes('street') || 
               partLower.includes('avenue') ||
               partLower.includes('ave') ||
               partLower.includes('st');
      });
      streetName = roadPart ? roadPart.trim() : (locationInfo.road || locationInfo.name || 'Current Location');
    }
    
    res.json({ 
      streetName: streetName,
      fullAddress: locationInfo.address,
      name: locationInfo.name,
      road: locationInfo.road, // Explicitly return road name
      coordinates: locationInfo.coordinates // Return coordinates
    });
  } catch (error) {
    console.error('Reverse geocode error:', error);
    res.status(500).json({ error: 'Failed to get street name' });
  }
});

// Feedback endpoint
app.post('/api/feedback', async (req, res) => {
  const { feedback, rating } = req.body;
  
  if (!feedback || !feedback.trim()) {
    return res.status(400).json({ error: 'Feedback is required' });
  }

  try {
    // Save to database
    await connectDB();
    const feedbackEntry = new Feedback({
      feedback: feedback.trim(),
      rating: rating || null,
      timestamp: new Date()
    });
    
    const savedFeedback = await feedbackEntry.save();
    
    // Also save to memory as backup
    feedbackStore.push({
      id: savedFeedback._id.toString(),
      feedback: savedFeedback.feedback,
      rating: savedFeedback.rating,
      timestamp: savedFeedback.timestamp
    });

    res.json({ 
      message: 'Thank you for your feedback!',
      id: savedFeedback._id.toString()
    });
  } catch (error) {
    console.error('Error saving feedback:', error);
    // Fallback to memory storage
    const feedbackEntry = {
      id: feedbackStore.length + 1,
      feedback: feedback.trim(),
      rating: rating || null,
      timestamp: new Date().toISOString()
    };
    feedbackStore.push(feedbackEntry);
    
    res.json({ 
      message: 'Thank you for your feedback!',
      id: feedbackEntry.id,
      note: 'Saved to memory (database unavailable)'
    });
  }
});

// Get feedback (for admin purposes - optional)
app.get('/api/feedback', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    // Build query
    let query = {};
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) {
        query.timestamp.$gte = new Date(startDate);
      }
      if (endDate) {
        // Add one day to include the entire end date
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.timestamp.$lte = end;
      }
    }
    
    // Try to get from database first
    await connectDB();
    const dbFeedback = await Feedback.find(query).sort({ timestamp: -1 }).lean();
    
    if (dbFeedback && dbFeedback.length > 0) {
      const formattedFeedback = dbFeedback.map(f => ({
        id: f._id.toString(),
        feedback: f.feedback,
        rating: f.rating,
        timestamp: f.timestamp
      }));
      return res.json({ 
        feedback: formattedFeedback,
        count: formattedFeedback.length,
        source: 'database'
      });
    }
    
    // Fallback to memory (with date filtering if needed)
    let filteredFeedback = feedbackStore;
    if (startDate || endDate) {
      filteredFeedback = feedbackStore.filter(f => {
        const feedbackDate = new Date(f.timestamp);
        if (startDate && feedbackDate < new Date(startDate)) return false;
        if (endDate) {
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          if (feedbackDate > end) return false;
        }
        return true;
      });
    }
    
    res.json({ 
      feedback: filteredFeedback,
      count: filteredFeedback.length,
      source: 'memory'
    });
  } catch (error) {
    console.error('Error fetching feedback from database:', error);
    // Fallback to memory on error
    res.json({ 
      feedback: feedbackStore,
      count: feedbackStore.length,
      source: 'memory',
      error: 'Database unavailable, using memory'
    });
  }
});

// Admin login endpoint - authenticate dashboard access
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  
  if (!password) {
    return res.status(400).json({ error: 'Password is required' });
  }
  
  const correctPassword = process.env.DASHBOARD_PASSWORD;
  
  if (!correctPassword) {
    return res.status(500).json({ error: 'Dashboard password not configured on server' });
  }
  
  if (password !== correctPassword) {
    return res.status(401).json({ error: 'Incorrect password' });
  }
  
  // Generate a simple session token
  const sessionToken = `dashboard_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  const expiresAt = Date.now() + (24 * 60 * 60 * 1000); // 24 hours
  
  // Store session
  dashboardSessions.set(sessionToken, {
    expiresAt: expiresAt,
    createdAt: Date.now()
  });
  
  // Clean up expired sessions periodically
  if (dashboardSessions.size > 100) {
    const now = Date.now();
    for (const [token, session] of dashboardSessions.entries()) {
      if (session.expiresAt < now) {
        dashboardSessions.delete(token);
      }
    }
  }
  
  res.json({ 
    success: true,
    token: sessionToken,
    expiresAt: expiresAt
  });
});

// Admin logout endpoint
app.post('/api/admin/logout', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (token && dashboardSessions.has(token)) {
    dashboardSessions.delete(token);
  }
  
  res.json({ success: true, message: 'Logged out successfully' });
});

// Middleware to verify dashboard session
function verifyDashboardSession(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  const session = dashboardSessions.get(token);
  
  if (!session) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
  
  if (session.expiresAt < Date.now()) {
    dashboardSessions.delete(token);
    return res.status(401).json({ error: 'Session expired' });
  }
  
  // Session is valid, continue
  next();
}

// Admin endpoint: Get comprehensive statistics
// Protected by backend authentication
app.get('/api/admin/stats', verifyDashboardSession, async (req, res) => {
  try {
    await connectDB();
    
    // Get data from database
    const [dbReports, dbFeedback, dbRouteRequests] = await Promise.all([
      Report.find().lean(),
      Feedback.find().lean(),
      RouteRequest.find().lean()
    ]);
    
    // Use database data if available, otherwise fallback to file/memory
    const allReports = dbReports && dbReports.length > 0 
      ? dbReports.map(r => ({
          id: r._id.toString(),
          roadId: r.roadId,
          roadName: r.roadName,
          reportType: r.reportType,
          userId: r.userId,
          lat: r.lat,
          lng: r.lng,
          timestamp: r.timestamp
        }))
      : roadReports.getAllReports();
    
    const allFeedback = dbFeedback && dbFeedback.length > 0
      ? dbFeedback.map(f => ({
          id: f._id.toString(),
          feedback: f.feedback,
          rating: f.rating,
          timestamp: f.timestamp
        }))
      : feedbackStore;
    
    const allRouteRequests = dbRouteRequests && dbRouteRequests.length > 0
      ? dbRouteRequests.map(r => ({
          id: r._id.toString(),
          start: r.start,
          end: r.end,
          routeCount: r.routeCount,
          hasFlaggedRoads: r.hasFlaggedRoads,
          timestamp: r.timestamp
        }))
      : routeRequests;
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  
  // Calculate route request statistics
  const recentRouteRequests = allRouteRequests.filter(r => new Date(r.timestamp) > oneDayAgo);
  const weeklyRouteRequests = allRouteRequests.filter(r => new Date(r.timestamp) > oneWeekAgo);
  const monthlyRouteRequests = allRouteRequests.filter(r => new Date(r.timestamp) > oneMonthAgo);
  
  // Calculate popular destinations
  const destinationCounts = {};
  allRouteRequests.forEach(req => {
    const dest = req.end.name || req.end.address || 'Unknown';
    destinationCounts[dest] = (destinationCounts[dest] || 0) + 1;
  });
  const popularDestinations = Object.entries(destinationCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({ name, count }));
  
  // Calculate statistics
  const stats = {
    // Traffic Reports
    reports: {
      total: allReports.length,
      byType: {
        light: allReports.filter(r => r.reportType === 'light').length,
        medium: allReports.filter(r => r.reportType === 'medium').length,
        heavy: allReports.filter(r => r.reportType === 'heavy').length,
        blocked: allReports.filter(r => r.reportType === 'blocked').length,
        accident: allReports.filter(r => r.reportType === 'accident').length
      },
      recent: allReports.filter(r => {
        const reportTime = new Date(r.timestamp);
        return reportTime > oneDayAgo;
      }).length,
      thisWeek: allReports.filter(r => {
        const reportTime = new Date(r.timestamp);
        return reportTime > oneWeekAgo;
      }).length,
      thisMonth: allReports.filter(r => {
        const reportTime = new Date(r.timestamp);
        return reportTime > oneMonthAgo;
      }).length,
      uniqueRoads: new Set(allReports.map(r => r.roadId || r.roadName)).size,
      lastReportTime: allReports.length > 0 
        ? allReports[allReports.length - 1].timestamp 
        : null
    },
    
    // Route Requests
    routes: {
      total: allRouteRequests.length,
      today: recentRouteRequests.length,
      thisWeek: weeklyRouteRequests.length,
      thisMonth: monthlyRouteRequests.length,
      averageRoutesPerRequest: allRouteRequests.length > 0
        ? (allRouteRequests.reduce((sum, r) => sum + r.routeCount, 0) / allRouteRequests.length).toFixed(1)
        : 0,
      requestsWithTraffic: allRouteRequests.filter(r => r.hasFlaggedRoads).length,
      popularDestinations: popularDestinations
    },
    
    // Feedback
    feedback: {
      total: allFeedback.length,
      recent: allFeedback.filter(f => {
        const feedbackTime = new Date(f.timestamp);
        return feedbackTime > oneDayAgo;
      }).length,
      thisWeek: allFeedback.filter(f => {
        const feedbackTime = new Date(f.timestamp);
        return feedbackTime > oneWeekAgo;
      }).length,
      averageRating: allFeedback.filter(f => f.rating).length > 0
        ? (allFeedback.filter(f => f.rating).reduce((sum, f) => sum + (f.rating || 0), 0) / allFeedback.filter(f => f.rating).length).toFixed(1)
        : null,
      withRating: allFeedback.filter(f => f.rating).length
    },
    
    // Overall Impact
    impact: {
      totalUsersHelped: allRouteRequests.length + allReports.length, // Approximate
      reportsToday: allReports.filter(r => {
        const reportTime = new Date(r.timestamp);
        return reportTime > oneDayAgo;
      }).length,
      routesToday: recentRouteRequests.length,
      activeRoads: new Set(allReports.map(r => r.roadId || r.roadName)).size
    },
    
    // Timestamps
    lastUpdated: now.toISOString(),
    dataSource: {
      reports: dbReports && dbReports.length > 0 ? 'database' : 'file',
      feedback: dbFeedback && dbFeedback.length > 0 ? 'database' : 'memory',
      routeRequests: dbRouteRequests && dbRouteRequests.length > 0 ? 'database' : 'memory'
    }
  };
  
  res.json(stats);
  } catch (error) {
    console.error('Error fetching admin stats:', error);
    // Fallback to file/memory if database fails
    const allReports = roadReports.getAllReports();
    const allFeedback = feedbackStore;
    const allRouteRequests = routeRequests;
    
    // Continue with same logic but using fallback data
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    
    const recentRouteRequests = allRouteRequests.filter(r => new Date(r.timestamp) > oneDayAgo);
    const weeklyRouteRequests = allRouteRequests.filter(r => new Date(r.timestamp) > oneWeekAgo);
    const monthlyRouteRequests = allRouteRequests.filter(r => new Date(r.timestamp) > oneMonthAgo);
    
    const destinationCounts = {};
    allRouteRequests.forEach(req => {
      const dest = req.end.name || req.end.address || 'Unknown';
      destinationCounts[dest] = (destinationCounts[dest] || 0) + 1;
    });
    const popularDestinations = Object.entries(destinationCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, count }));
    
    const stats = {
      reports: {
        total: allReports.length,
        byType: {
          light: allReports.filter(r => r.reportType === 'light').length,
          medium: allReports.filter(r => r.reportType === 'medium').length,
          heavy: allReports.filter(r => r.reportType === 'heavy').length,
          blocked: allReports.filter(r => r.reportType === 'blocked').length,
          accident: allReports.filter(r => r.reportType === 'accident').length
        },
        recent: allReports.filter(r => {
          const reportTime = new Date(r.timestamp);
          return reportTime > oneDayAgo;
        }).length,
        thisWeek: allReports.filter(r => {
          const reportTime = new Date(r.timestamp);
          return reportTime > oneWeekAgo;
        }).length,
        thisMonth: allReports.filter(r => {
          const reportTime = new Date(r.timestamp);
          return reportTime > oneMonthAgo;
        }).length,
        uniqueRoads: new Set(allReports.map(r => r.roadId || r.roadName)).size,
        lastReportTime: allReports.length > 0 
          ? allReports[allReports.length - 1].timestamp 
          : null
      },
      routes: {
        total: allRouteRequests.length,
        today: recentRouteRequests.length,
        thisWeek: weeklyRouteRequests.length,
        thisMonth: monthlyRouteRequests.length,
        averageRoutesPerRequest: allRouteRequests.length > 0
          ? (allRouteRequests.reduce((sum, r) => sum + r.routeCount, 0) / allRouteRequests.length).toFixed(1)
          : 0,
        requestsWithTraffic: allRouteRequests.filter(r => r.hasFlaggedRoads).length,
        popularDestinations: popularDestinations
      },
      feedback: {
        total: allFeedback.length,
        recent: allFeedback.filter(f => {
          const feedbackTime = new Date(f.timestamp);
          return feedbackTime > oneDayAgo;
        }).length,
        thisWeek: allFeedback.filter(f => {
          const feedbackTime = new Date(f.timestamp);
          return feedbackTime > oneWeekAgo;
        }).length,
        averageRating: allFeedback.filter(f => f.rating).length > 0
          ? (allFeedback.filter(f => f.rating).reduce((sum, f) => sum + (f.rating || 0), 0) / allFeedback.filter(f => f.rating).length).toFixed(1)
          : null,
        withRating: allFeedback.filter(f => f.rating).length
      },
      impact: {
        totalUsersHelped: allRouteRequests.length + allReports.length,
        reportsToday: allReports.filter(r => {
          const reportTime = new Date(r.timestamp);
          return reportTime > oneDayAgo;
        }).length,
        routesToday: recentRouteRequests.length,
        activeRoads: new Set(allReports.map(r => r.roadId || r.roadName)).size
      },
      lastUpdated: now.toISOString(),
      dataSource: {
        reports: 'file',
        feedback: 'memory',
        routeRequests: 'memory',
        error: 'Database unavailable, using fallback'
      }
    };
    
    res.json(stats);
  }
});

// MongoDB Connection Test Endpoint
app.get('/api/test/db', async (req, res) => {
  try {
    // Check if MONGODB_URI is set
    if (!process.env.MONGODB_URI) {
      return res.status(500).json({
        success: false,
        error: 'MONGODB_URI environment variable is not set',
        message: 'Please set MONGODB_URI in your environment variables'
      });
    }

    // Attempt to connect to MongoDB
    const mongoose = await connectDB();
    
    // Get connection status
    const connectionState = mongoose.connection.readyState;
    const states = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting'
    };

    // Get database info
    const dbName = mongoose.connection.db.databaseName;
    const collections = await mongoose.connection.db.listCollections().toArray();
    const collectionNames = collections.map(c => c.name);

    res.json({
      success: true,
      message: 'MongoDB connection successful!',
      connection: {
        state: states[connectionState] || 'unknown',
        readyState: connectionState,
        database: dbName,
        host: mongoose.connection.host,
        port: mongoose.connection.port
      },
      database: {
        name: dbName,
        collections: collectionNames,
        collectionCount: collectionNames.length
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('MongoDB test error:', error);
    res.status(500).json({
      success: false,
      error: 'MongoDB connection failed',
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      timestamp: new Date().toISOString()
    });
  }
});

// Serve React app for all non-API routes (production only)
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/build/index.html'));
  });
}

// Export for Vercel serverless functions
// Vercel expects the Express app to be exported directly
module.exports = app;

// For local development, start the server
// Only listen when running locally (not on Vercel)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    if (process.env.NODE_ENV === 'production') {
      console.log(`Production mode: Serving React app from /client/build`);
    }
  });
}

