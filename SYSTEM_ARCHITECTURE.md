# Smart Roads System: Architecture and Functionality Documentation

## Executive Summary

Smart Roads is a crowd-sourced intelligent traffic routing system designed for Kigali, Rwanda. The system combines real-time user-generated traffic reports with advanced route generation algorithms to provide drivers with optimal alternative routes that avoid traffic congestion. The platform operates as a Progressive Web App (PWA) with both web and mobile capabilities, featuring offline functionality and real-time traffic intelligence.

---

## 1. System Architecture

### 1.1 High-Level Architecture

The system follows a **client-server architecture** with the following components:

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────────┐
│   React Client  │ ◄─────► │  Express Server  │ ◄─────► │  MongoDB/File   │
│   (Frontend)    │   REST  │   (Backend API)  │   Data  │   (Storage)     │
└─────────────────┘         └──────────────────┘         └─────────────────┘
       │                              │
       │                              │
       ▼                              ▼
┌─────────────────┐         ┌──────────────────┐
│  Leaflet Maps   │         │ External APIs:   │
│  (Visualization)│         │ - OpenRouteService│
└─────────────────┘         │ - OSRM           │
                             │ - Nominatim (OSM)│
                             └──────────────────┘
```

### 1.2 Technology Stack

**Frontend:**
- React 18.2.0 (Component-based UI)
- Leaflet (Interactive maps)
- Axios (HTTP client)
- Progressive Web App (PWA) capabilities

**Backend:**
- Node.js with Express.js
- MongoDB (Primary database) with file system fallback
- Mongoose (ODM for MongoDB)

**External Services:**
- OpenRouteService API (Primary routing engine)
- OSRM (Open Source Routing Machine - fallback)
- OpenStreetMap Nominatim (Geocoding and reverse geocoding)

---

## 2. Core Functionality

### 2.1 Place-Based Search System

**Problem Solved:** Users don't need to know exact road names or addresses. They can search by landmarks, businesses, or popular places.

**Implementation:**
1. **Autocomplete Search** (`/api/places/search`)
   - Uses OpenStreetMap Nominatim API for real-world place search
   - Searches businesses, landmarks, buildings, and street names
   - Implements intelligent caching (5-minute TTL) to reduce API calls
   - Prioritizes Kigali-specific results for accuracy
   - Falls back to pre-configured popular places (Norrsken, CHUK, Nyabugogo, etc.)

2. **Geocoding** (`/api/geocode`)
   - Converts place names to coordinates (lat/lng)
   - Uses Nominatim with Rwanda country code filtering
   - Handles both specific addresses and landmark names

**Key Features:**
- Multi-strategy search (popular places + OSM search)
- Relevance scoring for result ranking
- Deduplication by place_id
- Rate limiting compliance (respects Nominatim usage policies)

### 2.2 Route Generation Algorithm

**Problem Solved:** Generate multiple alternative routes between two points, considering real road networks and traffic conditions.

**Implementation Flow:**

```
User Input (Start, End)
    ↓
Geocode to Coordinates
    ↓
Fetch Flagged Roads (with traffic reports)
    ↓
Generate Routes via OpenRouteService/OSRM
    ↓
Extract Road Segments with Geometry
    ↓
Match Traffic Reports to Road Segments
    ↓
Calculate Traffic Summary per Route
    ↓
