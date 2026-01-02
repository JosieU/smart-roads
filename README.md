# Rwanda Smart Routes 🛣️

A crowd-powered traffic routing application for Kigali, Rwanda. Find the best routes with real-time traffic reports from the community.

**Available as:** Web App (browser) + Mobile App (installable on iOS/Android)

## Features

### 🗺️ Place-Based Search
-Search by places like "Norrsken", "CHUK", "Nyabugogo", "road name"
- Autocomplete suggestions with popular Kigali locations
- Geocoding converts place names to coordinates automatically

### 🚗 Smart Route Finding
- **Alternative Routes**: Get over 1 road options trafiic analysis
- **Traffic Summary**: See at a glance - "Avoids 1 heavy road · 2 medium · 5 light"
- **Route Selection**: Click any route to see step-by-step directions
- **Real-time Reports**: View recent traffic reports (last 10 minutes) or historical data

### 📊 Detailed Road Information
- **Status Badges**: 🟢 Light / 🟡 Medium / 🔴 Heavy / ⛔ Blocked
- **Human-Readable Reports**: 
  - "3 people reported heavy in the last 10 minutes"
  - "Historically medium at this time"
- **Collapsible Details**: Expand to see each road segment with full report information

### 🗺️ Map Visualization
- Two-column layout: Routes list on left, map on right
- Visual route comparison with color-coded traffic status
- Selected route highlighting
- Start/end markers

### 📢 Traffic Reporting
- Report traffic conditions at any location
- Place-based reporting (no need to know road names)
- Four status options: Light, Medium, Heavy, Blocked
- Instant feedback after submission

## Installation

1. **Install Node.js** (if not already installed)
   - Download from https://nodejs.org/ (LTS version)
   - See `SETUP.md` for detailed instructions

2. **Install dependencies:**
```bash
npm run install-all
```

Or install separately:
```bash
# Install server dependencies
npm install

# Install client dependencies
cd client && npm install
```

## Running the Application

### Development Mode (runs both server and client)
```bash
npm run dev
```

### Run Separately

**Server only:**
```bash
npm run server
```

**Client only:**
```bash
npm run client
```

The application will be available at:
- Frontend: http://localhost:3000
- Backend API: http://localhost:5000

## API Endpoints

### GET `/api/places/search?q={query}`
Search for places (autocomplete).

**Response:**
```json
{
  "places": [
    {
      "id": "norrsken",
      "name": "Norrsken House Kigali",
      "address": "KG 7 Ave, Kigali",
      "lat": -1.9441,
      "lng": 30.0619
    }
  ]
}
```

### POST `/api/routes/alternatives`
Get alternative routes using coordinates.

**Request:**
```json
{
  "start": {
    "name": "Norrsken House Kigali",
    "lat": -1.9441,
    "lng": 30.0619
  },
  "end": {
    "name": "CHUK",
    "lat": -1.9500,
    "lng": 30.0583
  }
}
```

**Response:**
```json
{
  "routes": [
    {
      "id": "route_1",
      "name": "Route 1",
      "eta_minutes": 22,
      "distance_km": 7.4,
      "hasFlaggedRoads": true,
      "trafficSummary": {
        "heavy": 1,
        "medium": 2,
        "light": 5,
        "blocked": 0
      },
      "roadSegments": [
        {
          "roadId": "road_1",
          "roadName": "KN 5 Road",
          "distance": "2.1 km",
          "status": "heavy",
          "reports": [...],
          "reportCount": 3,
          "recentReportCount": 3,
          "reportSummary": { "heavy": 3 },
          "recentReportSummary": { "heavy": 3 }
        }
      ],
      "steps": [
        "Start at Norrsken House Kigali",
        "Head east on KN 5 Road for 2.1 km",
        "Turn right onto KG 11 Ave",
        "..."
      ],
      "geometry": [...]
    }
  ],
  "start": {...},
  "end": {...}
}
```

### POST `/api/reports`
Submit a traffic report (can use coordinates or roadId).

