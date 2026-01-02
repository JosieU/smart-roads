import React from 'react';
import './Header.css';
import WeatherCard from './WeatherCard';

function Header({ onOpenSchedules, weather }) {
  // Use the image from public folder
  const headerStyle = {
    backgroundImage: `url('/images/header-bg.jpg')`
  };

  return (
    <header className="app-header" style={headerStyle}>
      <div className="header-content">
        <div className="header-text">
          <h1>Rwanda Smart Routes</h1>
          <p className="subtitle">Crowd-powered traffic reports for Kigali</p>
        </div>
        <div className="header-actions">
          {weather && (
            <div className="header-weather">
              <WeatherCard
                loading={weather.loading}
                error={weather.error}
                data={weather.data}
              />
            </div>
          )}
          {onOpenSchedules && (
            <button 
              className="header-schedule-btn"
              onClick={onOpenSchedules}
              title="Manage Smart Schedules"
            >
              📅 Schedules
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

export default Header;

