// Road reports storage with file-based persistence and historical time-based matching
// Reports are saved to reports.json and loaded on server start

const fs = require('fs');
const path = require('path');
const os = require('os');

// On Vercel, use /tmp directory (writable but not persistent across deployments)
// In local development, use the data directory
const isVercel = process.env.VERCEL === '1' || process.env.VERCEL_ENV;
const REPORTS_FILE = isVercel 
  ? path.join('/tmp', 'reports.json')
  : path.join(__dirname, 'reports.json');

// Load reports from file or initialize with empty array
let reports = [];
let nextId = 1;

// Load existing reports from file
function loadReports() {
  try {
    if (fs.existsSync(REPORTS_FILE)) {
      const data = fs.readFileSync(REPORTS_FILE, 'utf8');
      if (data && data.trim()) {
        const parsed = JSON.parse(data);
        reports = Array.isArray(parsed.reports) ? parsed.reports : [];
        if (reports.length > 0) {
          const maxId = Math.max(...reports.map(r => (r.id || 0)));
          nextId = maxId + 1;
        } else {
          nextId = parsed.nextId || 1;
        }
      } else {
        reports = [];
        nextId = 1;
      }
    } else {
      reports = [];
      nextId = 1;
    }
  } catch (error) {
    console.error('Error loading reports from file:', error.message);
    reports = [];
    nextId = 1;
  }
}

