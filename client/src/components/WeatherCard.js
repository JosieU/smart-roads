import React from 'react';
import './WeatherCard.css';

function WeatherCard({ loading, error, data }) {
  if (loading) {
    return (
      <div className="weather-card">
        <div className="weather-loading">Loading weather...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="weather-card">
        <div className="weather-error">Weather unavailable</div>
      </div>
    );
  }

  const { name, main, weather, wind } = data;
  const description = weather?.[0]?.description || 'Clear';
  const icon = weather?.[0]?.icon;
  const temp = Math.round(main.temp);
  const windSpeed = Math.round(wind.speed * 3.6); // Convert m/s to km/h

  // Get weather emoji based on icon code
  const getWeatherEmoji = (iconCode) => {
    if (!iconCode) return '🌤️';
    const code = iconCode.slice(0, 2);
    const day = iconCode[2] === 'd';
    
    switch (code) {
      case '01': return day ? '☀️' : '🌙'; // Clear
      case '02': return day ? '⛅' : '☁️'; // Few clouds
      case '03': return '☁️'; // Scattered clouds
      case '04': return '☁️'; // Broken clouds
      case '09': return '🌧️'; // Shower rain
      case '10': return '🌦️'; // Rain
      case '11': return '⛈️'; // Thunderstorm
      case '13': return '❄️'; // Snow
      case '50': return '🌫️'; // Mist
      default: return '🌤️';
    }
  };

  return (
    <div className="weather-card">
      <div className="weather-main">
        <span className="weather-icon">{getWeatherEmoji(icon)}</span>
        <span className="weather-temp">{temp}°C</span>
      </div>
      <div className="weather-meta">
        <span className="weather-desc">{description}</span>
        <span className="weather-wind">Wind {windSpeed} km/h</span>
        {name && <span className="weather-location">{name}</span>}
      </div>
    </div>
  );
}

export default WeatherCard;

