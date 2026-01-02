// Route generation service using OpenRouteService API
// This provides real routing that follows actual roads from OpenStreetMap

const axios = require('axios');

const routeService = {
  // Generate routes using OpenRouteService (free routing API using OSM data)
  async generateRoutes(start, end, flaggedRoads) {
    const flaggedRoadIds = new Set(flaggedRoads.map(road => road.roadId));
    
    try {
      // Try OpenRouteService API first
      const routes = await this.getRoutesFromAPI(start, end, flaggedRoadIds);
      if (routes && routes.length > 0) {
        return routes;
      }
      throw new Error('No routes returned from OpenRouteService');
    } catch (error) {
      // Try OSRM demo server (free, no API key needed)
      try {
        const routes = await this.getRoutesFromOSRM(start, end, flaggedRoadIds);
        if (routes && routes.length > 0) {
          return routes;
        }
        throw new Error('No routes returned from OSRM');
      } catch (osrmError) {
        // Only use fallback as absolute last resort - it doesn't follow real roads
        return await this.generateFallbackRoutes(start, end);
      }
    }
  },

  // Get routes from OpenRouteService API
  async getRoutesFromAPI(start, end, flaggedRoadIds) {
    const API_KEY = process.env.OPENROUTESERVICE_API_KEY || '';
    
    if (!API_KEY) {
      throw new Error('No OpenRouteService API key configured');
    }

    try {
      const response = await axios.post(
        `https://api.openrouteservice.org/v2/directions/driving-car`,
        {
          coordinates: [[start.lng, start.lat], [end.lng, end.lat]],
          alternative_routes: {
            target_count: 5, // Increased from 3 to 5 for more route options
            weight_factor: 1.4
          }
        },
        {
          headers: {
            'Authorization': API_KEY,
            'Content-Type': 'application/json'
          },
          timeout: 15000
        }
      );

      const routes = [];
      if (response.data.routes && response.data.routes.length > 0) {
        for (let index = 0; index < response.data.routes.length; index++) {
          const route = response.data.routes[index];
          // Handle both encoded and decoded geometry
          let geometry;
          if (route.geometry && route.geometry.coordinates) {
            geometry = route.geometry.coordinates.map(coord => ({
              lng: coord[0],
              lat: coord[1]
            }));
          } else if (route.geometry_encoded) {
            // If geometry is encoded, we'd need to decode it
            // For now, use waypoints
            geometry = [];
          }

          // Calculate distance and duration
          let distance = 0;
          let duration = 0;
          
          if (route.segments && route.segments.length > 0) {
            distance = route.segments.reduce((sum, seg) => sum + (seg.distance || 0), 0) / 1000;
            duration = route.segments.reduce((sum, seg) => sum + (seg.duration || 0), 0) / 60;
          } else if (route.summary) {
            distance = (route.summary.distance || 0) / 1000;
            duration = (route.summary.duration || 0) / 60;
          }

          const roadSegments = this.extractRoadSegments(route.segments || [], geometry);

          // Handle async road segments generation
          let finalRoadSegments = roadSegments;
          if (roadSegments.length === 0) {
            finalRoadSegments = await this.generateRoadSegmentsFromGeometry(geometry, distance);
          }

          routes.push({
            id: `route_${index + 1}`,
            name: `Route ${index + 1}`,
            eta_minutes: Math.round(duration) || Math.round(distance * 2),
            distance_km: distance.toFixed(1) || '0.0',
            roadSegments: finalRoadSegments,
            geometry: geometry || this.generateGeometryFromRoute(route, start, end)
          });
        }
      }

      if (routes.length === 0) {
        throw new Error('No routes returned from API');
      }
      
      return routes;
    } catch (error) {
      console.error('OpenRouteService API error:', error.message);
      throw error;
    }
  },

  // Generate intermediate waypoints to force different routes through different areas
  generateIntermediateWaypoints(start, end) {
    const waypoints = [];
    
    // Calculate bearing and perpendicular offsets
    const dLat = end.lat - start.lat;
    const dLng = end.lng - start.lng;
    const distance = Math.sqrt(dLat * dLat + dLng * dLng);
    
    // Calculate perpendicular vector (for offsetting routes)
    const perpLat = -dLng / distance; // Perpendicular to route direction
    const perpLng = dLat / distance;
    
    // Create waypoints at different positions along the route
    // Use 1/3 and 2/3 points along the route, with perpendicular offsets
    const waypointPositions = [0.33, 0.67]; // 1/3 and 2/3 along the route
    
    waypointPositions.forEach((t, idx) => {
      // Point along the route
      const alongLat = start.lat + dLat * t;
      const alongLng = start.lng + dLng * t;
      
      // Create offsets perpendicular to route (both sides)
      const offsetAmount = 0.015; // ~1.5km offset (adjust based on route length)
      
      // Left side offset
      waypoints.push({
        lat: alongLat + perpLat * offsetAmount,
        lng: alongLng + perpLng * offsetAmount,
        name: `Waypoint ${idx * 2 + 1}`
      });
      
      // Right side offset
      waypoints.push({
        lat: alongLat - perpLat * offsetAmount,
        lng: alongLng - perpLng * offsetAmount,
        name: `Waypoint ${idx * 2 + 2}`
      });
    });
    
    return waypoints;
  },

  // Get routes from OSRM demo server (free, no API key needed)
  async getRoutesFromOSRM(start, end, flaggedRoadIds) {
    try {
      // OSRM demo server - free public instance
      const baseUrl = 'https://router.project-osrm.org';
      
      const allRoutes = [];
      
      // First: Get standard route with alternatives
      const coordinates = `${start.lng},${start.lat};${end.lng},${end.lat}`;
      const response = await axios.get(`${baseUrl}/route/v1/driving/${coordinates}`, {
        params: {
          alternatives: 3, // OSRM demo server maximum is 3
          overview: 'full',
          geometries: 'geojson',
          steps: true
        },
        timeout: 15000
      });

      if (response.data.code !== 'Ok') {
        throw new Error(`OSRM API error: ${response.data.code} - ${response.data.message || 'Unknown error'}`);
      }

      if (!response.data.routes || response.data.routes.length === 0) {
        throw new Error('No routes returned from OSRM');
      }

      // Process standard routes (with async road name enhancement)
      for (let index = 0; index < response.data.routes.length; index++) {
        const route = response.data.routes[index];
        // Extract geometry from GeoJSON
        const geometry = route.geometry.coordinates.map(coord => ({
          lng: coord[0],
          lat: coord[1]
        }));

        // Calculate distance and duration
        const distance = (route.distance / 1000).toFixed(1); // Convert to km
        const duration = Math.round(route.duration / 60); // Convert to minutes

        // Extract road segments from legs
        const roadSegments = [];
        
        if (route.legs && route.legs.length > 0) {
          for (const leg of route.legs) {
            if (leg.steps && leg.steps.length > 0) {
              for (const step of leg.steps) {
                // Extract road name from step - OSRM provides this in step.name
                const roadName = step.name || 'Road';
                const stepDistance = step.distance ? ((step.distance / 1000).toFixed(1) + ' km') : '0.0 km';
                
                // Only add road segment if it has a meaningful distance
                if (step.distance > 50) { // At least 50 meters
                  roadSegments.push({
                    roadId: `road_${index}_${roadSegments.length}`,
                    roadName: roadName,
                    distance: stepDistance,
                    status: 'light'
                  });
                }
              }
            }
          }
        }

        // If no road segments extracted, create segments from geometry waypoints
        if (roadSegments.length === 0) {
          // Use key points from geometry for road segments
          const segmentCount = Math.min(4, Math.floor(geometry.length / 10));
          const segmentSize = Math.floor(geometry.length / (segmentCount + 1));
          
          for (let segIdx = 0; segIdx < segmentCount; segIdx++) {
            const pointIdx = (segIdx + 1) * segmentSize;
            if (pointIdx < geometry.length) {
              roadSegments.push({
                roadId: `road_${index}_${segIdx}`,
                roadName: 'Road',
                distance: (parseFloat(distance) / segmentCount).toFixed(1) + ' km',
                status: 'light'
              });
            }
          }
        }

        const routeData = {
          id: `route_${index + 1}`,
          name: `Route ${index + 1}`,
          eta_minutes: duration,
          distance_km: distance,
          roadSegments: roadSegments.length > 0 ? roadSegments : [{
            roadId: `road_${index}_0`,
            roadName: 'Route',
            distance: distance + ' km',
            status: 'light'
          }],
          geometry: geometry
        };
        allRoutes.push(routeData);
      }

      // Generate additional routes with intermediate waypoints to get more diverse alternatives
      const waypoints = this.generateIntermediateWaypoints(start, end);
      
      // Try routes with different intermediate waypoints (try all waypoints for maximum diversity)
      for (let i = 0; i < waypoints.length; i++) {
        try {
          const wp = waypoints[i];
          const waypointCoords = `${start.lng},${start.lat};${wp.lng},${wp.lat};${end.lng},${end.lat}`;
          
          const wpResponse = await axios.get(`${baseUrl}/route/v1/driving/${waypointCoords}`, {
            params: {
              overview: 'full',
              geometries: 'geojson',
              steps: true
            },
            timeout: 15000
          });

          if (wpResponse.data.code === 'Ok' && wpResponse.data.routes && wpResponse.data.routes.length > 0) {
            const route = wpResponse.data.routes[0]; // Get the main route with waypoint
            
            // Check if this route is significantly different from existing routes
            const geometry = route.geometry.coordinates.map(coord => ({
              lng: coord[0],
              lat: coord[1]
            }));

            // Simple check: if route is more than 500m different in distance, consider it unique
            const distance = (route.distance / 1000).toFixed(1);
            const duration = Math.round(route.duration / 60);
            
            const isUnique = !allRoutes.some(existing => {
              const distDiff = Math.abs(parseFloat(existing.distance_km) - parseFloat(distance));
              return distDiff < 0.5; // Less than 500m difference = too similar
            });

            if (isUnique) {
              // Extract road segments
              const roadSegments = [];
              
              if (route.legs && route.legs.length > 0) {
                for (const leg of route.legs) {
                  if (leg.steps && leg.steps.length > 0) {
                    for (const step of leg.steps) {
                      const roadName = step.name || 'Road';
                      const stepDistance = step.distance ? ((step.distance / 1000).toFixed(1) + ' km') : '0.0 km';
                      
                      if (step.distance > 50) {
                        roadSegments.push({
                          roadId: `road_wp${i}_${roadSegments.length}`,
                          roadName: roadName,
                          distance: stepDistance,
                          status: 'light'
                        });
                      }
                    }
                  }
                }
              }

              allRoutes.push({
                id: `route_${allRoutes.length + 1}`,
                name: `Route ${allRoutes.length + 1}`,
                eta_minutes: duration,
                distance_km: distance,
                roadSegments: roadSegments.length > 0 ? roadSegments : [{
                  roadId: `road_wp${i}_0`,
                  roadName: 'Route',
                  distance: distance + ' km',
                  status: 'light'
                }],
                geometry: geometry
              });
            }
          }
          
          // Small delay to respect rate limits
          await new Promise(resolve => setTimeout(resolve, 200));
        } catch (wpError) {
          // Continue with next waypoint
        }
      }

      return allRoutes;
    } catch (error) {
      console.error('OSRM API error:', error.message);
      throw error;
    }
  },

  // Extract road segments from route segments
  extractRoadSegments(segments, fullGeometry) {
    const roadSegments = [];
    let geometryIndex = 0;
    
    segments.forEach(segment => {
      if (segment.steps && segment.steps.length > 0) {
        segment.steps.forEach(step => {
          // Extract road name from step
          let roadName = step.name;
          if (!roadName && step.instruction) {
            // Try to extract road name from instruction text
            const instruction = step.instruction.toLowerCase();
            if (instruction.includes('kn') || instruction.includes('kg') || instruction.includes('dr')) {
              // Extract road name pattern
              const match = step.instruction.match(/(KN|KG|DR)\s*\d+[^\s]*/i);
              roadName = match ? match[0] : 'Road';
            } else {
              roadName = 'Road';
            }
          }
          if (!roadName) roadName = 'Road';
          
          const distance = step.distance ? ((step.distance / 1000).toFixed(1) + ' km') : '0.0 km';
          
          // Try to get geometry for this step
          let stepGeometry = [];
          if (step.way_points && step.way_points.length >= 2 && fullGeometry) {
            const startIdx = step.way_points[0];
            const endIdx = step.way_points[step.way_points.length - 1];
            stepGeometry = fullGeometry.slice(startIdx, endIdx + 1);
          } else if (step.geometry && Array.isArray(step.geometry)) {
            stepGeometry = step.geometry.map(coord => ({
              lat: coord[1] || coord.lat,
              lng: coord[0] || coord.lng
            }));
          }
          
          roadSegments.push({
            roadId: `road_${step.way_points?.[0] || Date.now()}`,
            roadName: roadName,
            distance: distance,
            status: 'light',
            geometry: stepGeometry.length > 0 ? stepGeometry : undefined
          });
        });
      }
    });
    return roadSegments;
  },

  // Generate road segments from geometry when segments are not available
  async generateRoadSegmentsFromGeometry(geometry, totalDistance) {
    if (!geometry || geometry.length === 0) return [];
    
    const geocodingService = require('./geocodingService');
    const roadSegments = [];
    const segmentCount = Math.min(3, geometry.length);
    
    for (let i = 0; i < segmentCount; i++) {
      const pointIndex = Math.floor((i / segmentCount) * geometry.length);
      const point = geometry[pointIndex];
      
      try {
        const locationInfo = await geocodingService.reverseGeocode(point.lat, point.lng);
        let streetName = locationInfo.name;
        
        if (!streetName || streetName.includes('Location')) {
          const addressParts = locationInfo.address.split(',');
          streetName = addressParts.find(part => 
            part.includes('Road') || part.includes('Street') || part.includes('Avenue') ||
            part.includes('KN') || part.includes('KG') || part.includes('DR')
          ) || addressParts[0] || `Road ${i + 1}`;
        }
        
        // Get geometry for this segment (points around this index)
        const startIdx = Math.max(0, pointIndex - 5);
        const endIdx = Math.min(geometry.length - 1, pointIndex + 5);
        const segmentGeometry = geometry.slice(startIdx, endIdx + 1);
        
        roadSegments.push({
          roadId: `road_${i}`,
          roadName: streetName.trim(),
          distance: (totalDistance / segmentCount).toFixed(1) + ' km',
          status: 'light',
          geometry: segmentGeometry // Add geometry for coordinate matching
        });
        
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (error) {
        roadSegments.push({
          roadId: `road_${i}`,
          roadName: `Road ${i + 1}`,
          distance: (totalDistance / segmentCount).toFixed(1) + ' km',
          status: 'light'
        });
      }
    }
    
    return roadSegments;
  },

  // Generate geometry from route if not provided
  generateGeometryFromRoute(route, start, end) {
    // Fallback geometry
    return [
      { lat: start.lat, lng: start.lng },
      { lat: end.lat, lng: end.lng }
    ];
  },

  // Fallback: Generate routes using reverse geocoding to get REAL street names from map
  async generateFallbackRoutes(start, end, flaggedRoadIds) {
    const geocodingService = require('./geocodingService');
    
    const routes = [];
    
    for (let i = 0; i < 3; i++) {
      const waypoints = this.generateRoadWaypoints(start, end, i);
      const geometry = [
        { lat: start.lat, lng: start.lng },
        ...waypoints,
        { lat: end.lat, lng: end.lng }
      ];

      // Calculate distance
      let distance = 0;
      for (let j = 0; j < geometry.length - 1; j++) {
        distance += this.haversineDistance(
          geometry[j].lat, geometry[j].lng,
          geometry[j + 1].lat, geometry[j + 1].lng
        );
      }

      const eta = Math.round(distance / 0.5);

      // Get REAL street names using reverse geocoding at key waypoints
      const roadSegments = [];
      const keyPoints = [
        geometry[0], // Start
        geometry[Math.floor(geometry.length / 3)], // 1/3 way
        geometry[Math.floor(geometry.length * 2 / 3)], // 2/3 way
        geometry[geometry.length - 1] // End
      ];

      for (let pointIdx = 0; pointIdx < keyPoints.length - 1; pointIdx++) {
        const point = keyPoints[pointIdx];
        
        try {
          // Get street name from coordinates using reverse geocoding
          const locationInfo = await geocodingService.reverseGeocode(point.lat, point.lng);
          
          // Extract street name from address
          let streetName = locationInfo.name;
          if (!streetName || streetName.includes('Location')) {
            // Try to get road name from address
            const addressParts = locationInfo.address.split(',');
            streetName = addressParts.find(part => 
              part.includes('Road') || 
              part.includes('Street') || 
              part.includes('Avenue') ||
              part.includes('KN') ||
              part.includes('KG') ||
              part.includes('DR')
            ) || addressParts[0] || `Road segment ${pointIdx + 1}`;
          }
          
          // Get geometry for this segment (points around this waypoint)
          const segmentGeometry = [];
          if (pointIdx > 0 && keyPoints[pointIdx - 1]) {
            segmentGeometry.push(keyPoints[pointIdx - 1]);
          }
          segmentGeometry.push(point);
          if (pointIdx < keyPoints.length - 1 && keyPoints[pointIdx + 1]) {
            segmentGeometry.push(keyPoints[pointIdx + 1]);
          }
          
          roadSegments.push({
            roadId: `road_${i}_${pointIdx}`,
            roadName: streetName.trim(),
            distance: (distance / (keyPoints.length - 1)).toFixed(1) + ' km',
            status: pointIdx === 0 ? 'medium' : 'light',
            geometry: segmentGeometry // Add geometry for coordinate matching
          });
          
          // Small delay to respect Nominatim rate limits
          await new Promise(resolve => setTimeout(resolve, 200));
        } catch (error) {
          // Fallback to generic name
          roadSegments.push({
            roadId: `road_${i}_${pointIdx}`,
            roadName: `Road segment ${pointIdx + 1}`,
            distance: (distance / (keyPoints.length - 1)).toFixed(1) + ' km',
            status: 'light'
          });
        }
      }

      routes.push({
        id: `route_${i + 1}`,
        name: `Route ${i + 1}`,
        eta_minutes: eta,
        distance_km: distance.toFixed(1),
        roadSegments: roadSegments,
        geometry: geometry
      });
    }

    return routes;
  },

  // Generate waypoints that follow road-like curves (not straight)
  // Improved: Creates waypoints along a more realistic path
  generateRoadWaypoints(start, end, routeIndex) {
    const waypoints = [];
    const numWaypoints = 4 + routeIndex * 2; // More waypoints for smoother curves
    
    // Calculate bearing for more realistic routing
    const dLng = end.lng - start.lng;
    const dLat = end.lat - start.lat;
    const distance = Math.sqrt(dLng * dLng + dLat * dLat);
    
    // Create waypoints with offset to simulate following roads
    for (let i = 1; i <= numWaypoints; i++) {
      const t = i / (numWaypoints + 1);
      
      // Base interpolation
      let lat = start.lat + dLat * t;
      let lng = start.lng + dLng * t;
      
      // Add perpendicular offset to create alternative routes
      // This simulates taking different parallel roads
      const perpendicularOffset = (routeIndex - 1) * 0.008; // ~800m offset per route
      const angle = Math.atan2(dLat, dLng) + Math.PI / 2; // Perpendicular angle
      lat += Math.sin(angle) * perpendicularOffset * Math.sin(t * Math.PI);
      lng += Math.cos(angle) * perpendicularOffset * Math.sin(t * Math.PI);
      
      // Add slight curve variation
      const curveVariation = Math.sin(t * Math.PI * 2) * 0.003;
      lat += Math.sin(angle + Math.PI / 4) * curveVariation;
      lng += Math.cos(angle + Math.PI / 4) * curveVariation;
      
      waypoints.push({ lat, lng });
    }
    
    return waypoints;
  },

  // Calculate distance between two points (Haversine formula)
  haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }
};

module.exports = routeService;
