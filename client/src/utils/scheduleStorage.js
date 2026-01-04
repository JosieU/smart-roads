// Utility functions for managing schedules and trip history in localStorage

const SCHEDULES_KEY = 'smartRoutesSchedules';
const TRIP_HISTORY_KEY = 'smartRoutesTripHistory';
const MAX_HISTORY_ITEMS = 50; // Keep last 50 trips

// ========== SCHEDULES ==========

export const saveSchedule = (schedule) => {
  const schedules = getSchedules();
  const existingIndex = schedules.findIndex(s => s.id === schedule.id);
  
  if (existingIndex >= 0) {
    schedules[existingIndex] = schedule;
  } else {
    schedules.push(schedule);
  }
  
  localStorage.setItem(SCHEDULES_KEY, JSON.stringify(schedules));
  return schedules;
};

export const getSchedules = () => {
  try {
    const raw = localStorage.getItem(SCHEDULES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error('Error reading schedules:', err);
    return [];
  }
};

export const deleteSchedule = (scheduleId) => {
  const schedules = getSchedules();
  const filtered = schedules.filter(s => s.id !== scheduleId);
  localStorage.setItem(SCHEDULES_KEY, JSON.stringify(filtered));
  return filtered;
};

export const toggleScheduleActive = (scheduleId) => {
  const schedules = getSchedules();
  const updated = schedules.map(s => 
    s.id === scheduleId ? { ...s, active: !s.active } : s
  );
  localStorage.setItem(SCHEDULES_KEY, JSON.stringify(updated));
  return updated;
};

// ========== TRIP HISTORY ==========

export const saveTrip = (trip) => {
  const history = getTripHistory();
  
  // Add new trip at the beginning
  history.unshift({
    ...trip,
    timestamp: new Date().toISOString(),
    id: `trip-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  });
  
  // Keep only last N trips
  const trimmed = history.slice(0, MAX_HISTORY_ITEMS);
  
  localStorage.setItem(TRIP_HISTORY_KEY, JSON.stringify(trimmed));
  return trimmed;
};

export const getTripHistory = () => {
  try {
    const raw = localStorage.getItem(TRIP_HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error('Error reading trip history:', err);
    return [];
  }
};

// ========== REMINDER LOGIC ==========

export const checkForReminders = () => {
  const now = new Date();
  const todayISO = now.toISOString().split('T')[0]; // YYYY-MM-DD format
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  
  // Check active schedules
  const schedules = getSchedules().filter(s => s.active);
  const matchingSchedule = schedules.find(schedule => {
    // Check if schedule date matches today
    // Handle backward compatibility: if schedule has 'days', check day name
    let dateMatches = false;
    
    if (schedule.date) {
      // New format: check if date matches today
      dateMatches = schedule.date === todayISO;
    } else if (schedule.days) {
      // Old format: check if current day is in days array
      const currentDay = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][now.getDay()];
      dateMatches = schedule.days.includes(currentDay);
    } else {
      // No date or days - skip this schedule
      return false;
    }
    
    if (!dateMatches) return false;
    
    // Check if time matches (within 10-minute window)
    const [h, m] = schedule.time.split(':').map(Number);
    const scheduleMinutes = h * 60 + m;
    const diff = Math.abs(scheduleMinutes - currentMinutes);
    
    // Within 10-minute window
    return diff <= 10;
  });
  
  if (matchingSchedule) {
    let message = `${matchingSchedule.label || 'Scheduled trip'} is starting now.`;
    if (matchingSchedule.useCurrentLocation) {
      message = `${matchingSchedule.label || 'Scheduled trip'} is starting now. Ready to find routes from your current location?`;
    }
    return {
      type: 'schedule',
      schedule: matchingSchedule,
      message: message
    };
  }
  
  // Check trip history for habits (yesterday's trips in similar time window)
  // If app is opened between 9-11 AM, check if there was a trip yesterday between 9-11 AM
  const history = getTripHistory();
  if (history.length > 0) {
    const currentHour = now.getHours();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    
    // Define time window: ±1 hour from current time (e.g., if opened at 10 AM, check 9-11 AM)
    const windowStartMinutes = currentMinutes - 60; // 1 hour before
    const windowEndMinutes = currentMinutes + 60;   // 1 hour after
    
    // Find trips from yesterday within the same time window
    const yesterdayTrips = history.filter(trip => {
      const tripDate = new Date(trip.timestamp);
      const today = new Date(now);
      today.setHours(0, 0, 0, 0);
      const tripDay = new Date(tripDate);
      tripDay.setHours(0, 0, 0, 0);
      
      // Calculate days difference
      const daysDiff = Math.floor((today - tripDay) / (1000 * 60 * 60 * 24));
      
      // Must be from yesterday (exactly 1 day ago)
      if (daysDiff !== 1) {
        return false;
      }
      
      // Check if trip time is within the current time window (±1 hour)
      const tripMinutes = tripDate.getHours() * 60 + tripDate.getMinutes();
      return tripMinutes >= windowStartMinutes && tripMinutes <= windowEndMinutes;
    });
    
    // If we found trips from yesterday in this time window, suggest the most recent one
    if (yesterdayTrips.length > 0) {
      // Get the most recent trip from yesterday
      const suggestedTrip = yesterdayTrips.sort((a, b) => 
        new Date(b.timestamp) - new Date(a.timestamp)
      )[0];
      
      if (suggestedTrip && suggestedTrip.destination) {
        const tripTime = new Date(suggestedTrip.timestamp);
        const timeStr = tripTime.toLocaleTimeString('en-US', { 
          hour: 'numeric', 
          minute: '2-digit',
          hour12: true 
        });
        
        return {
          type: 'habit',
          trip: suggestedTrip,
          message: `Yesterday at ${timeStr} you went to ${suggestedTrip.destination.name || 'this location'}. Want to go again?`
        };
      }
    }
  }
  
  return null;
};

// Generate unique ID for new schedule
export const generateScheduleId = () => {
  return `schedule-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

