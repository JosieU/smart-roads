import React, { useState, useEffect, useRef } from 'react';
import './ScheduleManager.css';
import axios from '../config/axios';
import { 
  getSchedules, 
  saveSchedule, 
  deleteSchedule, 
  toggleScheduleActive,
  generateScheduleId 
} from '../utils/scheduleStorage';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function ScheduleManager({ isOpen, onClose, onSelectDestination }) {
  const [schedules, setSchedules] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState(null);
  const [formData, setFormData] = useState({
    label: '',
    days: [],
    time: '09:00',
    destination: null,
    destinationName: '',
    useCurrentLocation: true
  });
  const [destinationSuggestions, setDestinationSuggestions] = useState([]);
  const [showDestinationSuggestions, setShowDestinationSuggestions] = useState(false);
  const [searchingDestination, setSearchingDestination] = useState(false);
  const destinationInputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setSchedules(getSchedules());
    }
  }, [isOpen]);

  const handleDayToggle = (day) => {
    setFormData(prev => ({
      ...prev,
      days: prev.days.includes(day)
        ? prev.days.filter(d => d !== day)
        : [...prev.days, day]
    }));
  };

  // Debounced search for destination suggestions
  useEffect(() => {
    if (!formData.useCurrentLocation && formData.destinationName.trim().length >= 1 && !formData.destination) {
      setSearchingDestination(true);
      const timer = setTimeout(() => {
        axios.get('/api/places/search', { params: { q: formData.destinationName } })
          .then(res => {
            let places = res.data.places || [];
            
            // Smart client-side filtering
            const queryLower = formData.destinationName.toLowerCase().trim();
            if (queryLower.length > 0) {
              places = places.filter(place => {
                const nameLower = (place.name || '').toLowerCase();
                const addressLower = (place.address || '').toLowerCase();
                const displayLower = (place.displayName || '').toLowerCase();
                
                return nameLower.includes(queryLower) || 
                       addressLower.includes(queryLower) ||
                       displayLower.includes(queryLower);
              });
              
              // Sort by relevance
              places.sort((a, b) => {
                const aName = (a.name || '').toLowerCase();
                const bName = (b.name || '').toLowerCase();
                const aStarts = aName.startsWith(queryLower) ? 0 : 1;
                const bStarts = bName.startsWith(queryLower) ? 0 : 1;
                if (aStarts !== bStarts) return aStarts - bStarts;
                return aName.localeCompare(bName);
              });
            }
            
            setDestinationSuggestions(places);
            setShowDestinationSuggestions(places.length > 0);
            setSearchingDestination(false);
          })
          .catch(err => {
            console.error('Search error:', err);
            setDestinationSuggestions([]);
            setShowDestinationSuggestions(false);
            setSearchingDestination(false);
          });
      }, 300);
      return () => clearTimeout(timer);
    } else {
      setDestinationSuggestions([]);
      setShowDestinationSuggestions(false);
      setSearchingDestination(false);
    }
  }, [formData.destinationName, formData.useCurrentLocation, formData.destination]);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (destinationInputRef.current && !destinationInputRef.current.contains(event.target)) {
        setShowDestinationSuggestions(false);
      }
    };

    if (showDestinationSuggestions) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showDestinationSuggestions]);

  const handleDestinationNameChange = (e) => {
    setFormData(prev => ({ 
      ...prev, 
      destinationName: e.target.value,
      destination: null // Clear destination object when name changes
    }));
  };

  const handleDestinationSuggestionSelect = (place) => {
    setFormData(prev => ({
      ...prev,
      destination: {
        name: place.name || place.displayName,
        lat: place.lat,
        lng: place.lng,
        address: place.address
      },
      destinationName: place.name || place.displayName,
      useCurrentLocation: false
    }));
    setShowDestinationSuggestions(false);
  };

  const handleUseCurrentLocation = () => {
    setFormData(prev => ({ 
      ...prev, 
      useCurrentLocation: true, 
      destination: null 
    }));
  };

  const handleSave = () => {
    if (formData.days.length === 0) {
      alert('Please select at least one day');
      return;
    }

    if (!formData.useCurrentLocation && !formData.destination && !formData.destinationName.trim()) {
      alert('Please enter a destination name or use current location');
      return;
    }

    const schedule = {
      id: editingSchedule?.id || generateScheduleId(),
      label: formData.label || 'Untitled Schedule',
      days: formData.days,
      time: formData.time,
      destination: formData.useCurrentLocation 
        ? null 
        : (formData.destination || { name: formData.destinationName.trim() }),
      useCurrentLocation: formData.useCurrentLocation,
      active: editingSchedule?.active !== false
    };

    saveSchedule(schedule);
    setSchedules(getSchedules());
    resetForm();
  };

  const resetForm = () => {
    setFormData({
      label: '',
      days: [],
      time: '09:00',
      destination: null,
      destinationName: '',
      useCurrentLocation: true
    });
    setEditingSchedule(null);
    setShowForm(false);
  };

  const handleEdit = (schedule) => {
    setFormData({
      label: schedule.label,
      days: schedule.days || [],
      time: schedule.time,
      destination: schedule.destination || null,
      destinationName: schedule.destination?.name || '',
      useCurrentLocation: schedule.useCurrentLocation !== false
    });
    setEditingSchedule(schedule);
    setShowForm(true);
  };

  const handleDelete = (scheduleId) => {
    if (window.confirm('Delete this schedule?')) {
      deleteSchedule(scheduleId);
      setSchedules(getSchedules());
    }
  };

  const handleToggleActive = (scheduleId) => {
    toggleScheduleActive(scheduleId);
    setSchedules(getSchedules());
  };

  if (!isOpen) return null;

  return (
    <div className="schedule-manager-overlay" onClick={onClose}>
      <div className="schedule-manager" onClick={(e) => e.stopPropagation()}>
        <div className="schedule-manager-header">
          <h2>📅 Smart Schedules</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="schedule-manager-content">
          {!showForm ? (
            <>
              <div className="schedule-list-header">
                <p className="schedule-description">
                  Set up schedules to get automatic route suggestions at specific times.
                </p>
                <button 
                  className="btn-add-schedule"
                  onClick={() => setShowForm(true)}
                >
                  + New Schedule
                </button>
              </div>

              <div className="schedule-list">
                {schedules.length === 0 ? (
                  <div className="empty-schedules">
                    <div className="empty-icon">📅</div>
                    <p>No schedules yet</p>
                    <p className="empty-hint">Create one to get smart reminders!</p>
                  </div>
                ) : (
                  schedules.map(schedule => (
                    <div 
                      key={schedule.id} 
                      className={`schedule-item ${!schedule.active ? 'inactive' : ''}`}
                    >
                      <div className="schedule-main">
                        <div className="schedule-header">
                          <h3>{schedule.label}</h3>
                          <label className="toggle-switch">
                            <input
                              type="checkbox"
                              checked={schedule.active}
                              onChange={() => handleToggleActive(schedule.id)}
                            />
                            <span className="toggle-slider"></span>
                          </label>
                        </div>
                        <div className="schedule-details">
                          <div className="schedule-time">
                            🕐 {schedule.time}
                          </div>
                          <div className="schedule-days">
                            {schedule.days.map(day => (
                              <span key={day} className="day-badge">{day}</span>
                            ))}
                          </div>
                          <div className="schedule-destination">
                            {schedule.useCurrentLocation ? (
                              <span>📍 From current location</span>
                            ) : (
                              <span>📍 To {schedule.destination?.name || 'Unknown'}</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="schedule-actions">
                        <button 
                          className="btn-edit"
                          onClick={() => handleEdit(schedule)}
                        >
                          Edit
                        </button>
                        <button 
                          className="btn-delete"
                          onClick={() => handleDelete(schedule.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          ) : (
            <div className="schedule-form">
              <h3>{editingSchedule ? 'Edit Schedule' : 'New Schedule'}</h3>
              
              <div className="form-group">
                <label>Label (e.g., "Morning Commute")</label>
                <input
                  type="text"
                  value={formData.label}
                  onChange={(e) => setFormData(prev => ({ ...prev, label: e.target.value }))}
                  placeholder="Morning Commute"
                />
              </div>

              <div className="form-group">
                <label>Time</label>
                <input
                  type="time"
                  value={formData.time}
                  onChange={(e) => setFormData(prev => ({ ...prev, time: e.target.value }))}
                />
              </div>

              <div className="form-group">
                <label>Days of Week</label>
                <div className="days-selector">
                  {DAYS.map(day => (
                    <button
                      key={day}
                      className={`day-btn ${formData.days.includes(day) ? 'selected' : ''}`}
                      onClick={() => handleDayToggle(day)}
                    >
                      {day}
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label>Destination</label>
                <div className="destination-options">
                  <label className="radio-option">
                    <input
                      type="radio"
                      name="destination"
                      checked={formData.useCurrentLocation}
                      onChange={handleUseCurrentLocation}
                    />
                    <span>📍 Use current location (when reminder appears)</span>
                  </label>
                  <label className="radio-option">
                    <input
                      type="radio"
                      name="destination"
                      checked={!formData.useCurrentLocation}
                      onChange={() => setFormData(prev => ({ ...prev, useCurrentLocation: false }))}
                    />
                    <span>📍 Set specific destination</span>
                  </label>
                  {!formData.useCurrentLocation && (
                    <div className="destination-input-wrapper">
                      <div className="destination-input-container" ref={destinationInputRef}>
                        <input
                          type="text"
                          className="destination-input"
                          value={formData.destinationName}
                          onChange={handleDestinationNameChange}
                          onFocus={() => {
                            if (destinationSuggestions.length > 0) {
                              setShowDestinationSuggestions(true);
                            }
                          }}
                          placeholder="Enter destination name (e.g., Kacyiru, CHUK, Norrsken)"
                        />
                        {formData.destinationName && (
                          <button
                            className="destination-clear-btn"
                            onClick={() => {
                              setFormData(prev => ({
                                ...prev,
                                destinationName: '',
                                destination: null
                              }));
                              setShowDestinationSuggestions(false);
                            }}
                          >
                            ×
                          </button>
                        )}
                        {showDestinationSuggestions && destinationSuggestions.length > 0 && !searchingDestination && (
                          <div className="destination-suggestions">
                            {destinationSuggestions.map((place, idx) => (
                              <div
                                key={place.id || idx}
                                className="destination-suggestion-item"
                                onClick={() => handleDestinationSuggestionSelect(place)}
                              >
                                <div className="destination-suggestion-name">
                                  {place.type === 'cafe' && '☕ '}
                                  {place.type === 'shop' && '🛒 '}
                                  {place.type === 'school' && '🏫 '}
                                  {place.type === 'hospital' && '🏥 '}
                                  {place.name}
                                </div>
                                <div className="destination-suggestion-address">{place.address}</div>
                              </div>
                            ))}
                          </div>
                        )}
                        {searchingDestination && (
                          <div className="destination-suggestions">
                            <div className="destination-suggestion-loading">Searching...</div>
                          </div>
                        )}
                      </div>
                      {formData.destination && (
                        <div className="destination-selected">
                          ✓ Selected: {formData.destination.name}
                          {formData.destination.address && (
                            <span className="destination-selected-address"> - {formData.destination.address}</span>
                          )}
                        </div>
                      )}
                      <p className="destination-hint">
                        {formData.destination 
                          ? 'Destination selected. You can change it by typing a new name.'
                          : 'Start typing to see suggestions, or enter a place name.'}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="form-actions">
                <button className="btn-cancel" onClick={resetForm}>
                  Cancel
                </button>
                <button className="btn-save" onClick={handleSave}>
                  {editingSchedule ? 'Update' : 'Create'} Schedule
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ScheduleManager;