**Request:**
```json
{
  "lat": -1.9441,
  "lng": 30.0619,
  "reportType": "heavy",
  "roadName": "Road near Norrsken House"
}
```

### GET `/api/reports/road/:roadId`
Get all reports for a specific road.

## Project Structure

```
smart-roads/
├── server/
│   ├── index.js                    # Express server
│   ├── data/
│   │   └── roadReports.js          # Road reports data management
│   └── services/
│       ├── routeService.js        # Route generation with directions
│       └── geocodingService.js    # Place search and geocoding
├── client/
│   ├── src/
│   │   ├── App.js                 # Main app component
│   │   └── components/
│   │       ├── Header.js           # App header
│   │       ├── RouteSearchForm.js  # Place-based search
│   │       ├── RouteList.js        # Routes container
│   │       ├── RouteCard.js        # Individual route with details
│   │       ├── MapView.js          # Map visualization
│   │       ├── TrafficReportForm.js # Report submission
│   │       └── StatusBadge.js      # Traffic status indicator
│   └── public/
└── package.json
```

## Technologies Used

- **Backend**: Node.js, Express
- **Frontend**: React
- **Styling**: CSS3 with modern, responsive design
- **Architecture**: RESTful API with coordinate-based routing

## Documentation

This project includes comprehensive documentation covering developer documentation, technical architecture, and user guides:

### 📚 Available Documentation

- **[SYSTEM_ARCHITECTURE.md](SYSTEM_ARCHITECTURE.md)** - Complete technical architecture documentation including:
  - System architecture and design patterns
  - Core functionality and algorithms
  - Data storage architecture
  - API endpoints and integration details
  - Performance optimizations
  - Error handling and resilience strategies

- **[OFFLINE_FEATURES.md](OFFLINE_FEATURES.md)** - Detailed guide on offline capabilities and Progressive Web App (PWA) features

- **Developer Documentation** (in README.md):
  - Installation and setup instructions
  - Project structure and file organization
  - API endpoint documentation with examples
  - Development workflow and running instructions
  - Environment configuration

- **User Guides**:
  - In-app help modal with step-by-step instructions
  - Feature usage guides (route finding, traffic reporting, smart reminders)
  - PWA installation instructions for iOS/Android
  - Offline vs. online functionality guide

- **Technical Architecture**:
  - See [SYSTEM_ARCHITECTURE.md](SYSTEM_ARCHITECTURE.md) for detailed system design, algorithms, data models, and architectural decisions

For a complete overview of the system's technical implementation, algorithms, and architecture, please refer to [SYSTEM_ARCHITECTURE.md](SYSTEM_ARCHITECTURE.md).

## Key Features Explained

### Place-Based Search
Users don't need to know road names. They search for places like "Norrsken" or "CHUK", and the system:
1. Finds the place using geocoding
2. Converts to coordinates
3. Routes between coordinates
4. Maps coordinates back to road segments for traffic reports
5.can also search by road names

### Route Selection & Directions
- Click any route card to select it
- Selected route is highlighted on the map
- Step-by-step directions appear below the route card
- Directions include road names and traffic status

### Traffic Reports
- Reports can be submitted using place names or coordinates
- System automatically maps coordinates to nearest road
- Recent reports (last 10 minutes) are prioritized
- Historical data shown when no recent reports available

## Deployment

The app is configured as a Progressive Web App (PWA) and can be:
- **Deployed to Vercel/Netlify** for web access
- **Installed on mobile devices** (iOS/Android) from browser
- **Works offline** for basic features (schedules, trip history)

See `DEPLOYMENT_CHECKLIST.md` for detailed deployment instructions.

## Future Enhancements

- [ ] User authentication and profiles
- [ ] Database integration (PostgreSQL/MongoDB) for scalable storage
- [ ] Real-time WebSocket updates for live traffic
- [ ] App store publishing (Play Store, App Store)
- [ ] Enhanced offline map caching

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

Copyright (c) 2025 Josiane Umunezero
