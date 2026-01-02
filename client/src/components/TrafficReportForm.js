import React, { useState } from 'react';
import './TrafficReportForm.css';
import StatusBadge from './StatusBadge';
import axios from '../config/axios';

function TrafficReportForm() {
  const [selectedStatus, setSelectedStatus] = useState(null);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [streetName, setStreetName] = useState(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState(null);

  // Get user's current location and detect street name
  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported by your browser');
      return;
    }

    setLocationLoading(true);
    setLocationError(null);
    setCurrentLocation(null);
    setStreetName(null);

    // First try: Fast network-based location (faster, works indoors)
    const tryGetLocation = async (useHighAccuracy = false) => {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          const location = { lat: latitude, lng: longitude };
          setCurrentLocation(location);

          // Reverse geocode to get street name
          try {
            const response = await axios.post('/api/reports/reverse-geocode', {
              lat: latitude,
              lng: longitude
            });
            
            if (response.data && response.data.streetName) {
              setStreetName(response.data.streetName);
            } else {
              setStreetName('Current Location');
            }
          } catch (err) {
            console.error('Reverse geocode error:', err);
            setStreetName('Current Location');
          } finally {
            setLocationLoading(false);
          }
        },
        (error) => {
          // If first attempt failed and we haven't tried high accuracy, retry with it
          if (!useHighAccuracy && error.code !== error.PERMISSION_DENIED) {
            tryGetLocation(true);
            return;
          }

          // Final error handling
          console.error('Geolocation error:', error);
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
          setLocationError(errorMessage);
          setLocationLoading(false);
        },
        {
          enableHighAccuracy: useHighAccuracy, // Start with false for speed, retry with true if needed
          timeout: 20000, // Increased to 20 seconds
          maximumAge: 300000 // Allow 5-minute old cached location (faster)
        }
      );
    };

    // Start with fast network-based location
    tryGetLocation(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedStatus || !currentLocation) {
      alert('Please use your current location and select a traffic status');
      return;
    }

    setSubmitting(true);
    setSubmitMessage(null);

    try {
      const response = await axios.post('/api/reports', {
        lat: currentLocation.lat,
        lng: currentLocation.lng,
        reportType: selectedStatus,
        roadName: streetName || 'Current Location'
      });

      setSubmitMessage(response.data.message);
      setSelectedStatus(null);
      
      // Clear message after 5 seconds
      setTimeout(() => setSubmitMessage(null), 5000);
    } catch (err) {
      console.error('Report submission error:', err);
      console.error('Error response:', err.response?.data);
      console.error('Error status:', err.response?.status);
      console.error('Full error:', err);
      const errorMsg = err.response?.data?.error || err.response?.data?.details || err.message || 'Failed to submit report. Please try again.';
      setSubmitMessage(`Failed to submit report: ${errorMsg}`);
    } finally {
      setSubmitting(false);
    }
  };

  const statusOptions = [
    { type: 'light', emoji: '🟢', label: 'Light' },
    { type: 'medium', emoji: '🟡', label: 'Medium' },
    { type: 'heavy', emoji: '🔴', label: 'Heavy' },
    { type: 'blocked', emoji: '⛔', label: 'Blocked' },
    { type: 'accident', emoji: '🚨', label: 'Accident' }
  ];

  return (
    <div className="traffic-report-form">
      <h2>Report Traffic</h2>
      <p className="form-subtitle">Help other drivers by reporting traffic conditions</p>

      <form onSubmit={handleSubmit} className="report-form">
        <div className="form-section">
          <label>Location</label>
          <button
            type="button"
            className="use-location-button"
            onClick={handleUseMyLocation}
            disabled={locationLoading || submitting}
          >
            {locationLoading ? (
              <>
                <span className="loading-spinner">⏳</span>
                Getting your location...
              </>
            ) : (
              <>
                <span className="location-icon">📍</span>
                Use My Current Location
              </>
            )}
          </button>
          
          {locationError && (
            <div className="location-error">{locationError}</div>
          )}
          
          {currentLocation && streetName && (
            <div className="detected-location">
              <span className="location-check">✓</span>
              <span className="location-text">
                <strong>Detected street:</strong> {streetName}
              </span>
            </div>
          )}
        </div>

        <div className="form-section">
          <label>Traffic Status</label>
          <div className="status-buttons">
            {statusOptions.map((option) => (
              <button
                key={option.type}
                type="button"
                className={`status-button ${selectedStatus === option.type ? 'selected' : ''}`}
                onClick={() => setSelectedStatus(option.type)}
                disabled={submitting}
              >
                <span className="status-emoji-large">{option.emoji}</span>
                <span className="status-label-large">{option.label}</span>
              </button>
            ))}
          </div>
        </div>

        <button 
          type="submit" 
          className="submit-button"
          disabled={submitting || !selectedStatus || !currentLocation}
        >
          {submitting ? 'Submitting...' : 'Submit Report'}
        </button>

        {submitMessage && (
          <div className={`submit-message ${submitMessage.includes('Thank you') ? 'success' : 'error'}`}>
            {submitMessage}
          </div>
        )}
      </form>
    </div>
  );
}

export default TrafficReportForm;

