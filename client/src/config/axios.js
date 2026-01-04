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
  if (process.env.NODE_ENV === 'production') {
    return 'https://smart-roads-api.vercel.app';
  }
  
  // In development, return empty string to use proxy
  return '';
};

const API_URL = getApiUrl();

if (API_URL) {
  axios.defaults.baseURL = API_URL;
  console.log('API Base URL set to:', API_URL);
}

export default axios;