Return Alternative Routes with Traffic Data
```

**Route Service Details:**

1. **Primary Method: OpenRouteService API**
   - Uses driving-car profile
   - Requests up to 5 alternative routes
   - Weight factor: 1.4 (encourages route diversity)
   - Extracts geometry, distance, duration, and step-by-step instructions

2. **Fallback Method: OSRM**
   - Uses public OSRM demo server (no API key required)
   - Generates up to 3 standard alternative routes
   - Creates additional routes using intermediate waypoints
   - Calculates perpendicular offsets to force route diversity

3. **Road Segment Extraction**
   - Parses route steps to extract individual road segments
   - Each segment includes:
     - Road ID (unique identifier)
     - Road name (from routing API or reverse geocoding)
     - Distance
     - Geometry (array of lat/lng coordinates)
     - Status (light/medium/heavy/blocked)

4. **Route Diversity Algorithm**
   - Generates intermediate waypoints at 1/3 and 2/3 of route distance
   - Creates perpendicular offsets (~1.5km) to simulate parallel roads
   - Filters routes to ensure minimum 500m distance difference
   - Prevents duplicate or too-similar routes

### 2.3 Traffic Report Matching System

**Problem Solved:** Accurately match user-submitted traffic reports to specific road segments in generated routes, even when road names don't match exactly.

**Three-Tier Matching Strategy:**

1. **Priority 1: Coordinate-Based Matching (Most Reliable)**
   - Uses Haversine formula for distance calculation
   - Checks all geometry points along each road segment
   - Matches reports within 200m radius of any segment point
   - Handles cases where business names don't match street names
   - **Why it works:** Reports are submitted with GPS coordinates, which are more reliable than road name matching

2. **Priority 2: Road ID Matching (Exact Match)**
   - Matches reports by exact roadId
   - Used when coordinate matching finds no results
   - Fast and precise for known roads

3. **Priority 3: Street Name Fuzzy Matching (Fallback)**
   - Normalizes road names (lowercase, trim)
   - Supports partial matching (e.g., "KN 5" matches "KN 5 Road")
   - Extracts road codes (KN, KG, DR) and numbers for matching
   - Used as last resort when coordinates and IDs don't match

**Report Prioritization:**
- **Recent Reports (Last 10 minutes):** Highest priority, shown as "live data"
- **Historical Patterns:** When no recent reports exist, shows historical data for same day of week and time
- **Time-based Matching:** Considers day of week (0-6) and hour of day (0-23) with 30-minute tolerance

### 2.4 Traffic Report Submission

**User Flow:**
1. User clicks "Use My Location" or manually enters coordinates
2. System reverse geocodes coordinates to get street name
3. User selects traffic status (Light/Medium/Heavy/Blocked/Accident)
4. Report submitted to server

**Backend Processing:**
1. **Coordinate Validation:** Ensures lat/lng are provided
2. **Road Identification:**
   - If coordinates provided: Generates roadId from rounded coordinates
   - Reverse geocodes to extract street name from address
   - Handles cases where address is generic
3. **Dual-Write Strategy:**
   - **Primary:** Saves to MongoDB (scalable, persistent)
   - **Fallback:** Saves to file system (reports.json)
   - Both writes attempted; system continues if one fails
4. **Report Structure:**
   ```javascript
   {
     roadId: "road_123_456",
     roadName: "KN 5 Road",
     reportType: "heavy",
     userId: "user_timestamp",
     lat: -1.9441,
     lng: 30.0619,
     timestamp: "2025-01-XX..."
   }
   ```

### 2.5 Historical Pattern Analysis

**Purpose:** Provide traffic predictions when no recent reports are available.

**Algorithm:**
1. Filters reports by:
   - Same day of week (Sunday=0, Monday=1, etc.)
   - Same hour of day (0-23)
   - Within 30-minute tolerance window
   - Same road (by ID or street name)

2. Calculates most common report type from historical data

3. Returns pattern with:
   - Traffic type (light/medium/heavy/blocked)
   - Report count
   - Confidence score (ratio of matching type to total reports)
   - Last report date

**Example Output:**
```
"No live reports. Last Monday at this time: heavy traffic (5 reports, 2 weeks ago)"
```

---

## 3. Data Storage Architecture

### 3.1 Hybrid Storage Strategy

The system uses a **dual-storage approach** for reliability and scalability:

**Primary: MongoDB**
- Collections: `reports`, `feedback`, `routeRequests`
- Indexed fields: roadId, roadName, timestamp, coordinates (lat/lng)
- Compound indexes for efficient queries
- Automatic timestamps (createdAt, updatedAt)

**Fallback: File System**
- JSON file: `reports.json`
- In-memory storage for feedback and route requests
- Auto-saves every 30 seconds
- Used when MongoDB is unavailable

**Benefits:**
- High availability (system works even if database fails)
- Data persistence during migration
- Easy backup and recovery
- No data loss during outages

### 3.2 Data Models

**Report Model:**
```javascript
{
  roadId: String (indexed),
  roadName: String (indexed),
  reportType: Enum ['light', 'medium', 'heavy', 'blocked', 'accident'],
  userId: String,
  lat: Number (required),
  lng: Number (required),
  timestamp: Date (indexed)
}
```

**Feedback Model:**
```javascript
{
  feedback: String,
  rating: Number (1-5, optional),
  timestamp: Date
}
```

**RouteRequest Model (Analytics):**
```javascript
{
  start: { name, lat, lng },
  end: { name, lat, lng },
  routeCount: Number,
  hasFlaggedRoads: Boolean,
  timestamp: Date
}
```

---

## 4. User Interface and Experience

### 4.1 Component Architecture

**Main Components:**
- `App.js`: Main application container, state management
- `RouteSearchForm`: Place-based search with autocomplete
- `RouteList`: Displays alternative routes with traffic summaries
- `RouteCard`: Individual route with expandable details
- `MapView`: Interactive map with Leaflet
- `TrafficReportForm`: Submit traffic reports
- `SmartReminder`: Proactive route suggestions based on schedules
- `ScheduleManager`: Manage recurring trips
- `Dashboard`: Admin analytics (password-protected)

### 4.2 Route Display Features

**Traffic Summary:**
- Visual badges: 🟢 Light / 🟡 Medium / 🔴 Heavy / ⛔ Blocked / 🚨 Accident
- Summary text: "Avoids 1 heavy road · 2 medium · 5 light"
- Collapsible road segment details
- Recent vs. historical report indicators

**Route Selection:**
- Click route card to highlight on map
- Step-by-step directions appear
- Visual route comparison (color-coded by traffic)
- Start/end markers on map

### 4.3 Progressive Web App (PWA) Features

- **Installable:** Can be added to home screen (iOS/Android)
- **Offline Support:**
  - View schedules and trip history
  - Basic navigation (cached data)
  - Requires internet for live reports and route generation
- **Service Worker:** Caches static assets
- **Responsive Design:** Works on mobile and desktop

---

## 5. Advanced Features

### 5.1 Smart Reminders System

**Purpose:** Proactively suggest routes based on user schedules and habits.

**Functionality:**
- Users can create recurring schedules (daily, weekly)
- System checks for active reminders every minute
- Shows reminder when scheduled time approaches
- Can use current location as start point
- Snooze functionality (1-hour snooze period)
- Trip history tracking for habit learning

**Storage:** LocalStorage (client-side, works offline)

### 5.2 Route Deviation Detection

**Purpose:** Automatically recalculate routes if user deviates from selected path.

**Implementation:**
- Monitors user's GPS position during navigation
- Calculates distance from route geometry
- Triggers recalculation when deviation > threshold
- Shows notification: "You've deviated from the route. Recalculating..."

### 5.3 Admin Dashboard

**Features:**
- Password-protected access
- Real-time statistics:
  - Total reports by type
  - Recent activity (today, this week, this month)
  - Route request analytics
  - Popular destinations
  - User feedback summary
- Date range filtering
- Data source indicators (database vs. file system)

---

## 6. API Endpoints

### 6.1 Public Endpoints

**GET `/api/places/search?q={query}`**
- Place autocomplete search
- Returns: Array of places with name, address, coordinates

**POST `/api/geocode`**
- Geocode place name to coordinates
- Body: `{ placeName: string }`
- Returns: `{ name, address, lat, lng }`

**POST `/api/routes/alternatives`**
- Generate alternative routes
- Body: `{ start: {name, lat, lng}, end: {name, lat, lng} }`
- Returns: Routes array with traffic data, road segments, geometry

**POST `/api/reports`**
- Submit traffic report
- Body: `{ lat, lng, reportType, roadName?, roadId? }`
- Returns: Saved report with confirmation message

**GET `/api/reports`**
- Get all reports (optional date filtering)
- Query params: `startDate`, `endDate`
- Returns: Reports array with source indicator

**POST `/api/feedback`**
- Submit user feedback
- Body: `{ feedback: string, rating?: number }`
- Returns: Confirmation with ID

### 6.2 Admin Endpoints

**GET `/api/admin/stats`**
- Comprehensive system statistics
- Returns: Reports, routes, feedback, and impact metrics

**GET `/api/feedback`**
- Get all feedback (optional date filtering)
- Query params: `startDate`, `endDate`

**GET `/api/test/db`**
- MongoDB connection test
- Returns: Connection status and database info

---

## 7. Performance Optimizations

### 7.1 Caching Strategy

**Search Results Cache:**
- 5-minute TTL (Time To Live)
- Maximum 100 cached entries
- Automatic cleanup of expired entries
- Reduces Nominatim API calls

**Route Caching:**
- Not implemented (routes are dynamic based on current traffic)
- Could be added for frequently requested routes

### 7.2 Database Indexing

**MongoDB Indexes:**
- Single field: `roadId`, `roadName`, `timestamp`, `lat`, `lng`
- Compound: `{roadId: 1, timestamp: -1}`, `{roadName: 1, timestamp: -1}`, `{lat: 1, lng: 1, timestamp: -1}`
- Enables fast queries for:
  - Reports by road
  - Time-based filtering
  - Location-based searches

### 7.3 Rate Limiting Compliance

- Respects Nominatim usage policy (1 request per second)
- Implements delays between API calls (100-200ms)
- User-Agent header required for Nominatim
- Handles API failures gracefully with fallbacks

---

## 8. Error Handling and Resilience

### 8.1 Fallback Mechanisms

**Route Generation:**
1. Try OpenRouteService (if API key configured)
2. Fallback to OSRM demo server
3. Last resort: Generate fallback routes with reverse geocoding

**Data Storage:**
1. Try MongoDB (primary)
2. Fallback to file system
3. In-memory storage as last resort

**Geocoding:**
1. Try Nominatim API
2. Fallback to popular places database
3. Generic location as final fallback

### 8.2 Error Recovery

- All external API calls wrapped in try-catch
- User-friendly error messages
- Detailed logging for debugging
- System continues operating even if some features fail

---

## 9. Security Considerations

### 9.1 Current Implementation

- CORS configuration for allowed origins
- Password protection for admin dashboard (session-based)
- Input validation on API endpoints
- No user authentication (anonymous reports)

### 9.2 Future Enhancements (Noted in Code)

- User authentication and profiles
- API rate limiting per user
- Data encryption for sensitive information
- Secure API key storage

---

## 10. Scalability and Future Improvements

### 10.1 Current Limitations

- File system storage not suitable for high traffic
- In-memory route request storage (limited to 1000 entries)
- No real-time updates (polling-based)
- Single server deployment

### 10.2 Proposed Enhancements (From README)

- Real-time WebSocket updates for live traffic
- Enhanced offline map caching
- App store publishing (Play Store, App Store)
- User authentication and profiles
- Machine learning for traffic prediction

---

## 11. Research Contributions

### 11.1 Novel Approaches

1. **Three-Tier Traffic Matching:** Coordinate-based matching as primary method solves the problem of business names vs. street names
2. **Hybrid Storage:** Dual-write strategy ensures high availability
3. **Historical Pattern Analysis:** Time-based pattern matching for traffic prediction
4. **Place-Based Routing:** Eliminates need for users to know road names

### 11.2 Technical Innovations

1. **Route Diversity Algorithm:** Perpendicular offset waypoints create genuinely different routes
2. **Coordinate-First Matching:** More reliable than name-based matching
3. **Progressive Enhancement:** Works offline, installable, responsive
4. **Multi-API Fallback:** Ensures route generation always works

---

## 12. System Metrics and Analytics

### 12.1 Tracked Metrics

- Total traffic reports (by type)
- Route requests (total, with traffic flags)
- Popular destinations
- User feedback (with ratings)
- Active roads (unique roads with reports)
- Recent activity (today, this week, this month)

### 12.2 Data Sources

- Reports: MongoDB (primary) or file system (fallback)
- Feedback: MongoDB (primary) or memory (fallback)
- Route Requests: MongoDB (primary) or memory (fallback)

---

## 13. Conclusion

The Smart Roads system demonstrates a practical implementation of crowd-sourced traffic intelligence with several innovative features:

1. **Accessibility:** Place-based search makes the system usable without road name knowledge
2. **Reliability:** Multi-tier fallbacks ensure system availability
3. **Intelligence:** Historical pattern analysis provides predictions when live data is unavailable
4. **Accuracy:** Coordinate-based matching ensures reports are correctly associated with routes
5. **User Experience:** PWA capabilities, offline support, and smart reminders enhance usability

The system is production-ready for Kigali, Rwanda, with clear paths for scaling and enhancement.

---

## References

- OpenRouteService API: https://openrouteservice.org/
- OSRM: http://project-osrm.org/
- OpenStreetMap Nominatim: https://nominatim.openstreetmap.org/
- Leaflet Maps: https://leafletjs.com/
- React: https://reactjs.org/
- MongoDB: https://www.mongodb.com/

---

**Document Version:** 1.0  
**Last Updated:** January 2025  
**Author:** System Analysis  
**Project:** Smart Roads - Rwanda

