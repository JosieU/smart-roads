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

  // Search for places using OSM Nominatim (real street names, businesses, landmarks, buildings)
  async searchPlaces(query) {
    const lowerQuery = query.toLowerCase().trim();
    if (!lowerQuery || lowerQuery.length < 1) return [];

    const results = [];
    
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
            polygon_geojson: 0  // Don't need polygon data
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
        console.error('Primary Nominatim search failed:', err.message);
        // Continue to fallback or return popular places
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
              polygon_geojson: 0
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
          
          // Extract name - try multiple sources in order of preference
          // Check all possible name fields to catch places like "Makuza Peace Plaza"
          let placeName = place.name || 
                         place.namedetails?.name || 
                         place.namedetails?.['name:en'] ||
                         (place.extratags && (place.extratags.name || place.extratags['name:en'])) ||
                         (place.address && (place.address.building || place.address.amenity || place.address.shop)) ||
                         displayName.split(',')[0] || 
                         displayName.split(',')[1] || // Sometimes name is in second part
                         query;
          
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
          
          // Boost Kigali results (prioritize Kigali city)
          const isInKigali = addressLower.includes('kigali') || 
                             displayLower.includes('kigali') ||
                             (address.city && address.city.toLowerCase().includes('kigali'));
          const kigaliBoost = isInKigali ? -2 : 0; // Boost Kigali results by 2 points
          
          if (placeNameLower.startsWith(lowerQuery)) {
            relevance = 1 + kigaliBoost; // Starts with query = highest priority
          } else if (placeNameLower.includes(lowerQuery)) {
            relevance = 2 + kigaliBoost; // Contains query = medium priority
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
          if (placeType.includes('cafe') || placeType.includes('restaurant') || placeType.includes('fast_food')) {
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

    // Sort: popular places first, then by relevance score, then alphabetically
    results.sort((a, b) => {
      // Popular places always first
      if (a.type === 'popular' && b.type !== 'popular') return -1;
      if (b.type === 'popular' && a.type !== 'popular') return 1;
      if (a.type === 'popular' && b.type === 'popular') {
        // Both popular: sort by relevance
        return (a.relevance || 5) - (b.relevance || 5);
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
          limit: 1,
          addressdetails: 1,
          countrycodes: 'rw'  // Limit to Rwanda - uses current names from OSM
        },
        headers: {
          'User-Agent': 'Rwanda-Smart-Routes/1.0'
        }
      });

      if (response.data && response.data.length > 0) {
        const place = response.data[0];
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
  async reverseGeocode(lat, lng) {
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
        const name = response.data.name || 
                    address.road || 
                    address.suburb || 
                    address.neighbourhood ||
                    'Location';
        const addressParts = [
          address.road,
          address.suburb || address.neighbourhood,
          address.city || address.town || address.village,
          address.country || 'Rwanda'
        ].filter(Boolean).join(', ');

        return {
          name: name,
          address: addressParts || response.data.display_name
        };
      }
    } catch (error) {
      console.error('Nominatim reverse geocode error:', error.message);
    }

    // Fallback
    return {
      name: `Location (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
      address: 'Rwanda'
    };
  }
};

module.exports = geocodingService;