// Save reports to file
function saveReports() {
  try {
    // Ensure directory exists
    const dir = path.dirname(REPORTS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    const data = {
      reports: Array.isArray(reports) ? reports : [],
      nextId: nextId,
      lastUpdated: new Date().toISOString()
    };
    fs.writeFileSync(REPORTS_FILE, JSON.stringify(data, null, 2), 'utf8');
    console.log(`Reports saved: ${reports.length} total reports to ${REPORTS_FILE}`);
  } catch (error) {
    console.error('Error saving reports to file:', error.message);
    console.error('File path:', REPORTS_FILE);
    console.error('Error stack:', error.stack);
    // On Vercel, file writes to /tmp should work, but log the error for debugging
  }
}

// Initialize: Load reports on module load
loadReports();

// Auto-save every 30 seconds to prevent data loss
setInterval(() => {
  saveReports();
}, 30000);

const roadReports = {
  getAllReports() {
    return reports;
  },

  getReportsForRoad(roadId) {
    return reports.filter(report => report.roadId === roadId);
  },

  // Get reports by street name (fuzzy matching)
  getReportsByStreetName(streetName) {
    if (!streetName) return [];
    const normalizedName = streetName.toLowerCase().trim();
    return reports.filter(report => {
      const reportName = (report.roadName || '').toLowerCase().trim();
      // Exact match
      if (reportName === normalizedName) return true;
      // Contains match (e.g., "KN 5 Road" matches "KN 5")
      if (reportName.includes(normalizedName) || normalizedName.includes(reportName)) return true;
      // Extract road codes (KN, KG, DR) and numbers for matching
      const reportCode = reportName.match(/(kn|kg|dr)\s*\d+/i);
      const searchCode = normalizedName.match(/(kn|kg|dr)\s*\d+/i);
      if (reportCode && searchCode && reportCode[0] === searchCode[0]) return true;
      return false;
    });
  },

  // Get reports near coordinates (within specified meters, default 200m for better matching)
  // Uses Haversine formula for accurate distance calculation
  getReportsNearLocation(lat, lng, maxDistanceMeters = 200) {
    return reports.filter(report => {
      if (!report.lat || !report.lng) return false;
      
      // Haversine formula for accurate distance calculation
      const R = 6371000; // Earth's radius in meters
      const lat1Rad = report.lat * Math.PI / 180;
      const lat2Rad = lat * Math.PI / 180;
      const deltaLatRad = (lat - report.lat) * Math.PI / 180;
      const deltaLngRad = (lng - report.lng) * Math.PI / 180;
      
      const a = Math.sin(deltaLatRad / 2) * Math.sin(deltaLatRad / 2) +
                Math.cos(lat1Rad) * Math.cos(lat2Rad) *
                Math.sin(deltaLngRad / 2) * Math.sin(deltaLngRad / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const distance = R * c; // Distance in meters
      
      return distance <= maxDistanceMeters;
    });
  },

  // Get historical reports for a specific day of week and time window
  // dayOfWeek: 0 (Sunday) to 6 (Saturday)
  // timeWindow: hour of day (0-23)
  // tolerance: minutes before/after the target time (default: 30 minutes)
  getHistoricalReports(roadId, dayOfWeek, timeWindow, toleranceMinutes) {
    if (toleranceMinutes === undefined) toleranceMinutes = 30;
    const now = new Date();
    const targetDay = dayOfWeek; // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    const targetHour = timeWindow; // 0-23
    
    return reports.filter(report => {
      const reportDate = new Date(report.timestamp);
      const reportDay = reportDate.getDay();
      const reportHour = reportDate.getHours();
      const reportMinutes = reportDate.getMinutes();
      
      // Match day of week
      if (reportDay !== targetDay) return false;
      
      // Match time window (within tolerance)
      const reportTimeInMinutes = reportHour * 60 + reportMinutes;
      const targetTimeInMinutes = targetHour * 60;
      const timeDiff = Math.abs(reportTimeInMinutes - targetTimeInMinutes);
      
      if (timeDiff > toleranceMinutes) return false;
      
      // Match road
      if (roadId && report.roadId !== roadId) {
        // Also try street name matching
        const reportName = (report.roadName || '').toLowerCase();
        const searchName = (roadId || '').toLowerCase();
        if (!reportName.includes(searchName) && !searchName.includes(reportName)) {
          return false;
        }
      }
      
      return true;
    });
  },

  // Get historical reports by street name for a specific day/time
  getHistoricalReportsByStreetName(streetName, dayOfWeek, timeWindow, toleranceMinutes) {
    if (toleranceMinutes === undefined) toleranceMinutes = 30;
    const now = new Date();
    const targetDay = dayOfWeek;
    const targetHour = timeWindow;
    
    return reports.filter(report => {
      const reportDate = new Date(report.timestamp);
      const reportDay = reportDate.getDay();
      const reportHour = reportDate.getHours();
      const reportMinutes = reportDate.getMinutes();
      
      // Match day of week
      if (reportDay !== targetDay) return false;
      
      // Match time window
      const reportTimeInMinutes = reportHour * 60 + reportMinutes;
      const targetTimeInMinutes = targetHour * 60;
      const timeDiff = Math.abs(reportTimeInMinutes - targetTimeInMinutes);
      
      if (timeDiff > toleranceMinutes) return false;
      
      // Match street name (fuzzy)
      if (!streetName) return false;
      const normalizedName = streetName.toLowerCase().trim();
      const reportName = (report.roadName || '').toLowerCase().trim();
      if (reportName === normalizedName) return true;
      if (reportName.includes(normalizedName) || normalizedName.includes(reportName)) return true;
      
      // Extract road codes
      const reportCode = reportName.match(/(kn|kg|dr)\s*\d+/i);
      const searchCode = normalizedName.match(/(kn|kg|dr)\s*\d+/i);
      if (reportCode && searchCode && reportCode[0] === searchCode[0]) return true;
      
      return false;
    });
  },

  getFlaggedRoads() {
    const roadMap = {};
    reports.forEach(report => {
      if (!roadMap[report.roadId]) {
        roadMap[report.roadId] = {
          roadId: report.roadId,
          roadName: report.roadName,
          reports: []
        };
      }
      roadMap[report.roadId].reports.push(report);
    });
    return Object.values(roadMap);
  },

  getReportSummary(reports) {
    const summary = {
      light: 0,
      medium: 0,
      heavy: 0,
      blocked: 0,
      accident: 0
    };
    reports.forEach(report => {
      if (summary[report.reportType] !== undefined) {
        summary[report.reportType]++;
      }
    });
    return summary;
  },

  addReport(report) {
    // Ensure coordinates are always included for better matching
    if (!report.lat || !report.lng) {
      console.warn('Report added without coordinates - matching may be less accurate:', report);
    }
    
    const newReport = {
      id: nextId++,
      ...report,
      timestamp: report.timestamp || new Date().toISOString()
    };
    reports.push(newReport);
    console.log(`New report added: ID=${newReport.id}, Type=${newReport.reportType}, Road=${newReport.roadName}, Coords=(${newReport.lat}, ${newReport.lng})`);
    saveReports(); // Save immediately
    return newReport;
  },

  // Get the most common report type from historical data
  getHistoricalPattern(roadId, streetName, dayOfWeek, timeWindow) {
    let historicalReports = [];
    
    // Try by roadId first
    if (roadId) {
      historicalReports = this.getHistoricalReports(roadId, dayOfWeek, timeWindow);
    }
    
    // Fallback to street name
    if (historicalReports.length === 0 && streetName) {
      historicalReports = this.getHistoricalReportsByStreetName(streetName, dayOfWeek, timeWindow);
    }
    
    if (historicalReports.length === 0) {
      return null;
    }
    
    // Get the most common report type
    const summary = this.getReportSummary(historicalReports);
    const types = ['blocked', 'heavy', 'medium', 'light', 'accident'];
    
    for (const type of types) {
      if (summary[type] > 0) {
        const timestamps = historicalReports.map(r => new Date(r.timestamp).getTime()).filter(t => !isNaN(t));
        const lastReportDate = timestamps.length > 0 
          ? new Date(Math.max(...timestamps)).toISOString()
          : new Date().toISOString();
        
        return {
          type: type,
          count: summary[type],
          totalReports: historicalReports.length,
          confidence: summary[type] / historicalReports.length,
          lastReportDate: lastReportDate
        };
      }
    }
    
    return null;
  }
};

module.exports = roadReports;
