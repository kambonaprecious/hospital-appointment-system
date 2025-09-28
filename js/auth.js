// Utility functions for authentication and API calls

const API_BASE = 'http://localhost:3000/api';

// Save token to localStorage
function saveToken(token) {
    localStorage.setItem('authToken', token);
}

// Get token from localStorage
function getToken() {
    return localStorage.getItem('authToken');
}

// Check if user is logged in
function isLoggedIn() {
    return !!getToken();
}

// Logout function
function logout() {
    localStorage.removeItem('authToken');
    localStorage.removeItem('userData');
    window.location.href = 'index.html';
}

// Make authenticated API requests
async function makeAuthRequest(url, options = {}) {
    const token = getToken();
    
    const defaultOptions = {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        }
    };

    const mergedOptions = {
        ...defaultOptions,
        ...options,
        headers: {
            ...defaultOptions.headers,
            ...options.headers
        }
    };

    try {
        const response = await fetch(url, mergedOptions);
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Request failed');
        }
        
        return data;
    } catch (error) {
        console.error('API request failed:', error);
        throw error;
    }
}

// Get services from API
async function getServices() {
    try {
        const response = await fetch(`${API_BASE}/services`);
        return await response.json();
    } catch (error) {
        console.error('Failed to fetch services:', error);
        return [];
    }
}