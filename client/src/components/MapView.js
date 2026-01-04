import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './MapView.css';

// Fix for default marker icons in Leaflet with React
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

function MapView({ routes, selectedRoute, startPlace, endPlace, onWeatherChange, onRouteDeviation }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);
  const polylinesRef = useRef([]);
  const currentLocationMarkerRef = useRef(null);
  const watchIdRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [isTracking, setIsTracking] = useState(false);
  const [locationError, setLocationError] = useState(null);
  const [onRouteStatus, setOnRouteStatus] = useState(null);
  const tileLayerRef = useRef(null);
  
  // Weather state (for passing to parent)
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState(null);
  const [weatherData, setWeatherData] = useState(null);
  const [showLegend, setShowLegend] = useState(true);

  // Fetch weather for a location
  const fetchWeather = async (lat, lon) => {
    const API_KEY = process.env.REACT_APP_OPENWEATHER_API_KEY;
    if (!API_KEY) {
      return;
    }

    try {
      setWeatherLoading(true);
      setWeatherError(null);
      if (onWeatherChange) {
        onWeatherChange({ loading: true, error: null, data: null });
      }
      
      const response = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric`
      );
      
      if (!response.ok) {
        throw new Error('Weather request failed');
      }
      
      const data = await response.json();
      setWeatherData(data);
      if (onWeatherChange) {
        onWeatherChange({ loading: false, error: null, data });
      }
    } catch (err) {
      setWeatherError(err.message);
      if (onWeatherChange) {
        onWeatherChange({ loading: false, error: err.message, data: null });
      }
    } finally {
      setWeatherLoading(false);
    }
  };

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    // Default center for Kigali, Rwanda
    const defaultCenter = startPlace 
      ? [startPlace.lat, startPlace.lng] 
      : [-1.9441, 30.0619];
    const defaultZoom = 13;
    
    // Fetch initial weather for default center
    if (!startPlace) {
      fetchWeather(defaultCenter[0], defaultCenter[1]);
    }

    // Create map
    const map = L.map(mapRef.current, {
      center: defaultCenter,
      zoom: defaultZoom,
      scrollWheelZoom: true,
    });

    // Add OSM road tiles (shows street names, businesses, etc.)
    tileLayerRef.current = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    mapInstanceRef.current = map;
    setMapReady(true);

    // Cleanup
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      // Stop location tracking on unmount
      if (watchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []); // Only run once on mount

  // Calculate distance between two points using Haversine formula (in meters)
  const haversineDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371000; // Earth radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // Calculate distance from point to line segment (for route checking)
  const distanceToRoute = (point, routeGeometry, startPlace, endPlace) => {
    if (!routeGeometry || routeGeometry.length < 2) return Infinity;

    // First, check if user is near start or end point (within 300m) - consider them on route
    // This accounts for GPS accuracy and geocoding differences
    if (startPlace) {
      const distToStart = haversineDistance(point.lat, point.lng, startPlace.lat, startPlace.lng);
      if (distToStart <= 300) {
        return distToStart; // Close to start, consider on route
      }
    }
    
    if (endPlace) {
      const distToEnd = haversineDistance(point.lat, point.lng, endPlace.lat, endPlace.lng);
      if (distToEnd <= 300) {
        return distToEnd; // Close to end, consider on route
      }
    }

    // Also check if user is near the first or last point of the route geometry
    // This handles cases where geocoded start differs from route geometry start
    if (routeGeometry.length > 0) {
      const firstPoint = routeGeometry[0];
      const lastPoint = routeGeometry[routeGeometry.length - 1];
      
      const distToFirst = haversineDistance(point.lat, point.lng, firstPoint.lat, firstPoint.lng);
      if (distToFirst <= 300) {
        return distToFirst; // Close to route start point
      }
      
      const distToLast = haversineDistance(point.lat, point.lng, lastPoint.lat, lastPoint.lng);
      if (distToLast <= 300) {
        return distToLast; // Close to route end point
      }
    }

    // Calculate distance to route segments
    let minDistance = Infinity;
    for (let i = 0; i < routeGeometry.length - 1; i++) {
      const p1 = routeGeometry[i];
      const p2 = routeGeometry[i + 1];
      
      // Calculate distance from point to line segment using Haversine
      const distToP1 = haversineDistance(point.lat, point.lng, p1.lat, p1.lng);
      const distToP2 = haversineDistance(point.lat, point.lng, p2.lat, p2.lng);
      
      // Simple approach: use the minimum distance to either endpoint or calculate perpendicular distance
      // For simplicity and accuracy, use the minimum distance to the segment endpoints
      // This is more accurate than the previous approximation
      const segmentDistance = Math.min(distToP1, distToP2);
      
      // Also check perpendicular distance (more complex but more accurate)
      const A = point.lat - p1.lat;
      const B = point.lng - p1.lng;
      const C = p2.lat - p1.lat;
      const D = p2.lng - p1.lng;

      const dot = A * C + B * D;
      const lenSq = C * C + D * D;
      let param = -1;
      if (lenSq !== 0) param = dot / lenSq;

      let perpDistance;
      if (param < 0) {
        perpDistance = distToP1;
      } else if (param > 1) {
        perpDistance = distToP2;
      } else {
        // Point projects onto the segment - calculate perpendicular distance
        const projLat = p1.lat + param * C;
        const projLng = p1.lng + param * D;
        perpDistance = haversineDistance(point.lat, point.lng, projLat, projLng);
      }
      
      const distance = Math.min(segmentDistance, perpDistance);
      
      if (distance < minDistance) {
        minDistance = distance;
      }
    }
    return minDistance;
  };

  // Track deviation for auto-recalculation
  const deviationTimerRef = useRef(null);
  const lastRecalculationRef = useRef(null);
  const deviationThreshold = 200; // 200 meters - detect when user takes different road
  const deviationDuration = 5000; // 5 seconds of sustained deviation triggers recalculation (faster response)

  // Auto-start tracking when a route is selected (if location permission available)
  // This enables automatic deviation detection when user takes a different road
  useEffect(() => {
    if (selectedRoute && routes.length > 0 && !isTracking && navigator.geolocation) {
      const options = {
        enableHighAccuracy: false,
        timeout: 20000,
        maximumAge: 60000
      };
      
      setLocationError(null);
      const watchId = navigator.geolocation.watchPosition(
        (position) => {
          setCurrentLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy
          });
          setIsTracking(true);
        },
        (err) => {
          // Don't show error if permission not granted - user can manually start tracking
          if (err.code !== 1) { // 1 = PERMISSION_DENIED
            setLocationError(err.message);
          }
        },
        options
      );
      
      watchIdRef.current = watchId;
      
      // Cleanup on unmount or when route changes
      return () => {
        if (watchIdRef.current === watchId) {
          navigator.geolocation.clearWatch(watchId);
          watchIdRef.current = null;
        }
      };
    }
  }, [selectedRoute, routes.length, isTracking]);

  // Check if user is on route and detect deviation
  useEffect(() => {
    if (!currentLocation || !selectedRoute || routes.length === 0 || !endPlace) {
      setOnRouteStatus(null);
      if (deviationTimerRef.current) {
        clearTimeout(deviationTimerRef.current);
        deviationTimerRef.current = null;
      }
      return;
    }

    const selectedRouteData = routes.find(r => r.id === selectedRoute);
    if (!selectedRouteData || !selectedRouteData.geometry) {
      setOnRouteStatus(null);
      if (deviationTimerRef.current) {
        clearTimeout(deviationTimerRef.current);
        deviationTimerRef.current = null;
      }
      return;
    }

    const distance = distanceToRoute(currentLocation, selectedRouteData.geometry, startPlace, endPlace);
    // Increased threshold to 200m to account for:
    // - GPS accuracy variations (typically 5-20m, but can be up to 100m in urban areas)
    // - Geocoding differences between manual entry and actual location
    // - Route geometry starting point differences
    // If user is at start/end (within 300m), they're considered on route
    const threshold = 200; // 200 meters threshold for "on route" status

    if (distance <= threshold) {
      setOnRouteStatus({ onRoute: true, distance: Math.round(distance) });
      // Clear deviation timer if user is back on route
      if (deviationTimerRef.current) {
        clearTimeout(deviationTimerRef.current);
        deviationTimerRef.current = null;
      }
    } else {
      setOnRouteStatus({ onRoute: false, distance: Math.round(distance) });
      
      // If significantly deviated (more than deviationThreshold), start timer for recalculation
      // This detects when user takes a different road than suggested
      // Works with any currentLocation (auto-tracking or manual tracking)
      if (distance > deviationThreshold && onRouteDeviation) {
        // Prevent multiple recalculations in short time (wait at least 20 seconds between recalculations)
        const now = Date.now();
        if (lastRecalculationRef.current && (now - lastRecalculationRef.current) < 20000) {
          return; // Too soon since last recalculation
        }

        // Clear any existing timer
        if (deviationTimerRef.current) {
          clearTimeout(deviationTimerRef.current);
        }

        // Set timer to trigger recalculation after sustained deviation
        deviationTimerRef.current = setTimeout(() => {
          // Check again if still deviated
          const currentDistance = distanceToRoute(currentLocation, selectedRouteData.geometry, startPlace, endPlace);
          if (currentDistance > deviationThreshold && onRouteDeviation) {
            // Trigger recalculation from current location
            onRouteDeviation({
              currentLocation: {
                lat: currentLocation.lat,
                lng: currentLocation.lng,
                name: 'Current Location',
                address: `Lat: ${currentLocation.lat.toFixed(4)}, Lng: ${currentLocation.lng.toFixed(4)}`
              },
              destination: endPlace,
              distance: Math.round(currentDistance)
            });
            lastRecalculationRef.current = Date.now();
          }
          deviationTimerRef.current = null;
        }, deviationDuration);
      }
    }
  }, [currentLocation, selectedRoute, routes, startPlace, endPlace, onRouteDeviation]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (deviationTimerRef.current) {
        clearTimeout(deviationTimerRef.current);
      }
    };
  }, []);

  // Start/stop location tracking
  const toggleLocationTracking = () => {
    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported by your browser');
      return;
    }

    if (isTracking) {
      // Stop tracking
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      setIsTracking(false);
      setLocationError(null);
    } else {
      // Start tracking
      setLocationError(null);
      
      // Use less strict options for better reliability
      // Start with network-based location (faster), watchPosition will improve accuracy over time
      const options = {
        enableHighAccuracy: false, // Start with false for faster initial location
        timeout: 20000, // Increased to 20 seconds
        maximumAge: 60000 // Allow 1-minute old cached location (faster initial response)
      };

      watchIdRef.current = navigator.geolocation.watchPosition(
        (position) => {
          const newLocation = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy
          };
          setCurrentLocation(newLocation);
          setLocationError(null);
          // Update weather for current location
          fetchWeather(newLocation.lat, newLocation.lng);
          
          // After first successful location, upgrade to high accuracy for better tracking
          if (watchIdRef.current !== null && !options.enableHighAccuracy) {
            navigator.geolocation.clearWatch(watchIdRef.current);
            const highAccuracyOptions = {
              enableHighAccuracy: true,
              timeout: 20000,
              maximumAge: 10000 // Allow 10-second old cached high-accuracy location
            };
            watchIdRef.current = navigator.geolocation.watchPosition(
              (pos) => {
                setCurrentLocation({
                  lat: pos.coords.latitude,
                  lng: pos.coords.longitude,
                  accuracy: pos.coords.accuracy
                });
                setLocationError(null);
                fetchWeather(pos.coords.latitude, pos.coords.longitude);
              },
              (err) => {
                // If high accuracy fails, continue with network location
              },
              highAccuracyOptions
            );
          }
        },
        (error) => {
          let errorMessage = 'Unable to get your location';
          switch(error.code) {
            case error.PERMISSION_DENIED:
              errorMessage = 'Location access denied. Please enable location permissions in your browser settings.';
              break;
            case error.POSITION_UNAVAILABLE:
              errorMessage = 'Location information unavailable. Please check your GPS/WiFi connection.';
              break;
            case error.TIMEOUT:
              errorMessage = 'Location request timed out. Please try again.';
              break;
          }
          setLocationError(errorMessage);
          setIsTracking(false);
        },
        options
      );

      setIsTracking(true);
    }
  };

  // Update current location marker on map
  useEffect(() => {
    if (!mapInstanceRef.current || !mapReady || !currentLocation) return;

    const map = mapInstanceRef.current;

    // Remove existing current location marker
    if (currentLocationMarkerRef.current) {
      currentLocationMarkerRef.current.remove();
    }

    // Create "you are here" marker (blue pulsing dot like WhatsApp)
    const currentLocationIcon = L.divIcon({
      className: 'custom-marker current-location-icon',
      html: '<div class="location-dot"></div><div class="location-pulse"></div>',
      iconSize: [20, 20],
      iconAnchor: [10, 10],
    });

    currentLocationMarkerRef.current = L.marker(
      [currentLocation.lat, currentLocation.lng],
      { 
        icon: currentLocationIcon,
        zIndexOffset: 1000 // Always on top
      }
    )
      .addTo(map)
      .bindPopup(`<strong>You are here</strong><br />Accuracy: ±${Math.round(currentLocation.accuracy)}m`);

    // Optionally center map on user location (commented out to avoid jarring)
    // map.setView([currentLocation.lat, currentLocation.lng], map.getZoom());
  }, [currentLocation, mapReady]);

  // Update map when start/end places change
  useEffect(() => {
    if (!mapInstanceRef.current || !startPlace) return;

    const map = mapInstanceRef.current;
    map.setView([startPlace.lat, startPlace.lng], 13);
  }, [startPlace]);

  // Update markers
  useEffect(() => {
    if (!mapInstanceRef.current || !mapReady) return;

    const map = mapInstanceRef.current;

    // Clear existing markers (except current location)
    markersRef.current.forEach(marker => marker.remove());
    markersRef.current = [];

    // Add start marker
    if (startPlace) {
      const startIcon = L.divIcon({
        className: 'custom-marker start-marker-icon',
        html: '<div class="marker-pin start-pin"></div><span class="marker-label">Start</span>',
        iconSize: [30, 30],
        iconAnchor: [15, 30],
      });

      const startMarker = L.marker([startPlace.lat, startPlace.lng], { icon: startIcon })
        .addTo(map)
        .bindPopup(`<strong>Start</strong><br />${startPlace.name || 'Start location'}`);
      
      markersRef.current.push(startMarker);
    }

    // Add end marker
    if (endPlace) {
      const endIcon = L.divIcon({
        className: 'custom-marker end-marker-icon',
        html: '<div class="marker-pin end-pin"></div><span class="marker-label">End</span>',
        iconSize: [30, 30],
        iconAnchor: [15, 30],
      });

      const endMarker = L.marker([endPlace.lat, endPlace.lng], { icon: endIcon })
        .addTo(map)
        .bindPopup(`<strong>End</strong><br />${endPlace.name || 'Destination'}`);
      
      markersRef.current.push(endMarker);
    }
  }, [startPlace, endPlace, mapReady]);

  // Update weather when start or end place changes
  useEffect(() => {
    if (!mapReady) return;
    
    // Prefer current location if tracking, otherwise use start place, then default to Kigali
    if (currentLocation && isTracking) {
      fetchWeather(currentLocation.lat, currentLocation.lng);
    } else if (startPlace) {
      fetchWeather(startPlace.lat, startPlace.lng);
    } else if (endPlace) {
      fetchWeather(endPlace.lat, endPlace.lng);
    }
  }, [startPlace, endPlace, currentLocation, isTracking, mapReady]);


  // Update routes/polylines
  useEffect(() => {
    if (!mapInstanceRef.current || !mapReady) return;

    const map = mapInstanceRef.current;

    // Clear existing polylines
    polylinesRef.current.forEach(polyline => polyline.remove());
    polylinesRef.current = [];

    // Add route polylines
    routes.forEach((route) => {
      if (!route.geometry || route.geometry.length === 0) return;

      const isSelected = selectedRoute === route.id;
      
      // Determine color
      let color = '#4caf50'; // Green for clear
      if (isSelected) {
        color = '#22c55e'; // Green for selected
      } else if (route.hasFlaggedRoads) {
        const { heavy, blocked, accident } = route.trafficSummary || {};
        if (accident > 0 || blocked > 0 || heavy > 0) {
          color = '#c62828'; // Red for accidents, blocked, or heavy
        } else {
          color = '#f57f17'; // Yellow for medium
        }
      }

      const weight = isSelected ? 6 : 4;
      const opacity = isSelected ? 0.9 : 0.6;

      // Convert geometry to latlng array
      const positions = route.geometry.map(point => [point.lat, point.lng]);

      const polyline = L.polyline(positions, {
        color: color,
        weight: weight,
        opacity: opacity,
        dashArray: isSelected ? undefined : '10, 5',
      }).addTo(map);

      polylinesRef.current.push(polyline);
    });

    // Fit bounds to show all routes
    if (routes.length > 0 && startPlace && endPlace) {
      const bounds = [];
      bounds.push([startPlace.lat, startPlace.lng]);
      bounds.push([endPlace.lat, endPlace.lng]);
      
      routes.forEach(route => {
        if (route.geometry && route.geometry.length > 0) {
          route.geometry.forEach(point => {
            bounds.push([point.lat, point.lng]);
          });
        }
      });

      if (bounds.length > 0) {
        try {
          map.fitBounds(bounds, { padding: [50, 50] });
        } catch (e) {
          console.error('Error fitting bounds:', e);
        }
      }
    }
  }, [routes, selectedRoute, startPlace, endPlace, mapReady]);

  return (
    <div className="map-view">
      <div ref={mapRef} style={{ height: '100%', width: '100%' }} />
      

      {/* Location tracking controls */}
      {selectedRoute && (
        <div className="location-controls">
          <button 
            className={`location-toggle ${isTracking ? 'active' : ''}`}
            onClick={toggleLocationTracking}
            title={isTracking ? 'Stop location tracking' : 'Start location tracking'}
          >
            {isTracking ? '📍 Stop Tracking' : '📍 Start Tracking'}
          </button>
          {locationError && (
            <div className="location-error">{locationError}</div>
          )}
          {onRouteStatus && currentLocation && (
            <div className={`route-status ${onRouteStatus.onRoute ? 'on-route' : 'off-route'}`}>
              {onRouteStatus.onRoute 
                ? `✅ On route (${onRouteStatus.distance}m)` 
                : `⚠️ Off route (${onRouteStatus.distance}m away)`}
            </div>
          )}
        </div>
      )}
      
      {!mapReady && (
        <div className="map-loading">
          <p>Loading map...</p>
        </div>
      )}

      {routes.length > 0 && mapReady && (
        <div className="map-legend">
          <button 
            className="legend-toggle"
            onClick={() => setShowLegend(!showLegend)}
            aria-label={showLegend ? 'Hide legend' : 'Show legend'}
          >
            {showLegend ? '▼' : '▶'} Route Colors
          </button>
          {showLegend && (
            <div className="legend-content">
              <div className="legend-subtitle">Traffic conditions on each route</div>
              <div className="legend-item">
                <div className="legend-color" style={{ backgroundColor: '#4caf50' }}></div>
                <span><strong>Green:</strong> Light / Clear traffic</span>
              </div>
              <div className="legend-item">
                <div className="legend-color" style={{ backgroundColor: '#f57f17' }}></div>
                <span><strong>Orange:</strong> Medium traffic</span>
              </div>
              <div className="legend-item">
                <div className="legend-color" style={{ backgroundColor: '#c62828' }}></div>
                <span><strong>Red:</strong> Heavy traffic</span>
              </div>
              <div className="legend-item">
                <div className="legend-color" style={{ backgroundColor: '#22c55e' }}></div>
                <span><strong>Green:</strong> Your selected route</span>
              </div>
            </div>
          )}
        </div>
      )}

      {routes.length === 0 && mapReady && (
        <div className="map-empty-overlay">
          <p>📍 Enter start and destination to see routes on the map</p>
        </div>
      )}
    </div>
  );
}

export default MapView;
