// Geocoding service using OpenStreetMap Nominatim API
// This provides real street names, businesses, and places from OSM

const axios = require('axios');

const geocodingService = {
  // Popular places in Kigali, Rwanda (fallback and common searches)
  popularPlaces: {
    'norrsken': { name: 'Norrsken House Kigali', lat: -1.9441, lng: 30.0619, address: 'KG 7 Ave, Kigali' },
    'norrsken house': { name: 'Norrsken House Kigali', lat: -1.9441, lng: 30.0619, address: 'KG 7 Ave, Kigali' },
    'chuk': { name: 'CHUK - University Teaching Hospital', lat: -1.9500, lng: 30.0583, address: 'KN 4 Ave, Kigali' },
    'nyabugogo': { name: 'Nyabugogo Bus Station', lat: -1.9431, lng: 30.0594, address: 'Nyabugogo, Kigali' },
    'kimironko': { name: 'Kimironko Market', lat: -1.9167, lng: 30.1167, address: 'Kimironko, Kigali' },
    'kagugu': { name: 'Kagugu', lat: -1.9167, lng: 30.1000, address: 'Kagugu, Kigali' },
    'kagugu health': { name: 'Kagugu Health Centre', lat: -1.9167, lng: 30.1000, address: 'Kagugu, Kigali' },
    'kagugu health center': { name: 'Kagugu Health Centre', lat: -1.9167, lng: 30.1000, address: 'Kagugu, Kigali' },
  },

  // Helper function to detect if query looks like a road name
  isRoadName(query) {
    const lowerQuery = query.toLowerCase().trim();
    // Patterns that indicate road names: KN, KG, DR, Road, Street, Avenue, Ave, St, etc.
    const roadPatterns = [
      /^(kn|kg|dr)\s*\d+/i,  // KN 4, KG 7, DR 12
      /\b(road|street|avenue|ave|st|rd|blvd|boulevard|drive|dr|way|ln|lane)\b/i,
      /^(kn|kg|dr)\s*\d+\s*(road|street|avenue|ave|st|rd)/i  // KN 4 Road, KG 7 Avenue
    ];
    return roadPatterns.some(pattern => pattern.test(lowerQuery));
  },

  // Search for places using OSM Nominatim (real street names, businesses, landmarks, buildings)
  async searchPlaces(query) {
    const lowerQuery = query.toLowerCase().trim();
    if (!lowerQuery || lowerQuery.length < 1) return [];

    const results = [];
    const isRoadQuery = this.isRoadName(query);
    
    // Check popular places first (fast lookup) - partial matching
    Object.entries(this.popularPlaces).forEach(([key, place]) => {
      const keyLower = key.toLowerCase();
      const nameLower = place.name.toLowerCase();
      // Match if query is at the start of key or name (prefix match)
      if (keyLower.startsWith(lowerQuery) || nameLower.startsWith(lowerQuery) || 
          keyLower.includes(lowerQuery) || nameLower.includes(lowerQuery)) {
        results.push({
          id: key,
          name: place.name,
          address: place.address,
          lat: place.lat,
          lng: place.lng,
          type: 'popular',
          relevance: (keyLower.startsWith(lowerQuery) || nameLower.startsWith(lowerQuery)) ? 1 : 2
        });
      }
    });

    // Always search OSM Nominatim for businesses, landmarks, buildings, addresses
    // This finds: cafes, shops, restaurants, schools, hospitals, landmarks, street names, etc.
    // FOCUS ON KIGALI CITY for better accuracy
    try {
      
      // Try multiple search strategies to find more results
      const searchQueries = [];
      
      // Strategy 1: Search with full query + Kigali (focus on Kigali city for accuracy)
      const queryLower = query.toLowerCase();
      const hasLocationContext = queryLower.includes('kigali') || 
                                 queryLower.includes('rwanda') || 
                                 queryLower.includes('district') ||
                                 queryLower.includes('province');
      
      // Primary strategy: Focus on Kigali city for better results
      // Use single best query to speed up search (reduced from 3 queries to 1-2)
      let primaryQuery;
      if (!hasLocationContext) {
        primaryQuery = `${query} Kigali`;  // Use Kigali for better accuracy
      } else {
        primaryQuery = query;
      }
      
      const allResults = [];
      
      // Make primary search (fast - single query)
      // Use bounding box for Kigali to focus results and improve accuracy
      // Kigali bounding box: approximately -2.0 to -1.8 lat, 29.9 to 30.2 lng
      try {
        const response = await axios.get('https://nominatim.openstreetmap.org/search', {
          params: {
            q: primaryQuery,
            format: 'json',
            limit: 50, // Get more results
            addressdetails: 1,
            'accept-language': 'en',
            namedetails: 1,
            dedupe: 1,  // Deduplicate results
            countrycodes: 'rw',  // Limit to Rwanda
            extratags: 1,  // Get extra tags for better matching
            polygon_geojson: 0,  // Don't need polygon data
            viewbox: '29.9,-2.0,30.2,-1.8',  // Kigali bounding box (minlon,minlat,maxlon,maxlat)
            bounded: 0  // Don't strictly require results to be in bounding box, but prioritize them
          },
          headers: {
            'User-Agent': 'Rwanda-Smart-Routes/1.0' // Required by Nominatim
          },
          timeout: 8000 // 8 second timeout (reduced from 10)
        });
        
        if (response.data && response.data.length > 0) {
          allResults.push(...response.data);
        }
      } catch (err) {
        console.error('Primary Nominatim search with viewbox failed:', err.message);
        // Try again without viewbox as fallback
        try {
          const fallbackResponse = await axios.get('https://nominatim.openstreetmap.org/search', {
            params: {
              q: primaryQuery,
              format: 'json',
              limit: 50,
              addressdetails: 1,
              'accept-language': 'en',
              namedetails: 1,
              dedupe: 1,
              countrycodes: 'rw',
              extratags: 1,
              polygon_geojson: 0
            },
            headers: {
              'User-Agent': 'Rwanda-Smart-Routes/1.0'
            },
            timeout: 8000
          });
          
          if (fallbackResponse.data && fallbackResponse.data.length > 0) {
            allResults.push(...fallbackResponse.data);
          }
        } catch (fallbackErr) {
          console.error('Fallback Nominatim search also failed:', fallbackErr.message);
          // Continue to return popular places only
        }
      }
      
      // Only do fallback search if primary search returned few results (< 10)
      // This speeds up the common case while still providing fallback
      if (allResults.length < 10 && !hasLocationContext) {
        try {
          // Small delay to respect rate limits (reduced from 300ms to 100ms)
          await new Promise(resolve => setTimeout(resolve, 100));
          
          const fallbackQuery = `${query} Rwanda`;
          const response = await axios.get('https://nominatim.openstreetmap.org/search', {
            params: {
              q: fallbackQuery,
              format: 'json',
              limit: 30,
              addressdetails: 1,
              'accept-language': 'en',
              namedetails: 1,
              dedupe: 1,
              countrycodes: 'rw',
              extratags: 1,
              polygon_geojson: 0,
              viewbox: '29.9,-2.0,30.2,-1.8',  // Kigali bounding box (minlon,minlat,maxlon,maxlat)
              bounded: 0  // Prioritize but don't strictly require
            },
            headers: {
              'User-Agent': 'Rwanda-Smart-Routes/1.0'
            },
            timeout: 8000
          });
          
          if (response.data && response.data.length > 0) {
            allResults.push(...response.data);
          }
        } catch (err) {
          console.error('Fallback Nominatim search failed:', err.message);
          // Continue with whatever results we have
        }
      }
      
      // Deduplicate by place_id
      const seenIds = new Set();
      const uniqueResults = allResults.filter(place => {
        if (seenIds.has(place.place_id)) {
          return false;
        }
        seenIds.add(place.place_id);
        return true;
      });

      if (uniqueResults.length > 0) {
        uniqueResults.forEach(place => {
          const address = place.address || {};
          const displayName = place.display_name || '';
          
          // Extract name - prioritize road names when query looks like a road
          let placeName = '';
          const isRoad = place.type === 'highway' || place.class === 'highway' || 
                        (place.address && place.address.road);
          
          if (isRoadQuery && isRoad && address.road) {
            // For road queries, prioritize the road name
            placeName = address.road;
          } else {
            // For place queries, use standard name extraction
            placeName = place.name || 
                       place.namedetails?.name || 
                       place.namedetails?.['name:en'] ||
                       (place.extratags && (place.extratags.name || place.extratags['name:en'])) ||
                       (place.address && (place.address.building || place.address.amenity || place.address.shop)) ||
                       (isRoad && address.road) || // Use road name if it's a road
                       displayName.split(',')[0] || 
                       displayName.split(',')[1] || // Sometimes name is in second part
                       query;
          }
          
          // Clean up the name
          placeName = placeName.trim();
          const placeNameLower = placeName.toLowerCase();
          
          // Check if this place matches the query in name, address, or display name
          // Be more inclusive - check all parts of the name and address
          const displayLower = displayName.toLowerCase();
          const addressLower = Object.values(address).join(' ').toLowerCase();
          const allText = `${placeNameLower} ${displayLower} ${addressLower}`;
          
          // Match if query appears anywhere in the combined text
          const matchesQuery = allText.includes(lowerQuery);
          
          // Only include if it matches the query
          if (!matchesQuery) {
            return;
          }
          
          // Calculate relevance score for better sorting
          // Lower score = more relevant (starts with query = highest priority)
          let relevance = 10; // Default relevance (lower is better)
          
          // Check if result is in Kigali bounding box (approximately -2.0 to -1.8 lat, 29.9 to 30.2 lng)
          const lat = parseFloat(place.lat);
          const lng = parseFloat(place.lon);
          const isInKigaliBounds = lat >= -2.0 && lat <= -1.8 && lng >= 29.9 && lng <= 30.2;
          
          // Boost Kigali results (prioritize Kigali city)
          const isInKigali = addressLower.includes('kigali') || 
                             displayLower.includes('kigali') ||
                             (address.city && address.city.toLowerCase().includes('kigali')) ||
                             isInKigaliBounds;
          const kigaliBoost = isInKigali ? -3 : 0; // Strong boost for Kigali results (3 points)
          
          // Boost road results when query is a road name
          const roadBoost = (isRoadQuery && isRoad) ? -3 : 0; // Strong boost for road matches
          
          // Check if road name matches query
          const roadName = address.road ? address.road.toLowerCase() : '';
          const roadMatches = roadName && (
            roadName.startsWith(lowerQuery) || 
            roadName.includes(lowerQuery) ||
            lowerQuery.includes(roadName.replace(/\s+/g, '')) // Handle "KN4" vs "KN 4"
          );
          
          if (isRoadQuery && roadMatches) {
            // Road query matching road name = highest priority
            relevance = 0 + kigaliBoost + roadBoost;
          } else if (placeNameLower.startsWith(lowerQuery)) {
            relevance = 1 + kigaliBoost; // Starts with query = highest priority
          } else if (placeNameLower.includes(lowerQuery)) {
            relevance = 2 + kigaliBoost; // Contains query = medium priority
          } else if (roadMatches) {
            relevance = 2.5 + kigaliBoost + roadBoost; // Road name match (even if not road query)
          } else if (displayLower.includes(lowerQuery)) {
            relevance = 3 + kigaliBoost; // In display name
          } else if (addressLower.includes(lowerQuery)) {
            relevance = 4 + kigaliBoost; // In address
          } else {
            relevance = 5 + kigaliBoost; // Matched in combined text
          }
          
          // Ensure relevance is at least 1
          relevance = Math.max(1, relevance);
          
          // Build address string
          const addressParts = [
            address.road,
            address.house_number,
            address.suburb || address.neighbourhood || address.quarter,
            address.city || address.town || address.village,
            address.country || 'Rwanda'
          ].filter(Boolean).join(', ');

          // Determine type for better display
          let type = 'place';
          const placeType = place.type || place.class || '';
          if (isRoad || placeType === 'highway' || place.class === 'highway') {
            type = 'road'; // Mark as road for better UI display
          } else if (placeType.includes('cafe') || placeType.includes('restaurant') || placeType.includes('fast_food')) {
            type = 'cafe';
          } else if (placeType.includes('shop') || placeType.includes('supermarket') || placeType.includes('mall')) {
            type = 'shop';
          } else if (placeType.includes('school') || placeType.includes('university') || placeType.includes('college')) {
            type = 'school';
          } else if (placeType.includes('hospital') || placeType.includes('clinic') || placeType.includes('health')) {
            type = 'hospital';
          } else if (placeType.includes('building') || placeType.includes('office')) {
            type = 'building';
          } else if (address.road) {
            type = 'address';
          }

          // Skip if already in popular places or duplicate coordinates
          const isDuplicate = results.some(r => 
            Math.abs(r.lat - parseFloat(place.lat)) < 0.0001 && 
            Math.abs(r.lng - parseFloat(place.lon)) < 0.0001
          );

          // Include all matching results
          if (!isDuplicate) {
            results.push({
              id: `osm_${place.place_id}`,
              name: placeName,
              address: addressParts || displayName,
              lat: parseFloat(place.lat),
              lng: parseFloat(place.lon),
              type: type,
              displayName: displayName,
              relevance: relevance
            });
          }
        });
      }
    } catch (error) {
      console.error('Nominatim search error:', error.message);
      console.error('Error details:', error.response?.status, error.response?.statusText);
      // Return popular places as fallback
    }

    // Sort: popular places first, then roads (if road query), then by relevance score, then alphabetically
    results.sort((a, b) => {
      // Popular places always first
      if (a.type === 'popular' && b.type !== 'popular') return -1;
      if (b.type === 'popular' && a.type !== 'popular') return 1;
      if (a.type === 'popular' && b.type === 'popular') {
        // Both popular: sort by relevance
        return (a.relevance || 5) - (b.relevance || 5);
      }
      
      // If road query, prioritize road results
      if (isRoadQuery) {
        if (a.type === 'road' && b.type !== 'road') return -1;
        if (b.type === 'road' && a.type !== 'road') return 1;
      }
      
      // Both OSM: sort by relevance, then alphabetically
      const relevanceDiff = (a.relevance || 5) - (b.relevance || 5);
      if (relevanceDiff !== 0) return relevanceDiff;
      return a.name.localeCompare(b.name);
    });

    const finalResults = results.slice(0, 25); // Return more results for better selection
    
    return finalResults;
  },

  // Geocode a place name to coordinates using Nominatim
  async geocode(placeName) {
    const lowerName = placeName.toLowerCase().trim();
    
    // Check popular places first
    for (const [key, place] of Object.entries(this.popularPlaces)) {
      if (key === lowerName || place.name.toLowerCase().includes(lowerName)) {
        return {
          name: place.name,
          address: place.address,
          lat: place.lat,
          lng: place.lng
        };
      }
    }

    // Use Nominatim for real geocoding - search Rwanda-wide
    // Nominatim uses current district/city names from OpenStreetMap
    try {
      // If query already has location context, use as-is; otherwise add "Rwanda"
      let geocodeQuery = placeName;
      const placeLower = placeName.toLowerCase();
      const hasLocationContext = placeLower.includes('rwanda') || 
                                 placeLower.includes('district') ||
                                 placeLower.includes('province');
      
      if (!hasLocationContext) {
        geocodeQuery = `${placeName} Rwanda`;
      }
      
      const response = await axios.get('https://nominatim.openstreetmap.org/search', {
        params: {
          q: geocodeQuery,
          format: 'json',
          limit: 5, // Get multiple results to find best match
          addressdetails: 1,
          countrycodes: 'rw',  // Limit to Rwanda - uses current names from OSM
          viewbox: '29.9,-2.0,30.2,-1.8',  // Kigali bounding box (minlon,minlat,maxlon,maxlat)
          bounded: 0  // Prioritize Kigali but allow other results
        },
        headers: {
          'User-Agent': 'Rwanda-Smart-Routes/1.0'
        }
      });

      if (response.data && response.data.length > 0) {
        // Prioritize results in Kigali bounding box for better accuracy
        const kigaliResults = response.data.filter(p => {
          const lat = parseFloat(p.lat);
          const lng = parseFloat(p.lon);
          return lat >= -2.0 && lat <= -1.8 && lng >= 29.9 && lng <= 30.2;
        });
        
        // Use Kigali result if available, otherwise use first result
        const place = kigaliResults.length > 0 ? kigaliResults[0] : response.data[0];
        const address = place.address || {};
        const addressParts = [
          address.road,
          address.suburb || address.neighbourhood,
          address.city || address.town || address.village,
          address.country || 'Rwanda'
        ].filter(Boolean).join(', ');

        return {
          name: place.name || place.display_name.split(',')[0],
          address: addressParts || place.display_name,
          lat: parseFloat(place.lat),
          lng: parseFloat(place.lon)
        };
      }
    } catch (error) {
      console.error('Nominatim geocode error:', error.message);
    }

    // Fallback - return a location in Rwanda (center of country)
    return {
      name: placeName,
      address: `${placeName}, Rwanda`,
      lat: -1.9441 + (Math.random() - 0.5) * 0.1,
      lng: 30.0619 + (Math.random() - 0.5) * 0.1
    };
  },

  // Reverse geocode: coordinates to place name using Nominatim
  // For reporting: prioritizes road names over place names
  async reverseGeocode(lat, lng, prioritizeRoad = false) {
    try {
      const response = await axios.get('https://nominatim.openstreetmap.org/reverse', {
        params: {
          lat: lat,
          lon: lng,
          format: 'json',
          addressdetails: 1,
          'accept-language': 'en'
        },
        headers: {
          'User-Agent': 'Rwanda-Smart-Routes/1.0'
        }
      });

      if (response.data && response.data.address) {
        const address = response.data.address;
        
        // For reporting: prioritize road name over place name
        let name;
        if (prioritizeRoad) {
          // When prioritizing road, use road name as primary identifier
          name = address.road || 
                 address.pedestrian || 
                 address.path ||
                 response.data.name || 
                 address.suburb || 
                 address.neighbourhood ||
                 'Location';
        } else {
          // For general use, use place name if available, fallback to road
          name = response.data.name || 
                 address.road || 
                 address.suburb || 
                 address.neighbourhood ||
                 'Location';
        }
        
        const addressParts = [
          address.road,
          address.suburb || address.neighbourhood,
          address.city || address.town || address.village,
          address.country || 'Rwanda'
        ].filter(Boolean).join(', ');

        return {
          name: name,
          address: addressParts || response.data.display_name,
          road: address.road || null, // Explicitly include road name
          placeName: response.data.name || null, // Keep place name separate
          coordinates: { lat, lng } // Include coordinates
        };
      }
    } catch (error) {
      console.error('Nominatim reverse geocode error:', error.message);
    }

    // Fallback
    return {
      name: `Location (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
      address: 'Rwanda',
      road: null,
      placeName: null,
      coordinates: { lat, lng }
    };
  }
};

module.exports = geocodingService;
