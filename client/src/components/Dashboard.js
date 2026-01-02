import React, { useState, useEffect } from 'react';
import axios from '../config/axios';
import './Dashboard.css';

function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  
  // Feedback details modal
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackList, setFeedbackList] = useState([]);
  const [loadingFeedback, setLoadingFeedback] = useState(false);
  
  // Date filters
  const [feedbackDateFilter, setFeedbackDateFilter] = useState('all'); // 'all', 'today', 'custom'
  const [feedbackStartDate, setFeedbackStartDate] = useState('');
  const [feedbackEndDate, setFeedbackEndDate] = useState('');
  
  const [reportsDateFilter, setReportsDateFilter] = useState('all');
  const [reportsStartDate, setReportsStartDate] = useState('');
  const [reportsEndDate, setReportsEndDate] = useState('');
  const [filteredReports, setFilteredReports] = useState([]);
  const [loadingReports, setLoadingReports] = useState(false);

  // Check authentication on mount
  useEffect(() => {
    const savedToken = sessionStorage.getItem('dashboard_token');
    const savedAuth = sessionStorage.getItem('dashboard_authenticated');
    
    if (savedToken && savedAuth === 'true') {
      // Verify token is still valid by trying to fetch stats
      setIsAuthenticated(true);
      fetchStats();
      // Refresh every 30 seconds
      const interval = setInterval(fetchStats, 30000);
      return () => clearInterval(interval);
    } else {
      // Clear invalid session
      sessionStorage.removeItem('dashboard_token');
      sessionStorage.removeItem('dashboard_authenticated');
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      fetchStats();
      // Refresh every 30 seconds
      const interval = setInterval(fetchStats, 30000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated]);

  const handleLogin = async (e) => {
    e.preventDefault();
    
    if (!password.trim()) {
      setAuthError('Please enter a password');
      return;
    }
    
    try {
      const response = await axios.post('/api/admin/login', { password });
      
      if (response.data.success && response.data.token) {
        // Store session token
        sessionStorage.setItem('dashboard_token', response.data.token);
        sessionStorage.setItem('dashboard_authenticated', 'true');
        setIsAuthenticated(true);
        setAuthError('');
        setPassword('');
        fetchStats();
      }
    } catch (err) {
      if (err.response?.status === 401) {
        setAuthError('Incorrect password. Please try again.');
      } else if (err.response?.status === 500) {
        setAuthError('Server configuration error. Please contact administrator.');
      } else {
        setAuthError('Login failed. Please try again.');
      }
      setPassword('');
      console.error('Login error:', err);
    }
  };

  const handleLogout = async () => {
    const token = sessionStorage.getItem('dashboard_token');
    
    // Call backend logout endpoint
    if (token) {
      try {
        await axios.post('/api/admin/logout', {}, {
          headers: { Authorization: `Bearer ${token}` }
        });
      } catch (err) {
        console.error('Logout error:', err);
      }
    }
    
    setIsAuthenticated(false);
    setStats(null);
    setPassword('');
    sessionStorage.removeItem('dashboard_token');
    sessionStorage.removeItem('dashboard_authenticated');
    window.history.pushState({}, '', window.location.pathname);
  };

  const fetchStats = async () => {
    const token = sessionStorage.getItem('dashboard_token');
    
    if (!token) {
      setIsAuthenticated(false);
      return;
    }
    
    try {
      const response = await axios.get('/api/admin/stats', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setStats(response.data);
      setError(null);
    } catch (err) {
      if (err.response?.status === 401) {
        // Session expired or invalid
        setIsAuthenticated(false);
        sessionStorage.removeItem('dashboard_token');
        sessionStorage.removeItem('dashboard_authenticated');
        setError('Session expired. Please log in again.');
      } else {
        setError('Failed to load statistics');
        console.error('Dashboard error:', err);
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchFeedback = async () => {
    const token = sessionStorage.getItem('dashboard_token');
    if (!token) return;
    
    setLoadingFeedback(true);
    try {
      let url = '/api/feedback';
      const params = new URLSearchParams();
      
      if (feedbackDateFilter === 'today') {
        const today = new Date().toISOString().split('T')[0];
        params.append('startDate', today);
        params.append('endDate', today);
      } else if (feedbackDateFilter === 'custom' && feedbackStartDate && feedbackEndDate) {
        params.append('startDate', feedbackStartDate);
        params.append('endDate', feedbackEndDate);
      }
      
      if (params.toString()) {
        url += '?' + params.toString();
      }
      
      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setFeedbackList(response.data.feedback || []);
    } catch (err) {
      console.error('Error fetching feedback:', err);
      setFeedbackList([]);
    } finally {
      setLoadingFeedback(false);
    }
  };

  const fetchFilteredReports = async () => {
    const token = sessionStorage.getItem('dashboard_token');
    if (!token) return;
    
    setLoadingReports(true);
    try {
      let url = '/api/reports';
      const params = new URLSearchParams();
      
      if (reportsDateFilter === 'today') {
        const today = new Date().toISOString().split('T')[0];
        params.append('startDate', today);
        params.append('endDate', today);
      } else if (reportsDateFilter === 'custom' && reportsStartDate && reportsEndDate) {
        params.append('startDate', reportsStartDate);
        params.append('endDate', reportsEndDate);
      }
      
      if (params.toString()) {
        url += '?' + params.toString();
      }
      
      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setFilteredReports(response.data.reports || []);
    } catch (err) {
      console.error('Error fetching reports:', err);
      setFilteredReports([]);
    } finally {
      setLoadingReports(false);
    }
  };

  const handleAverageRatingClick = () => {
    setShowFeedbackModal(true);
    setFeedbackDateFilter('all');
    setFeedbackStartDate('');
    setFeedbackEndDate('');
    fetchFeedback();
  };

  useEffect(() => {
    if (showFeedbackModal) {
      fetchFeedback();
    }
  }, [feedbackDateFilter, feedbackStartDate, feedbackEndDate]);

  useEffect(() => {
    if (activeTab === 'reports' && (reportsDateFilter !== 'all' || reportsStartDate || reportsEndDate)) {
      fetchFilteredReports();
    } else if (activeTab === 'reports') {
      setFilteredReports([]);
    }
  }, [activeTab, reportsDateFilter, reportsStartDate, reportsEndDate]);

  // Show login form if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="dashboard-container">
        <div className="dashboard-login">
          <div className="login-box">
            <h2>🔒 Dashboard Access</h2>
            <p>Enter password to view analytics and statistics</p>
            <form onSubmit={handleLogin}>
              <input
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setAuthError('');
                }}
                placeholder="Enter password"
                className="password-input"
                autoFocus
              />
              {authError && <div className="auth-error">{authError}</div>}
              <button type="submit" className="login-btn">
                Access Dashboard
              </button>
            </form>
            <button 
              className="back-to-app-link"
              onClick={() => {
                window.history.pushState({}, '', window.location.pathname);
                window.location.reload();
              }}
            >
              ← Back to App
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="dashboard-container">
        <div className="dashboard-loading">Loading dashboard...</div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="dashboard-container">
        <div className="dashboard-error">
          <p>{error || 'No data available'}</p>
          <button onClick={fetchStats}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <div className="header-left">
          <h1>📊 Smart Roads Dashboard</h1>
          <p className="dashboard-subtitle">Real-time impact and usage statistics</p>
        </div>
        <div className="header-right">
          <button className="refresh-btn" onClick={fetchStats}>
            🔄 Refresh
          </button>
          <button className="logout-btn" onClick={handleLogout}>
            🔓 Logout
          </button>
        </div>
      </div>

      <div className="dashboard-tabs">
        <button 
          className={activeTab === 'overview' ? 'active' : ''}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button 
          className={activeTab === 'reports' ? 'active' : ''}
          onClick={() => setActiveTab('reports')}
        >
          Traffic Reports
        </button>
        <button 
          className={activeTab === 'routes' ? 'active' : ''}
          onClick={() => setActiveTab('routes')}
        >
          Route Requests
        </button>
        <button 
          className={activeTab === 'feedback' ? 'active' : ''}
          onClick={() => setActiveTab('feedback')}
        >
          Feedback
        </button>
      </div>

      {activeTab === 'overview' && (
        <div className="dashboard-content">
          {/* Impact Cards */}
          <div className="stats-grid">
            <div className="stat-card impact-card">
              <div className="stat-icon">🚗</div>
              <div className="stat-content">
                <div className="stat-value">{stats.impact.routesToday}</div>
                <div className="stat-label">Routes Requested Today</div>
              </div>
            </div>

            <div className="stat-card impact-card">
              <div className="stat-icon">🚦</div>
              <div className="stat-content">
                <div className="stat-value">{stats.impact.reportsToday}</div>
                <div className="stat-label">Traffic Reports Today</div>
              </div>
            </div>

            <div className="stat-card impact-card">
              <div className="stat-icon">🛣️</div>
              <div className="stat-content">
                <div className="stat-value">{stats.impact.activeRoads}</div>
                <div className="stat-label">Active Roads Monitored</div>
              </div>
            </div>

            <div className="stat-card impact-card">
              <div className="stat-icon">👥</div>
              <div className="stat-content">
                <div className="stat-value">{stats.impact.totalUsersHelped}</div>
                <div className="stat-label">Total Interactions</div>
              </div>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="quick-stats">
            <h2>Quick Statistics</h2>
            <div className="stats-list">
              <div className="stat-item">
                <span className="stat-item-label">Total Route Requests:</span>
                <span className="stat-item-value">{stats.routes.total}</span>
              </div>
              <div className="stat-item">
                <span className="stat-item-label">Total Traffic Reports:</span>
                <span className="stat-item-value">{stats.reports.total}</span>
              </div>
              <div className="stat-item">
                <span className="stat-item-label">Total Feedback:</span>
                <span className="stat-item-value">{stats.feedback.total}</span>
              </div>
              <div className="stat-item">
                <span className="stat-item-label">This Week Routes:</span>
                <span className="stat-item-value">{stats.routes.thisWeek}</span>
              </div>
              <div className="stat-item">
                <span className="stat-item-label">This Week Reports:</span>
                <span className="stat-item-value">{stats.reports.thisWeek}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'reports' && (
        <div className="dashboard-content">
          <div className="section-header">
            <h2>Traffic Reports Statistics</h2>
          </div>

          {/* Date Filter for Reports */}
          <div className="date-filter-section">
            <h3>Filter Reports by Date</h3>
            <div className="filter-controls">
              <select 
                value={reportsDateFilter} 
                onChange={(e) => {
                  setReportsDateFilter(e.target.value);
                  if (e.target.value !== 'custom') {
                    setReportsStartDate('');
                    setReportsEndDate('');
                  }
                }}
                className="filter-select"
              >
                <option value="all">All Time</option>
                <option value="today">Today</option>
                <option value="custom">Custom Date Range</option>
              </select>
              
              {reportsDateFilter === 'custom' && (
                <div className="date-range-inputs">
                  <input
                    type="date"
                    value={reportsStartDate}
                    onChange={(e) => setReportsStartDate(e.target.value)}
                    className="date-input"
                    placeholder="Start Date"
                  />
                  <span>to</span>
                  <input
                    type="date"
                    value={reportsEndDate}
                    onChange={(e) => setReportsEndDate(e.target.value)}
                    className="date-input"
                    placeholder="End Date"
                  />
                </div>
              )}
            </div>
          </div>

          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-value">{stats.reports.total}</div>
              <div className="stat-label">Total Reports</div>
            </div>

            <div className="stat-card">
              <div className="stat-value">{stats.reports.recent}</div>
              <div className="stat-label">Today</div>
            </div>

            <div className="stat-card">
              <div className="stat-value">{stats.reports.thisWeek}</div>
              <div className="stat-label">This Week</div>
            </div>

            <div className="stat-card">
              <div className="stat-value">{stats.reports.thisMonth}</div>
              <div className="stat-label">This Month</div>
            </div>
          </div>

          <div className="reports-breakdown">
            <h3>Reports by Type</h3>
            <div className="breakdown-list">
              <div className="breakdown-item">
                <span className="breakdown-color" style={{ backgroundColor: '#4caf50' }}></span>
                <span className="breakdown-label">Light Traffic:</span>
                <span className="breakdown-value">{stats.reports.byType.light}</span>
              </div>
              <div className="breakdown-item">
                <span className="breakdown-color" style={{ backgroundColor: '#f57f17' }}></span>
                <span className="breakdown-label">Medium Traffic:</span>
                <span className="breakdown-value">{stats.reports.byType.medium}</span>
              </div>
              <div className="breakdown-item">
                <span className="breakdown-color" style={{ backgroundColor: '#c62828' }}></span>
                <span className="breakdown-label">Heavy Traffic:</span>
                <span className="breakdown-value">{stats.reports.byType.heavy}</span>
              </div>
              <div className="breakdown-item">
                <span className="breakdown-color" style={{ backgroundColor: '#424242' }}></span>
                <span className="breakdown-label">Blocked:</span>
                <span className="breakdown-value">{stats.reports.byType.blocked}</span>
              </div>
              <div className="breakdown-item">
                <span className="breakdown-color" style={{ backgroundColor: '#d32f2f' }}></span>
                <span className="breakdown-label">Accidents:</span>
                <span className="breakdown-value">{stats.reports.byType.accident}</span>
              </div>
            </div>
          </div>

          {/* Filtered Reports List */}
          {(reportsDateFilter !== 'all' || reportsStartDate || reportsEndDate) && (
            <div className="filtered-reports-section">
              <h3>Filtered Reports ({filteredReports.length})</h3>
              {loadingReports ? (
                <div className="loading-text">Loading reports...</div>
              ) : filteredReports.length === 0 ? (
                <div className="no-data">No reports found for the selected date range.</div>
              ) : (
                <div className="reports-list">
                  {filteredReports.map((report) => (
                    <div key={report.id} className="report-item">
                      <div className="report-header">
                        <span className="report-road">{report.roadName || report.roadId}</span>
                        <span className={`report-type ${report.reportType}`}>
                          {report.reportType}
                        </span>
                      </div>
                      <div className="report-details">
                        <span className="report-date">
                          {new Date(report.timestamp).toLocaleString()}
                        </span>
                        {report.lat && report.lng && (
                          <span className="report-location">
                            📍 {report.lat.toFixed(4)}, {report.lng.toFixed(4)}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {stats.reports.lastReportTime && (
            <div className="last-update">
              <p>Last report: {new Date(stats.reports.lastReportTime).toLocaleString()}</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'routes' && (
        <div className="dashboard-content">
          <div className="section-header">
            <h2>Route Request Statistics</h2>
          </div>

          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-value">{stats.routes.total}</div>
              <div className="stat-label">Total Requests</div>
            </div>

            <div className="stat-card">
              <div className="stat-value">{stats.routes.today}</div>
              <div className="stat-label">Today</div>
            </div>

            <div className="stat-card">
              <div className="stat-value">{stats.routes.thisWeek}</div>
              <div className="stat-label">This Week</div>
            </div>

            <div className="stat-card">
              <div className="stat-value">{stats.routes.thisMonth}</div>
              <div className="stat-label">This Month</div>
            </div>
          </div>

          {stats.routes.popularDestinations && stats.routes.popularDestinations.length > 0 && (
            <div className="popular-destinations">
              <h3>Popular Destinations</h3>
              <div className="destinations-list">
                {stats.routes.popularDestinations.map((dest, index) => (
                  <div key={index} className="destination-item">
                    <span className="destination-rank">#{index + 1}</span>
                    <span className="destination-name">{dest.name}</span>
                    <span className="destination-count">{dest.count} requests</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="route-insights">
            <div className="insight-item">
              <span className="insight-label">Average Routes per Request:</span>
              <span className="insight-value">{stats.routes.averageRoutesPerRequest}</span>
            </div>
            <div className="insight-item">
              <span className="insight-label">Requests with Traffic Issues:</span>
              <span className="insight-value">{stats.routes.requestsWithTraffic}</span>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'feedback' && (
        <div className="dashboard-content">
          <div className="section-header">
            <h2>User Feedback Statistics</h2>
          </div>

          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-value">{stats.feedback.total}</div>
              <div className="stat-label">Total Feedback</div>
            </div>

            <div className="stat-card">
              <div className="stat-value">{stats.feedback.recent}</div>
              <div className="stat-label">Today</div>
            </div>

            <div className="stat-card">
              <div className="stat-value">{stats.feedback.thisWeek}</div>
              <div className="stat-label">This Week</div>
            </div>

            {stats.feedback.averageRating && (
              <div className="stat-card clickable-card" onClick={handleAverageRatingClick} style={{ cursor: 'pointer' }}>
                <div className="stat-value">{stats.feedback.averageRating} ⭐</div>
                <div className="stat-label">Average Rating (Click to view feedback)</div>
              </div>
            )}
          </div>

          <div className="feedback-insights">
            <div className="insight-item">
              <span className="insight-label">Feedback with Ratings:</span>
              <span className="insight-value">{stats.feedback.withRating} / {stats.feedback.total}</span>
            </div>
          </div>

          {/* Date Filter for Feedback */}
          <div className="date-filter-section">
            <h3>Filter Feedback by Date</h3>
            <div className="filter-controls">
              <select 
                value={feedbackDateFilter} 
                onChange={(e) => {
                  setFeedbackDateFilter(e.target.value);
                  if (e.target.value !== 'custom') {
                    setFeedbackStartDate('');
                    setFeedbackEndDate('');
                  }
                }}
                className="filter-select"
              >
                <option value="all">All Time</option>
                <option value="today">Today</option>
                <option value="custom">Custom Date Range</option>
              </select>
              
              {feedbackDateFilter === 'custom' && (
                <div className="date-range-inputs">
                  <input
                    type="date"
                    value={feedbackStartDate}
                    onChange={(e) => setFeedbackStartDate(e.target.value)}
                    className="date-input"
                    placeholder="Start Date"
                  />
                  <span>to</span>
                  <input
                    type="date"
                    value={feedbackEndDate}
                    onChange={(e) => setFeedbackEndDate(e.target.value)}
                    className="date-input"
                    placeholder="End Date"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Feedback Details Modal */}
      {showFeedbackModal && (
        <div className="modal-overlay" onClick={() => setShowFeedbackModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>💬 User Feedback</h2>
              <button className="modal-close" onClick={() => setShowFeedbackModal(false)}>×</button>
            </div>
            
            <div className="modal-body">
              {/* Date Filter in Modal */}
              <div className="date-filter-section">
                <div className="filter-controls">
                  <select 
                    value={feedbackDateFilter} 
                    onChange={(e) => {
                      setFeedbackDateFilter(e.target.value);
                      if (e.target.value !== 'custom') {
                        setFeedbackStartDate('');
                        setFeedbackEndDate('');
                      }
                    }}
                    className="filter-select"
                  >
                    <option value="all">All Time</option>
                    <option value="today">Today</option>
                    <option value="custom">Custom Date Range</option>
                  </select>
                  
                  {feedbackDateFilter === 'custom' && (
                    <div className="date-range-inputs">
                      <input
                        type="date"
                        value={feedbackStartDate}
                        onChange={(e) => setFeedbackStartDate(e.target.value)}
                        className="date-input"
                      />
                      <span>to</span>
                      <input
                        type="date"
                        value={feedbackEndDate}
                        onChange={(e) => setFeedbackEndDate(e.target.value)}
                        className="date-input"
                      />
                    </div>
                  )}
                </div>
              </div>

              {loadingFeedback ? (
                <div className="loading-text">Loading feedback...</div>
              ) : feedbackList.length === 0 ? (
                <div className="no-data">No feedback found for the selected date range.</div>
              ) : (
                <div className="feedback-list">
                  {feedbackList.map((item) => (
                    <div key={item.id} className="feedback-item">
                      <div className="feedback-header">
                        <div className="feedback-rating">
                          {item.rating ? '⭐'.repeat(item.rating) : 'No rating'}
                        </div>
                        <div className="feedback-date">
                          {new Date(item.timestamp).toLocaleString()}
                        </div>
                      </div>
                      <div className="feedback-text">{item.feedback}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="dashboard-footer">
        <p>Last updated: {stats.lastUpdated ? new Date(stats.lastUpdated).toLocaleString() : 'Never'}</p>
        <p className="footer-note">Data refreshes automatically every 30 seconds</p>
      </div>
    </div>
  );
}

export default Dashboard;

