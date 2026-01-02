import React from 'react';
import './StatusBadge.css';

function StatusBadge({ status }) {
  const statusConfig = {
    light: { emoji: '🟢', label: 'Light', className: 'status-light' },
    medium: { emoji: '🟡', label: 'Medium', className: 'status-medium' },
    heavy: { emoji: '🔴', label: 'Heavy', className: 'status-heavy' },
    blocked: { emoji: '⛔', label: 'Blocked', className: 'status-blocked' },
    accident: { emoji: '🚨', label: 'Accident', className: 'status-accident' }
  };

  const config = statusConfig[status] || statusConfig.medium;

  return (
    <span className={`status-badge ${config.className}`}>
      <span className="status-emoji">{config.emoji}</span>
      <span className="status-label">{config.label}</span>
    </span>
  );
}

export default StatusBadge;

