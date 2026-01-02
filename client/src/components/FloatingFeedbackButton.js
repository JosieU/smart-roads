import React from 'react';
import './FloatingFeedbackButton.css';

function FloatingFeedbackButton({ onClick }) {
  return (
    <button 
      className="floating-feedback-btn"
      onClick={onClick}
      title="Send Feedback"
      aria-label="Send Feedback"
    >
      💬
      <span className="feedback-btn-text">Feedback</span>
    </button>
  );
}

export default FloatingFeedbackButton;

