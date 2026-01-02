import axios from 'axios';

// Set base URL for API calls
// In development, this will be empty (uses proxy from package.json)
// In production, this should be set to your backend URL
const API_URL = process.env.REACT_APP_API_URL || '';

if (API_URL) {
  axios.defaults.baseURL = API_URL;
}

export default axios;

