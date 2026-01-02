import React, { useState } from 'react';
import './RouteCard.css';
import StatusBadge from './StatusBadge';

function RouteCard({ route, isSelected, isRecommended, onSelect }) {
  const [showDetails, setShowDetails] = useState(false);

  const formatTrafficSummary = () => {
    const { heavy, medium, light, blocked, accident } = route.trafficSummary || {};
    const parts = [];
    if (accident > 0) parts.push(`${accident} accident`);
    if (blocked > 0) parts.push(`${blocked} blocked`);
    if (heavy > 0) parts.push(`${heavy} heavy`);
    if (medium > 0) parts.push(`${medium} medium`);
    if (light > 0) parts.push(`${light} light`);
    
    if (parts.length === 0) return 'All roads clear';
    return parts.join(' · ');
  };

  const getReportText = (segment) => {
    const { recentReportCount, recentReportSummary, reportSummary, historicalMessage, hasLiveData } = segment;
    
    if (hasLiveData && recentReportCount > 0) {
      // Show recent live reports
      const reportTypes = Object.entries(recentReportSummary)
        .filter(([_, count]) => count > 0)
        .map(([type, count]) => {
          const typeLabel = type.charAt(0).toUpperCase() + type.slice(1);
          return `${count} ${count === 1 ? 'person' : 'people'} reported ${typeLabel}`;
        });
      
      return `${reportTypes.join(', ')} in the last 10 minutes.`;
    } else if (historicalMessage) {
      // Show historical pattern message
      return historicalMessage;
    } else if (segment.reportCount > 0) {
      // General historical data (not time-specific)
      const dominantType = Object.entries(reportSummary)
        .sort(([_, a], [__, b]) => b - a)[0];
      
      if (dominantType) {
        const [type, count] = dominantType;
        const typeLabel = type.charAt(0).toUpperCase() + type.slice(1);
        return `No recent reports. Historically ${typeLabel} (${count} ${count === 1 ? 'report' : 'reports'}).`;
      }
    }
    
    return 'No reports available.';
  };

  return (
    <div 
      className={`route-card ${isSelected ? 'selected' : ''} ${isRecommended ? 'recommended' : ''}`}
      onClick={onSelect}
    >
      {isRecommended && (
        <div className="recommended-badge">⭐ Recommended</div>
      )}
      
      <div className="route-header">
        <h3>{route.name}</h3>
        <div className="route-stats">
          <span className="stat">
            <span className="stat-icon">⏱️</span>
            {route.eta_minutes} min
          </span>
          <span className="stat">
            <span className="stat-icon">📏</span>
            {route.distance_km} km
          </span>
        </div>
      </div>

      <div className="route-summary">
        {route.hasFlaggedRoads ? (
          <div className="summary-warning">
            <span className="warning-icon">⚠️</span>
            <span className="summary-text summary-warning-text">
              Contains {formatTrafficSummary()} roads
            </span>
          </div>
        ) : (
          <span className="summary-text summary-clear">✅ All roads clear</span>
        )}
      </div>

      <button
        className="toggle-details"
        onClick={(e) => {
          e.stopPropagation();
          setShowDetails(!showDetails);
        }}
      >
        {showDetails ? 'Hide' : 'Show'} road details
      </button>

      {showDetails && (
        <div className="road-details">
          <h4>Road Segments:</h4>
          {route.roadSegments.map((segment, index) => {
            const hasReports = segment.reports && segment.reports.length > 0;
            const hasHistorical = segment.historicalPattern !== null;
            const status = segment.status || (hasReports ? 
              Object.keys(segment.reportSummary).sort((a, b) => 
                segment.reportSummary[b] - segment.reportSummary[a]
              )[0] : (hasHistorical ? segment.historicalPattern.type : 'light'));
            
            return (
              <div key={index} className="road-segment">
                <div className="segment-header">
                  <span className="segment-name">{segment.roadName}</span>
                  <StatusBadge status={status} />
                </div>
                <div className="segment-info">
                  <span className="segment-distance">{segment.distance}</span>
                </div>
                {(hasReports || hasHistorical) && (
                  <div className={`segment-report ${hasHistorical && !segment.hasLiveData ? 'historical' : ''}`}>
                    {getReportText(segment)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default RouteCard;
