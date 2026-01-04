import React, { useState, useEffect, useRef } from 'react';
import './RouteSearchForm.css';
import axios from '../config/axios';

function RouteSearchForm({ onSearch, loading, onUseMyLocation }) {
  const [startQuery, setStartQuery] = useState('');
  const [endQuery, setEndQuery] = useState('');
  const [startSuggestions, setStartSuggestions] = useState([]);
  const [endSuggestions, setEndSuggestions] = useState([]);
  const [showStartSuggestions, setShowStartSuggestions] = useState(false);
  const [showEndSuggestions, setShowEndSuggestions] = useState(false);
  const [selectedStart, setSelectedStart] = useState(null);
  const [selectedEnd, setSelectedEnd] = useState(null);
  const [usingMyLocation, setUsingMyLocation] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [startError, setStartError] = useState(null);
  const [endError, setEndError] = useState(null);
  const startRef = useRef(null);
  const endRef = useRef(null);

  // Debounced search for places - now works with 1+ characters
  useEffect(() => {
    if (startQuery.trim().length >= 1 && !selectedStart && !usingMyLocation) {
      setSearching(true);
      setStartError(null);
      const currentQuery = startQuery; // Capture current query to prevent race conditions
      const timer = setTimeout(() => {
        axios.get('/api/places/search', { params: { q: currentQuery } })
          .then(res => {
            // Check if query hasn't changed (prevent race condition)
            if (startQuery !== currentQuery) {
              return;
            }
            
            let places = res.data.places || [];
            
            // Smart client-side filtering: show ALL places that contain the query text
            // This allows narrowing down as user types more characters
            const queryLower = currentQuery.toLowerCase().trim();
            if (queryLower.length > 0) {
              places = places.filter(place => {
                const nameLower = (place.name || '').toLowerCase();
                const addressLower = (place.address || '').toLowerCase();
                const displayLower = (place.displayName || '').toLowerCase();
                
                // Show if the query appears anywhere in name, address, or display name
                // This allows "Kagu" to match "Kagugu", "Kagugu Health Centre", etc.
                return nameLower.includes(queryLower) || 
                       addressLower.includes(queryLower) ||
                       displayLower.includes(queryLower);
              });
              
              // Sort by relevance: places that START with the query come first
              places.sort((a, b) => {
                const aName = (a.name || '').toLowerCase();
                const bName = (b.name || '').toLowerCase();
                const aStarts = aName.startsWith(queryLower) ? 0 : 1;
                const bStarts = bName.startsWith(queryLower) ? 0 : 1;
                if (aStarts !== bStarts) return aStarts - bStarts;
                return aName.localeCompare(bName);
              });
            }
            
            // Only update state if query still matches (prevent race condition)
            if (startQuery === currentQuery) {
              setStartSuggestions(places);
              setShowStartSuggestions(places.length > 0);
              setSearching(false);
              if (places.length === 0) {
                setStartError('No places found. Try a different search term.');
              } else {
                setStartError(null);
              }
            }
          })
          .catch(err => {
            // Only update state if query still matches (prevent race condition)
            if (startQuery === currentQuery) {
              console.error('Search error:', err);
              console.error('Error response:', err.response?.data);
              setStartSuggestions([]);
              setShowStartSuggestions(false);
              setSearching(false);
              
              // Show more helpful error message
              let errorMsg = 'Failed to search. ';
              if (err.response?.status === 500) {
                errorMsg += 'Server error. Please try again.';
              } else if (err.response?.status === 429) {
                errorMsg += 'Too many requests. Please wait a moment.';
              } else if (!err.response) {
                errorMsg += 'Check your connection.';
              } else {
                errorMsg += 'Please try again.';
              }
              setStartError(errorMsg);
            }
          });
      }, 300);
      return () => clearTimeout(timer);
    } else {
      setStartSuggestions([]);
      setShowStartSuggestions(false);
      setSearching(false);
      setStartError(null);
    }
  }, [startQuery, selectedStart, usingMyLocation]);

  useEffect(() => {
    if (endQuery.trim().length >= 1 && !selectedEnd) {
      setSearching(true);
      setEndError(null);
      const currentQuery = endQuery; // Capture current query to prevent race conditions
      const timer = setTimeout(() => {
        axios.get('/api/places/search', { params: { q: currentQuery } })
          .then(res => {
            // Check if query hasn't changed (prevent race condition)
            if (endQuery !== currentQuery) {
              return;
            }
            
            let places = res.data.places || [];
            
            // Smart client-side filtering: show ALL places that contain the query text
            // This allows narrowing down as user types more characters
            const queryLower = currentQuery.toLowerCase().trim();
            if (queryLower.length > 0) {
              places = places.filter(place => {
                const nameLower = (place.name || '').toLowerCase();
                const addressLower = (place.address || '').toLowerCase();
                const displayLower = (place.displayName || '').toLowerCase();
                
                // Show if the query appears anywhere in name, address, or display name
                // This allows "Kagu" to match "Kagugu", "Kagugu Health Centre", etc.
                return nameLower.includes(queryLower) || 
                       addressLower.includes(queryLower) ||
                       displayLower.includes(queryLower);
              });
              
              // Sort by relevance: places that START with the query come first
              places.sort((a, b) => {
                const aName = (a.name || '').toLowerCase();
                const bName = (b.name || '').toLowerCase();
                const aStarts = aName.startsWith(queryLower) ? 0 : 1;
                const bStarts = bName.startsWith(queryLower) ? 0 : 1;
                if (aStarts !== bStarts) return aStarts - bStarts;
                return aName.localeCompare(bName);
              });
            }
            
            // Only update state if query still matches (prevent race condition)
            if (endQuery === currentQuery) {
              setEndSuggestions(places);
              setShowEndSuggestions(places.length > 0);
              setSearching(false);
              if (places.length === 0) {
                setEndError('No places found. Try a different search term.');
              } else {
                setEndError(null);
              }
            }
          })
          .catch(err => {
            // Only update state if query still matches (prevent race condition)
            if (endQuery === currentQuery) {
              console.error('Search error:', err);
              console.error('Error response:', err.response?.data);
              setEndSuggestions([]);
              setShowEndSuggestions(false);
              setSearching(false);
              
              // Show more helpful error message
              let errorMsg = 'Failed to search. ';
              if (err.response?.status === 500) {
                errorMsg += 'Server error. Please try again.';
              } else if (err.response?.status === 429) {
                errorMsg += 'Too many requests. Please wait a moment.';
              } else if (!err.response) {
                errorMsg += 'Check your connection.';
              } else {
                errorMsg += 'Please try again.';
              }
              setEndError(errorMsg);
            }
          });
      }, 300);
      return () => clearTimeout(timer);
    } else {
      setEndSuggestions([]);
      setShowEndSuggestions(false);
      setSearching(false);
      setEndError(null);
    }
  }, [endQuery, selectedEnd]);

  const handleStartSelect = (place) => {
    setSelectedStart(place);
    setStartQuery(place.name);
    setShowStartSuggestions(false);
    setUsingMyLocation(false);
  };

  const handleEndSelect = (place) => {
    setSelectedEnd(place);
    setEndQuery(place.name);
    setShowEndSuggestions(false);
  };

  const handleUseMyLocation = async () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser');
      return;
    }

    setLocationLoading(true);
    setUsingMyLocation(true);
    setStartQuery('Getting your location...');

    // Improved GPS accuracy: Use high accuracy mode with shorter timeout and fresher data
    const tryGetLocation = (useHighAccuracy = true) => {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude, accuracy } = position.coords;
          
          // Reverse geocode to get actual place name instead of just coordinates
          let locationName = 'My Current Location';
          let locationAddress = `Lat: ${latitude.toFixed(4)}, Lng: ${longitude.toFixed(4)}`;
          
          try {
            // Get actual place name from coordinates
            const response = await axios.post('/api/reports/reverse-geocode', {
              lat: latitude,
              lng: longitude
            });
            
            if (response.data && response.data.name) {
              locationName = response.data.name;
              locationAddress = response.data.address || locationAddress;
            }
          } catch (err) {
            console.error('Reverse geocode error:', err);
            // Continue with coordinates if reverse geocode fails
          }
          
          const location = {
            lat: latitude,
            lng: longitude,
            name: locationName,
            address: locationAddress,
            accuracy: accuracy // Store accuracy for reference
          };

          setSelectedStart(location);
          setStartQuery(`📍 ${locationName}`);
          setLocationLoading(false);
          
          // Notify parent component
          if (onUseMyLocation) {
            onUseMyLocation(location);
          }
        },
        (error) => {
          // If high accuracy failed, try with lower accuracy as fallback
          if (useHighAccuracy && error.code !== error.PERMISSION_DENIED) {
            tryGetLocation(false);
            return;
          }

          // Final error handling
          let errorMessage = 'Unable to get your location';
          switch(error.code) {
            case error.PERMISSION_DENIED:
              errorMessage = 'Location access denied. Please enable location permissions in your browser settings.';
              break;
            case error.POSITION_UNAVAILABLE:
              errorMessage = 'Location information unavailable. Please try again or check your GPS/WiFi.';
              break;
            case error.TIMEOUT:
              errorMessage = 'Location request timed out. Please try again.';
              break;
          }
          alert(errorMessage);
          setUsingMyLocation(false);
          setStartQuery('');
          setLocationLoading(false);
        },
        {
          enableHighAccuracy: useHighAccuracy, // Use high accuracy for better precision
          timeout: 15000, // 15 seconds (reduced from 20 for faster response)
          maximumAge: 30000 // Only allow 30-second old cached location (much fresher than 5 minutes)
        }
      );
    };

    // Start with high accuracy GPS for better precision
    tryGetLocation(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (selectedStart && selectedEnd) {
      onSearch(selectedStart, selectedEnd);
    }
  };

  const clearStart = () => {
    setSelectedStart(null);
    setStartQuery('');
    setUsingMyLocation(false);
  };

  const clearEnd = () => {
    setSelectedEnd(null);
    setEndQuery('');
  };

  // Dismiss errors when clicking on inputs or outside error messages
  useEffect(() => {
    const handleClick = (event) => {
      const target = event.target;
      
      // Clear errors when:
      // 1. Clicking on any input field
      // 2. Clicking outside the error message (but not on dismiss button)
      if (target.tagName === 'INPUT' || 
          (!target.closest('.suggestion-error') && !target.closest('.error-dismiss'))) {
        // Only clear if clicking on a different input or outside
        if (target.id === 'start' && endError) {
          setEndError(null);
        } else if (target.id === 'destination' && startError) {
          setStartError(null);
        } else if (target.tagName === 'INPUT') {
          // Clicking on any input clears both errors (user is starting fresh)
          setStartError(null);
          setEndError(null);
        }
      }
    };

    if (startError || endError) {
      document.addEventListener('click', handleClick);
      return () => {
        document.removeEventListener('click', handleClick);
      };
    }
  }, [startError, endError]);

  return (
    <div className="route-search-form">
      <form onSubmit={handleSubmit} className="search-form">
        <div className="input-group">
          <label htmlFor="start">Start location</label>
          <div className="input-wrapper">
            <input
              id="start"
              type="text"
              placeholder="e.g., Norrsken, CHUK, KN 4, KG 7 Ave"
              value={startQuery}
              onChange={(e) => {
                setStartQuery(e.target.value);
                setSelectedStart(null);
                setUsingMyLocation(false);
                setStartError(null); // Clear error when user starts typing
              }}
              onFocus={() => {
                if (startSuggestions.length > 0) setShowStartSuggestions(true);
              }}
              disabled={loading || locationLoading}
              ref={startRef}
            />
            {selectedStart && (
              <button type="button" className="clear-btn" onClick={clearStart}>
                ×
              </button>
            )}
            {searching && startQuery.trim().length >= 1 && (
              <div className="suggestions">
                <div className="suggestion-item suggestion-loading">
                  <div className="suggestion-name">Searching...</div>
                </div>
              </div>
            )}
            {startError && !searching && (
              <div className="suggestions">
                <div className="suggestion-item suggestion-error">
                  <div className="suggestion-name">{startError}</div>
                  <button 
                    type="button"
                    className="error-dismiss"
                    onClick={() => setStartError(null)}
                    aria-label="Dismiss error"
                  >
                    ×
                  </button>
                </div>
              </div>
            )}
            {showStartSuggestions && startSuggestions.length > 0 && !searching && (
              <div className="suggestions">
                {startSuggestions.map((place, idx) => (
                  <div
                    key={place.id || idx}
                    className="suggestion-item"
                    onClick={() => handleStartSelect(place)}
                  >
                    <div className="suggestion-name">
                      {place.type === 'road' && '🛣️ '}
                      {place.type === 'cafe' && '☕ '}
                      {place.type === 'shop' && '🛒 '}
                      {place.type === 'school' && '🏫 '}
                      {place.type === 'hospital' && '🏥 '}
                      {place.name}
                    </div>
                    <div className="suggestion-address">{place.address}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            className="use-location-btn"
            onClick={handleUseMyLocation}
            disabled={loading || locationLoading}
            title="Use your current GPS location as start point"
          >
            {locationLoading ? '📍 Getting location...' : '📍 Use My Location'}
          </button>
        </div>
        
        <div className="input-group">
          <label htmlFor="destination">Destination</label>
          <div className="input-wrapper">
            <input
              id="destination"
              type="text"
              placeholder="e.g., Norrsken, CHUK, KN 4, KG 7 Ave"
              value={endQuery}
              onChange={(e) => {
                setEndQuery(e.target.value);
                setSelectedEnd(null);
                setEndError(null); // Clear error when user starts typing
              }}
              onFocus={() => {
                if (endSuggestions.length > 0) setShowEndSuggestions(true);
              }}
              disabled={loading}
              ref={endRef}
            />
            {selectedEnd && (
              <button type="button" className="clear-btn" onClick={clearEnd}>
                ×
              </button>
            )}
            {searching && endQuery.trim().length > 1 && (
              <div className="suggestions">
                <div className="suggestion-item suggestion-loading">
                  <div className="suggestion-name">Searching...</div>
                </div>
              </div>
            )}
            {endError && !searching && endQuery.trim().length >= 1 && (
              <div className="suggestions">
                <div className="suggestion-item suggestion-error">
                  <div className="suggestion-name">{endError}</div>
                  <button 
                    type="button"
                    className="error-dismiss"
                    onClick={() => setEndError(null)}
                    aria-label="Dismiss error"
                  >
                    ×
                  </button>
                </div>
              </div>
            )}
            {showEndSuggestions && endSuggestions.length > 0 && !searching && (
              <div className="suggestions">
                {endSuggestions.map((place, idx) => (
                  <div
                    key={place.id || idx}
                    className="suggestion-item"
                    onClick={() => handleEndSelect(place)}
                  >
                    <div className="suggestion-name">
                      {place.type === 'road' && '🛣️ '}
                      {place.type === 'cafe' && '☕ '}
                      {place.type === 'shop' && '🛒 '}
                      {place.type === 'school' && '🏫 '}
                      {place.type === 'hospital' && '🏥 '}
                      {place.name}
                    </div>
                    <div className="suggestion-address">{place.address}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        
        <button 
          type="submit" 
          className="search-button"
          disabled={loading || !selectedStart || !selectedEnd}
        >
          {loading ? 'Finding routes...' : 'Find routes'}
        </button>
      </form>
    </div>
  );
}

export default RouteSearchForm;
