import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

const METHOD_COLORS = {
  stv: '#c8f545', irv: '#7ef4c4', borda: '#c084fc',
  approval: '#60a5fa', plurality: '#fb923c', trs: '#f472b6'
};
const METHOD_SHORT = {
  stv: 'STV', irv: 'IRV', borda: 'Borda',
  approval: 'Approval', plurality: 'Plurality', trs: 'TRS'
};

function daysLeft(d) {
  return Math.max(0, Math.ceil((new Date(d) - Date.now()) / 86400000));
}

export default function HomePage({ onCreate, onOpen }) {
  const { user, authFetch, logout } = useAuth();
  const [myElections, setMyElections] = useState([]);
  const [joinId, setJoinId] = useState('');
  const [joinError, setJoinError] = useState('');
  const [loadingElections, setLoadingElections] = useState(true);

  useEffect(() => {
    authFetch('/api/elections/mine')
      .then(r => r.json())
      .then(data => { setMyElections(Array.isArray(data) ? data : []); setLoadingElections(false); })
      .catch(() => setLoadingElections(false));
  }, []);

  const handleJoin = async () => {
    if (!joinId.trim()) return;
    const res = await fetch(`/api/elections/${joinId.trim()}`);
    if (!res.ok) return setJoinError('Election not found.');
    setJoinError('');
    onOpen(joinId.trim());
  };

  return (
    <div className="home-page">
      <div className="home-bg"><div className="home-grid" /></div>

      <nav className="topnav">
        <div className="topnav-brand">
          <span className="brand-mark">⬡</span>
          <span className="brand-name">Elector</span>
        </div>
        <div className="topnav-right">
          <span className="topnav-user">@{user.username}</span>
          <button className="btn-ghost-sm" onClick={logout}>Sign out</button>
        </div>
      </nav>

      <div className="home-content">
        <div className="home-hero">
          <h1 className="hero-  ">Your Elections</h1>
          <p className="hero-sub">Create, manage, and analyse elections with different voting methods.</p>
          <button className="btn-primary" onClick={onCreate}>
            <span>+</span> New Election
          </button>
        </div>

        <div className="home-body">
          <section className="elections-section">
            {loadingElections ? (
              <div className="loading-row"><div className="spinner-sm" /> Loading…</div>
            ) : myElections.length === 0 ? (
              <div className="empty-state">
                <p className="empty-icon">🗳</p>
                <p>No elections yet. Create your first one.</p>
              </div>
            ) : (
              <div className="elections-grid">
                {myElections.map(e => (
                  <button key={e.id} className="election-card" onClick={() => onOpen(e.id)}>
                    <div className="ec-top">
                      <span className="ec-method" style={{ color: METHOD_COLORS[e.method] || '#aaa' }}>
                        {METHOD_SHORT[e.method] || e.method}
                      </span>
                      <span className={`ec-status ${e.status}`}>{e.status}</span>
                    </div>
                    <div className="ec-name">{e.name}</div>
                    <div className="ec-meta">
                      <span>{e.candidates?.length ?? 0} candidates</span>
                      <span>{e.ballotCount ?? 0} ballots</span>
                      <span>{e.seats} seat{e.seats !== 1 ? 's' : ''}</span>
                    </div>
                    <div className="ec-expires">Expires in {daysLeft(e.expiresAt)}d</div>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="join-section">
            <h2 className="section-heading">Open by ID</h2>
            <p className="section-sub">Submit a ballot or view results for any election using its ID.</p>
            <div className="join-row">
              <input className="field-input" placeholder="Paste election ID…" value={joinId}
                onChange={e => setJoinId(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleJoin()} />
              <button className="btn-secondary" onClick={handleJoin}>Open →</button>
            </div>
            {joinError && <p className="field-error">{joinError}</p>}
          </section>
        </div>
      </div>
    </div>
  );
}
