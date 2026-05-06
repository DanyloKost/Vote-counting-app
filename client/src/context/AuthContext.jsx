import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);
const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(u => { setUser(u); setLoading(false); })
      .catch(() => { setToken(null); setLoading(false); });
  }, [token]);

  const login = (token, user) => {
    localStorage.setItem('token', token);
    setToken(token);
    setUser(user);
  };

  const logout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
  };

  const authFetch = (url, opts = {}) => {
    const isFormData = opts.body instanceof FormData;
    const headers = {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(opts.headers || {})
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return fetch(`${BASE_URL}${url}`, { ...opts, headers });
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, authFetch, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
