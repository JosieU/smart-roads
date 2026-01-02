import React, { useState } from 'react';
import './SmartReminder.css';

function SmartReminder({ reminder, onShowRoutes, onDismiss, onSnooze }) {
  const [isDismissed, setIsDismissed] = useState(false);

  if (!reminder || isDismissed) return null;

  const handleDismiss = () => {
    setIsDismissed(true);
    if (onDismiss) onDismiss();
  };

  const handleSnooze = () => {
    setIsDismissed(true);
    if (onSnooze) onSnooze();
  };

  const isSchedule = reminder.type === 'schedule';
  const destination = isSchedule 
    ? reminder.schedule.destination 
    : reminder.trip?.destination;

  return (
    <div className="smart-reminder">
      <div className="reminder-icon">
        {isSchedule ? '🕘' : '💡'}
      </div>
      <div className="reminder-content">
        <div className="reminder-title">
          {isSchedule ? 'Scheduled Trip' : 'Smart Suggestion'}
        </div>
        <div className="reminder-message">
          {reminder.message}
        </div>
        {destination && (
          <div className="reminder-destination">
            📍 {typeof destination === 'string' ? destination : (destination.name || 'Destination')}
          </div>
        )}
      </div>
      <div className="reminder-actions">
        <button 
          className="reminder-btn reminder-btn-primary"
          onClick={() => {
            setIsDismissed(true);
            if (onShowRoutes) onShowRoutes(destination);
          }}
        >
          Yes
        </button>
        <button 
          className="reminder-btn reminder-btn-secondary"
          onClick={handleSnooze}
        >
          Snooze
        </button>
        <button 
          className="reminder-btn reminder-btn-close"
          onClick={handleDismiss}
          title="Dismiss"
        >
          ×
        </button>
      </div>
    </div>
  );
}

export default SmartReminder;

