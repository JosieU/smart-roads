import React, { useState } from 'react';
import './FeedbackForm.css';
import axios from '../config/axios';

function FeedbackForm({ isOpen, onClose }) {
  const [feedback, setFeedback] = useState('');
  const [rating, setRating] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!feedback.trim()) {
      alert('Please enter your feedback');
      return;
    }

    setSubmitting(true);
    setSubmitMessage(null);

    try {
      const response = await axios.post('/api/feedback', {
        feedback: feedback.trim(),
        rating: rating,
        timestamp: new Date().toISOString()
      });

      setSubmitMessage('Thank you for your feedback! We appreciate your input.');
      setFeedback('');
      setRating(null);
      
      // Close after 3 seconds
      setTimeout(() => {
        setSubmitMessage(null);
        onClose();
      }, 3000);
    } catch (err) {
      console.error('Feedback submission error:', err);
      console.error('Error response:', err.response?.data);
      console.error('Error status:', err.response?.status);
      console.error('Full error:', err);
      const errorMsg = err.response?.data?.error || err.response?.data?.details || err.message || 'Failed to submit feedback. Please try again.';
      setSubmitMessage(`Failed to submit feedback: ${errorMsg}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setFeedback('');
    setRating(null);
    setSubmitMessage(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="feedback-overlay" onClick={handleClose}>
      <div className="feedback-modal" onClick={(e) => e.stopPropagation()}>
        <div className="feedback-header">
          <h2>💬 Send Feedback</h2>
          <button className="feedback-close-btn" onClick={handleClose}>×</button>
        </div>

        <form onSubmit={handleSubmit} className="feedback-form">
          <div className="feedback-section">
            <label>How would you rate your experience?</label>
            <div className="rating-buttons">
              {[1, 2, 3, 4, 5].map((num) => (
                <button
                  key={num}
                  type="button"
                  className={`rating-btn ${rating === num ? 'selected' : ''}`}
                  onClick={() => setRating(num)}
                >
                  {num === 5 ? '⭐' : num === 4 ? '⭐' : num === 3 ? '⭐' : num === 2 ? '⭐' : '⭐'}
                  <span>{num}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="feedback-section">
            <label>Your Feedback</label>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Tell us what you think, what we can improve, or any issues you've encountered. Be as detailed as you'd like..."
              className="feedback-textarea"
              rows={6}
              required
            />
            <p className="feedback-hint">
              Your feedback helps us improve the app. Thank you for taking the time!
            </p>
          </div>

          <div className="feedback-actions">
            <button
              type="button"
              className="feedback-btn feedback-btn-cancel"
              onClick={handleClose}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="feedback-btn feedback-btn-submit"
              disabled={submitting || !feedback.trim()}
            >
              {submitting ? 'Submitting...' : 'Submit Feedback'}
            </button>
          </div>

          {submitMessage && (
            <div className={`feedback-message ${submitMessage.includes('Thank you') ? 'success' : 'error'}`}>
              {submitMessage}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

export default FeedbackForm;

