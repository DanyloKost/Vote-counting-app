import React, { useState } from 'react';
import { useAuth } from './context/AuthContext';
import AuthPage from './pages/AuthPage';
import HomePage from './pages/HomePage';
import CreateElection from './pages/CreateElection';
import ElectionDashboard from './pages/ElectionDashboard';

export default function App() {
  const { user, loading } = useAuth();
  const [view, setView] = useState('home');  
  const [electionId, setElectionId] = useState(null);
  const [authMode, setAuthMode] = useState('login'); 

  if (loading) return (
    <div className="splash">
      <div className="splash-logo">Loading</div>
      <div className="spinner" />
    </div>
  );

  if (!user) return (
    <AuthPage mode={authMode} onToggleMode={() => setAuthMode(m => m === 'login' ? 'register' : 'login')} />
  );

  if (view === 'create') return (
    <CreateElection
      onCreated={e => { setElectionId(e.id); setView('dashboard'); }}
      onBack={() => setView('home')}
    />
  );

  if (view === 'dashboard' && electionId) return (
    <ElectionDashboard
      electionId={electionId}
      onBack={() => setView('home')}
    />
  );

  return (
    <HomePage
      onCreate={() => setView('create')}
      onOpen={id => { setElectionId(id); setView('dashboard'); }}
    />
  );
}
