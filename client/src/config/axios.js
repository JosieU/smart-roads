import axios from 'axios';

// Set base URL for API calls
// In development, this will be empty (uses proxy from package.json)
// In production, use the backend API URL
const getApiUrl = () => {
  // If explicitly set via environment variable, use that
  if (process.env.REACT_APP_API_URL) {
    return process.env.REACT_APP_API_URL;
  }
  
  // In production (Vercel), use the backend API URL
  // Check if we're on Vercel by checking the hostname
  const isProduction = process.env.NODE_ENV === 'production' || 
                       window.location.hostname.includes('vercel.app');
  
  if (isProduction) {
    return 'https://smart-roads-api.vercel.app';
  }
  
  // In development, return empty string to use proxy
  return '';
};

const API_URL = getApiUrl();

if (API_URL) {
  axios.defaults.baseURL = API_URL;
  console.log('API Base URL set to:', API_URL);
  console.log('Current hostname:', window.location.hostname);
  console.log('NODE_ENV:', process.env.NODE_ENV);
} else {
  console.log('Using proxy for API calls (development mode)');
}

// Add request interceptor for debugging
axios.interceptors.request.use(
  (config) => {
    console.log('API Request:', config.method?.toUpperCase(), config.url, 'Full URL:', config.baseURL + config.url);
    return config;
  },
  (error) => {
    console.error('Request error:', error);
    return Promise.reject(error);
  }
);

// Add response interceptor for debugging
axios.interceptors.response.use(
  (response) => {
    console.log('API Response:', response.status, response.config.url);
    return response;
  },
  (error) => {
    console.error('API Error:', {
      message: error.message,
      code: error.code,
      status: error.response?.status,
      statusText: error.response?.statusText,
      url: error.config?.url,
      baseURL: error.config?.baseURL,
      fullURL: error.config?.baseURL + error.config?.url
    });
    return Promise.reject(error);
  }
);

export default axios;

