import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function AuthPage({ mode, onToggleMode }) {
  const { login } = useAuth();
  const [form, setForm] = useState({ username: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async () => {
    setError('');
    setLoading(true);
    const url = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
    const body = mode === 'login'
      ? { username: form.username, password: form.password }
      : { username: form.username, email: form.email, password: form.password };
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      login(data.token, data.user);
    } catch (e) {
      setError(e.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-bg"><div className="auth-grid" /></div>
      <div className="auth-card">
        <div className="auth-brand">
          <span className="brand-mark">⬡</span>
          <span className="brand-name">ElectOS</span>
        </div>
        <h1 className="auth-title">{mode === 'login' ? 'Welcome back' : 'Create account'}</h1>
        <p className="auth-sub">{mode === 'login' ? 'Sign in to manage your elections.' : 'Join to create and manage elections.'}</p>

        <div className="auth-form">
          <div className="field">
            <label className="field-label">Username</label>
            <input className="field-input" placeholder="your_username" value={form.username} onChange={set('username')}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
          </div>
          {mode === 'register' && (
            <div className="field">
              <label className="field-label">Email</label>
              <input className="field-input" type="email" placeholder="you@example.com" value={form.email} onChange={set('email')}
                onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
            </div>
          )}
          <div className="field">
            <label className="field-label">Password</label>
            <input className="field-input" type="password" placeholder="••••••••" value={form.password} onChange={set('password')}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
          </div>
          {error && <p className="field-error">{error}</p>}
          <button className="btn-primary full" onClick={handleSubmit} disabled={loading}>
            {loading ? 'Please wait…' : mode === 'login' ? 'Sign In →' : 'Create Account →'}
          </button>
        </div>

        <p className="auth-toggle">
          {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}{' '}
          <button className="link-btn" onClick={onToggleMode}>
            {mode === 'login' ? 'Register' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  );
}
