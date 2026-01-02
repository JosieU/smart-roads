import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import Header from './components/Header';
import RouteSearchForm from './components/RouteSearchForm';
import RouteList from './components/RouteList';
import MapView from './components/MapView';
import TrafficReportForm from './components/TrafficReportForm';
import SmartReminder from './components/SmartReminder';
import ScheduleManager from './components/ScheduleManager';
import FeedbackForm from './components/FeedbackForm';
import FloatingFeedbackButton from './components/FloatingFeedbackButton';
import Dashboard from './components/Dashboard';
import axios from './config/axios';
import { checkForReminders, saveTrip } from './utils/scheduleStorage';

function App() {
  const [routes, setRoutes] = useState([]);
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [startPlace, setStartPlace] = useState(null);
  const [endPlace, setEndPlace] = useState(null);
  const [reminder, setReminder] = useState(null);
  const [showScheduleManager, setShowScheduleManager] = useState(false);
  const [showFeedbackForm, setShowFeedbackForm] = useState(false);
  const [showInstallInstructions, setShowInstallInstructions] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [isMapExpanded, setIsMapExpanded] = useState(false);
  const [showRoutes, setShowRoutes] = useState(true);
  const [weatherData, setWeatherData] = useState(null);
  const [showDashboard, setShowDashboard] = useState(false);
  const [snoozedReminders, setSnoozedReminders] = useState(new Set());
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [recalculatingRoutes, setRecalculatingRoutes] = useState(false);
  const [recalculationMessage, setRecalculationMessage] = useState(null);
  const reminderCheckInterval = useRef(null);
  const installPromptRef = useRef(null);

  const handleSearch = async (start, end) => {
    setLoading(true);
    setError(null);
    setSelectedRoute(null);
    
    try {
      const response = await axios.post('/api/routes/alternatives', {
        start,
        end
      });
      
      setRoutes(response.data.routes);
      setStartPlace(response.data.start);
      setEndPlace(response.data.end);
      
      // Auto-select first route if available
      if (response.data.routes.length > 0) {
        setSelectedRoute(response.data.routes[0].id);
      }

      // Save trip to history for habit learning
      if (response.data.start && response.data.end) {
        saveTrip({
          start: response.data.start,
          destination: response.data.end
        });
      }
    } catch (err) {
      setError('Failed to fetch routes. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleRouteSelect = (routeId) => {
    setSelectedRoute(routeId);
  };

  const handleUseMyLocation = (location) => {
    // Location is already set in RouteSearchForm
    // This callback can be used for additional actions if needed
  };

  // Handle route deviation - recalculate routes from current position
  const handleRouteDeviation = async ({ currentLocation, destination, distance }) => {
    if (!destination || !currentLocation) {
      return;
    }

    setRecalculatingRoutes(true);
    setRecalculationMessage(`You've deviated from the route (${distance}m away). Recalculating from your current position...`);

    try {
      // Recalculate routes from current location to destination
      await handleSearch(currentLocation, destination);
      
      setRecalculationMessage('Routes recalculated! New routes from your current position are now available.');
      
      // Auto-hide message after 5 seconds
      setTimeout(() => {
        setRecalculationMessage(null);
      }, 5000);
    } catch (err) {
      setRecalculationMessage('Failed to recalculate routes. Please try again.');
      console.error('Route recalculation error:', err);
      
      // Hide error message after 5 seconds
      setTimeout(() => {
        setRecalculationMessage(null);
      }, 5000);
    } finally {
      setRecalculatingRoutes(false);
    }
  };

  // Check for reminders on app load and periodically
  useEffect(() => {
    const checkReminders = () => {
      const activeReminder = checkForReminders();
      if (activeReminder) {
        const reminderId = activeReminder.type === 'schedule' 
          ? activeReminder.schedule.id 
          : activeReminder.trip?.id;
        
        // Don't show if snoozed
        if (!snoozedReminders.has(reminderId)) {
          setReminder(activeReminder);
        }
      } else {
        setReminder(null);
      }
    };

    // Check immediately
    checkReminders();

    // Check every minute while app is open
    reminderCheckInterval.current = setInterval(checkReminders, 60000);

    return () => {
      if (reminderCheckInterval.current) {
        clearInterval(reminderCheckInterval.current);
      }
    };
  }, [snoozedReminders]);

  // Handle PWA install prompt
  useEffect(() => {
    // Check if app is already installed
    if (window.matchMedia('(display-mode: standalone)').matches || 
        window.navigator.standalone === true) {
      setIsInstalled(true);
      return;
    }

    // Listen for the beforeinstallprompt event
    const handleBeforeInstallPrompt = (e) => {
      // Prevent the mini-infobar from appearing
      e.preventDefault();
      // Store the event for later use
      setDeferredPrompt(e);
      installPromptRef.current = e;
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // Listen for app installed event
    window.addEventListener('appinstalled', () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      installPromptRef.current = null;
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', () => {});
    };
  }, []);

  const handleInstallClick = async (platform) => {
    if (platform === 'android') {
      if (deferredPrompt || installPromptRef.current) {
        const prompt = deferredPrompt || installPromptRef.current;
        prompt.prompt();
        const { outcome } = await prompt.userChoice;
        
        if (outcome === 'accepted') {
          setIsInstalled(true);
        }
        
        setDeferredPrompt(null);
        installPromptRef.current = null;
      } else {
        setShowInstallInstructions(true);
      }
    } else if (platform === 'ios') {
      setShowInstallInstructions(true);
    } else {
      // Generic install
      if (deferredPrompt || installPromptRef.current) {
        const prompt = deferredPrompt || installPromptRef.current;
        prompt.prompt();
        const { outcome } = await prompt.userChoice;
        
        if (outcome === 'accepted') {
          setIsInstalled(true);
        }
        
        setDeferredPrompt(null);
        installPromptRef.current = null;
      } else {
        setShowInstallInstructions(true);
      }
    }
  };

  const handleReminderShowRoutes = async (destination) => {
    setReminder(null);
    
    // If no destination (useCurrentLocation schedule), just let user fill form manually
    if (!destination || (reminder?.schedule?.useCurrentLocation)) {
      // User can use "Use My Location" button in the form
      return;
    }
    
    // If destination is just a name (string), we need to geocode it
    if (typeof destination === 'string' || (destination.name && !destination.lat)) {
      try {
        const response = await axios.post('/api/geocode', {
          placeName: destination.name || destination
        });
        
        if (response.data && response.data.lat && response.data.lng) {
          const geocodedDestination = {
            name: destination.name || destination,
            lat: response.data.lat,
            lng: response.data.lng
          };
          
          // Use current location as start if available, otherwise use default
          const start = startPlace || { 
            name: 'Current Location', 
            lat: -1.9441, 
            lng: 30.0619 
          };
          
          await handleSearch(start, geocodedDestination);
        }
      } catch (err) {
        console.error('Failed to geocode destination:', err);
        alert('Could not find that destination. Please search manually.');
      }
    } else if (destination.lat && destination.lng) {
      // Destination has coordinates, use it directly
      const start = startPlace || { 
        name: 'Current Location', 
        lat: -1.9441, 
        lng: 30.0619 
      };
      await handleSearch(start, destination);
    }
  };

  const handleReminderDismiss = () => {
    setReminder(null);
  };

  const handleReminderSnooze = () => {
    if (reminder) {
      const reminderId = reminder.type === 'schedule' 
        ? reminder.schedule.id 
        : reminder.trip?.id;
      setSnoozedReminders(prev => new Set([...prev, reminderId]));
      setReminder(null);
      
      // Clear snooze after 1 hour
      setTimeout(() => {
        setSnoozedReminders(prev => {
          const next = new Set(prev);
          next.delete(reminderId);
          return next;
        });
      }, 60 * 60 * 1000);
    }
  };

  const handleDestinationSelect = (callback) => {
    // Close schedule manager temporarily to allow destination selection
    // This is a simplified approach - in a full implementation, you might
    // want a more sophisticated flow
    setShowScheduleManager(false);
    // For now, we'll just show an alert - user can manually select in the form
    alert('Please use the route search form to select a destination, then return to create the schedule.');
    setTimeout(() => setShowScheduleManager(true), 100);
  };

  // Prevent body scroll when map is expanded
  useEffect(() => {
    if (isMapExpanded) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMapExpanded]);

  // Check if dashboard should be shown (via URL parameter)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('dashboard') === 'true' || params.get('admin') === 'true') {
      setShowDashboard(true);
    }
  }, []);

  // If dashboard is shown, render only dashboard
  if (showDashboard) {
    return (
      <div className="App">
        <div className="dashboard-toggle-bar">
          <button 
            className="back-to-app-btn"
            onClick={() => {
              setShowDashboard(false);
              window.history.pushState({}, '', window.location.pathname);
            }}
          >
            ← Back to App
          </button>
        </div>
        <Dashboard />
      </div>
    );
  }

  return (
    <div className="App">
      <Header 
        onOpenSchedules={() => setShowScheduleManager(true)}
        weather={weatherData}
      />
      
      <main className="main-container">
        {/* Left side: search + routes */}
        <div className="left-panel">
          {/* Smart Reminder */}
          {reminder && (
            <SmartReminder
              reminder={reminder}
              onShowRoutes={handleReminderShowRoutes}
              onDismiss={handleReminderDismiss}
              onSnooze={handleReminderSnooze}
            />
          )}

          <RouteSearchForm 
            onSearch={handleSearch} 
            loading={loading}
            onUseMyLocation={handleUseMyLocation}
          />
          
          {error && <div className="error-message">{error}</div>}
          
          {/* Route Recalculation Notification */}
          {recalculationMessage && (
            <div className={`recalculation-notification ${recalculatingRoutes ? 'recalculating' : 'completed'}`}>
              <div className="notification-content">
                {recalculatingRoutes ? (
                  <>
                    <span className="notification-icon">🔄</span>
                    <span className="notification-text">{recalculationMessage}</span>
                  </>
                ) : (
                  <>
                    <span className="notification-icon">✅</span>
                    <span className="notification-text">{recalculationMessage}</span>
                    <button 
                      className="notification-close"
                      onClick={() => setRecalculationMessage(null)}
                      aria-label="Close notification"
                    >
                      ×
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
          
          {routes.length > 0 && (
            <div className="routes-section">
              <div className="routes-header">
                <h2 className="routes-title">Available Routes ({routes.length})</h2>
                <button 
                  className="toggle-routes-btn"
                  onClick={() => setShowRoutes(!showRoutes)}
                  aria-label={showRoutes ? 'Hide routes' : 'Show routes'}
                >
                  {showRoutes ? '▼ Hide' : '▶ Show'} Routes
                </button>
              </div>
              {showRoutes && (
                <RouteList 
                  routes={routes} 
                  selectedRoute={selectedRoute}
                  onRouteSelect={handleRouteSelect}
                />
              )}
            </div>
          )}
        </div>

        {/* Right side: map */}
        <div className={`right-panel ${isMapExpanded ? 'expanded' : ''}`}>
          <button 
            className="map-expand-float"
            onClick={() => setIsMapExpanded(true)}
            aria-label="Expand map to fullscreen"
          >
            ▲ Expand Map
          </button>
          <div className="map-header">
            <h3>Map View</h3>
            <button 
              className="expand-map-btn"
              onClick={() => setIsMapExpanded(!isMapExpanded)}
              aria-label={isMapExpanded ? 'Collapse map' : 'Expand map'}
            >
              {isMapExpanded ? '▼ Collapse' : '▲ Expand'} Map
            </button>
          </div>
          <MapView 
            routes={routes}
            selectedRoute={selectedRoute}
            startPlace={startPlace}
            endPlace={endPlace}
            onWeatherChange={setWeatherData}
            onRouteDeviation={handleRouteDeviation}
          />
        </div>
      </main>

      {/* Traffic Report Section */}
      <section className="report-section">
        <TrafficReportForm />
      </section>

      {/* Schedule Manager Modal */}
      <ScheduleManager
        isOpen={showScheduleManager}
        onClose={() => setShowScheduleManager(false)}
        onSelectDestination={handleDestinationSelect}
      />

      {/* Feedback Form Modal */}
      <FeedbackForm
        isOpen={showFeedbackForm}
        onClose={() => setShowFeedbackForm(false)}
      />

      {/* Floating Feedback Button */}
      <FloatingFeedbackButton
        onClick={() => setShowFeedbackForm(true)}
      />

      <footer className="app-footer">
        <div className="footer-container">
          <div className="footer-section">
            <h3 className="footer-heading">Smart Roads</h3>
            <p className="footer-tagline">Navigate Smarter, Drive Safer</p>
            {isInstalled && (
              <span className="installed-badge">✓ App Installed</span>
            )}
          </div>

          <div className="footer-section">
            <h3 className="footer-heading">Install App</h3>
            <div className="install-links">
              <a 
                href="#" 
                className="install-link"
                onClick={(e) => {
                  e.preventDefault();
                  handleInstallClick('android');
                }}
              >
                📱 Android
              </a>
              <a 
                href="#" 
                className="install-link"
                onClick={(e) => {
                  e.preventDefault();
                  handleInstallClick('ios');
                }}
              >
                🍎 iOS
              </a>
            </div>
            {!isInstalled && (
              <p className="install-hint">Click your platform above to install</p>
            )}
          </div>

          <div className="footer-section">
            <h3 className="footer-heading">Help</h3>
            <a 
              href="#" 
              className="footer-link"
              onClick={(e) => {
                e.preventDefault();
                setShowHelp(true);
              }}
            >
              How to Use
            </a>
            <a 
              href="#" 
              className="footer-link"
              onClick={(e) => {
                e.preventDefault();
                setShowFeedbackForm(true);
              }}
            >
              Feedback
            </a>
          </div>
        </div>

        <div className="footer-bottom">
          <p>© 2025 Smart Roads. All rights reserved.</p>
        </div>
      </footer>

      {/* Install Instructions Modal */}
      {showInstallInstructions && (
        <div className="modal-overlay" onClick={() => setShowInstallInstructions(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowInstallInstructions(false)}>×</button>
            <h2>Install Smart Roads App</h2>
            
            <div className="install-instructions">
              <div className="instruction-section">
                <h3>📱 For Android:</h3>
                <ol>
                  <li>Open this page in <strong>Chrome</strong> browser</li>
                  <li>Tap the <strong>menu</strong> (3 dots) in the top right</li>
                  <li>Tap <strong>"Add to Home screen"</strong> or <strong>"Install app"</strong></li>
                  <li>Tap <strong>"Add"</strong> or <strong>"Install"</strong> to confirm</li>
                </ol>
              </div>

              <div className="instruction-section">
                <h3>🍎 For iOS (iPhone/iPad):</h3>
                <ol>
                  <li>Open this page in <strong>Safari</strong> browser (not Chrome)</li>
                  <li>Tap the <strong>Share</strong> button (square with arrow up)</li>
                  <li>Scroll down and tap <strong>"Add to Home Screen"</strong></li>
                  <li>Tap <strong>"Add"</strong> in the top right</li>
                </ol>
              </div>

              <div className="instruction-section">
                <h3>💡 After Installation:</h3>
                <ul>
                  <li>The app will appear on your home screen</li>
                  <li>Tap the icon to open Smart Roads</li>
                  <li>Works offline for viewing schedules and history</li>
                  <li>Internet required for live traffic reports and routes</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Help/How to Use Modal */}
      {showHelp && (
        <div className="modal-overlay" onClick={() => setShowHelp(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowHelp(false)}>×</button>
            <h2>How to Use Smart Roads</h2>
            
            <div className="help-content">
              <div className="help-section">
                <h3>🗺️ Finding Routes</h3>
                <ol>
                  <li>Enter your <strong>starting location</strong> (or use "Use My Location")</li>
                  <li>Enter your <strong>destination</strong></li>
                  <li>Tap <strong>"Find Routes"</strong></li>
                  <li>View alternative routes with traffic information</li>
                  <li>Select a route to see it on the map</li>
                </ol>
              </div>

              <div className="help-section">
                <h3>🚦 Reporting Traffic</h3>
                <ol>
                  <li>Scroll to the <strong>"Report Traffic"</strong> section</li>
                  <li>Tap <strong>"Use My Location"</strong> to get your current location</li>
                  <li>Select the traffic status: Light, Medium, Heavy, Blocked, or Accident</li>
                  <li>Tap <strong>"Submit Report"</strong></li>
                  <li>Your report helps other drivers!</li>
                </ol>
              </div>

              <div className="help-section">
                <h3>⏰ Smart Reminders</h3>
                <ol>
                  <li>Tap the <strong>Schedule</strong> icon in the header</li>
                  <li>Add your regular trips or schedules</li>
                  <li>The app will remind you before your scheduled time</li>
                  <li>Get traffic alerts for your routes</li>
                </ol>
              </div>

              <div className="help-section">
                <h3>📊 Understanding Routes</h3>
                <ul>
                  <li><strong>🟢 Green:</strong> Light traffic</li>
                  <li><strong>🟡 Yellow:</strong> Medium traffic</li>
                  <li><strong>🔴 Red:</strong> Heavy traffic</li>
                  <li><strong>⛔ Blocked:</strong> Road is blocked</li>
                  <li><strong>🚨 Accident:</strong> Accident reported</li>
                </ul>
              </div>

              <div className="help-section">
                <h3>🌐 Internet Requirements</h3>
                <ul>
                  <li><strong>With Internet:</strong> Live reports, route finding, maps, GPS</li>
                  <li><strong>Without Internet:</strong> View schedules, trip history, basic navigation</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
