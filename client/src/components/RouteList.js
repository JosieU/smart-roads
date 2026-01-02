import React from 'react';
import './RouteList.css';
import RouteCard from './RouteCard';

function RouteList({ routes, selectedRoute, onRouteSelect }) {
  // Sort routes: recommended first (no flagged roads), then by time
  const sortedRoutes = [...routes].sort((a, b) => {
    if (!a.hasFlaggedRoads && b.hasFlaggedRoads) return -1;
    if (a.hasFlaggedRoads && !b.hasFlaggedRoads) return 1;
    return a.eta_minutes - b.eta_minutes;
  });

  return (
    <div className="route-list">
      {routes.some(r => r.hasFlaggedRoads) && (
        <p className="routes-note">
          ⚠️ Some routes contain flagged roads. Check details below.
        </p>
      )}
      
      <div className="routes-container">
        {sortedRoutes.map((route, index) => (
          <RouteCard
            key={route.id}
            route={route}
            isSelected={selectedRoute === route.id}
            isRecommended={index === 0 && !route.hasFlaggedRoads}
            onSelect={() => onRouteSelect(route.id)}
          />
        ))}
      </div>
    </div>
  );
}

export default RouteList;

