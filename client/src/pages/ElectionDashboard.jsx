import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import BallotInput from '../components/BallotInput';
import BallotManager from '../components/BallotManager';
import Results from '../components/Results';

const METHOD_COLORS = {
  stv: '#c8f545', irv: '#7ef4c4', borda: '#c084fc',
  condorcet: '#a78bfa', kemeny: '#34d399', minimax: '#f59e0b',
  coombs: '#fb7185', baldwin: '#22d3ee',
  approval: '#60a5fa', plurality: '#fb923c', trs: '#f472b6'
};
const METHOD_LABELS = {
  stv: 'STV', irv: 'IRV', borda: 'Borda Count',
  condorcet: 'Condorcet', kemeny: 'Kemeny-Young', minimax: 'Minimax',
  coombs: "Coombs'", baldwin: "Baldwin's",
  approval: 'Approval', plurality: 'Plurality', trs: 'Two-Round'
};

function daysLeft(d) { return Math.max(0, Math.ceil((new Date(d) - Date.now()) / 86400000)); }

export default function ElectionDashboard({ electionId, onBack }) {
  const { user, authFetch } = useAuth();
  const [election, setElection] = useState(null);
  const [tab, setTab] = useState('ballot');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [closing, setClosing] = useState(false);
  const [recalculating, setRecalculating] = useState(false);

  const isOwner = election && user && election.ownerId === user.id;

  const fetch_ = async () => {
    try {
      const res = await fetch(`/api/elections/${electionId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setElection(data);
    } catch (e) { setError(e.message); }
  };

  useEffect(() => { fetch_(); }, [electionId]);

  const flash = msg => { setNotice(msg); setTimeout(() => setNotice(''), 3000); };

  const handleClose = async () => {
    if (!window.confirm('Close election and tally results?')) return;
    setClosing(true); setError('');
    try {
      const res = await authFetch(`/api/elections/${electionId}/close`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setElection(data); setTab('results');
    } catch (e) { setError(e.message); } finally { setClosing(false); }
  };

  const handleRecalculate = async (newMethod) => {
    setRecalculating(true); setError('');
    try {
      const res = await authFetch(`/api/elections/${electionId}/recalculate`, {
        method: 'POST', body: JSON.stringify({ method: newMethod })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setElection(data);
      flash(`Recalculated using ${METHOD_LABELS[newMethod]}`);
    } catch (e) { setError(e.message); } finally { setRecalculating(false); }
  };

  if (!election) return (
    <div className="page-wrap">
      <div className="page-bg"><div className="page-grid" /></div>
      <div className="panel center-panel">{error ? <p className="field-error">{error}</p> : <><div className="spinner" /><p>Loading…</p></>}</div>
    </div>
  );

  const color = METHOD_COLORS[election.method] || '#aaa';
  const days = daysLeft(election.expiresAt);

  return (
    <div className="page-wrap">
      <div className="page-bg"><div className="page-grid" /></div>
      <div className="panel wide">

        {/* Header */}
        <div className="db-header">
          <button className="back-link" onClick={onBack}>← My Elections</button>
          <div className="db-title-row">
            <div>
              <div className="db-method-tag" style={{ color, borderColor: color }}>
                {METHOD_LABELS[election.method]}
              </div>
              <h2 className="panel-title">{election.name}</h2>
              <div className="db-meta">
                <span className={`status-dot ${election.status}`} />
                <span>{election.status}</span>
                <span>·</span><span>{election.seats} seat{election.seats !== 1 ? 's' : ''}</span>
                <span>·</span><span>{election.ballots.length} ballot{election.ballots.length !== 1 ? 's' : ''}</span>
                <span>·</span><span className={days <= 3 ? 'expiry-warn' : 'expiry-ok'}>expires {days}d</span>
              </div>
            </div>
            <div className="id-chip">
              <span className="id-label">ID</span>
              <code className="id-val">{election.id}</code>
              <button className="btn-copy" onClick={() => { navigator.clipboard.writeText(election.id); flash('ID copied!'); }}>Copy</button>
            </div>
          </div>
        </div>

        {notice && <div className="notice-bar">{notice}</div>}
        {error && <div className="error-bar">{error}</div>}

        {/* Tabs */}
        <div className="tabs">
          {isOwner && <button className={`tab-btn ${tab === 'ballot' ? 'active' : ''}`} onClick={() => setTab('ballot')}>Cast Ballot</button>}
          {isOwner && <button className={`tab-btn ${tab === 'manage' ? 'active' : ''}`} onClick={() => setTab('manage')}>Manage Ballots</button>}
          <button className={`tab-btn ${tab === 'results' ? 'active' : ''}`} onClick={() => setTab('results')} disabled={!election.results}>
            Results {!election.results && <span className="tab-pending">(pending)</span>}
          </button>
        </div>

        {/* Cast Ballot tab */}
        {tab === 'ballot' && isOwner && (
          election.status === 'open'
            ? <>
                <BallotInput election={election} onSubmitted={() => { flash('Ballot submitted!'); fetch_(); }} />
                {election.ballots.length > 0 && (
                  <div className="close-row">
                    <p className="close-hint">{election.ballots.length} ballot{election.ballots.length !== 1 ? 's' : ''} collected. Ready to tally?</p>
                    <button className="btn-danger" onClick={handleClose} disabled={closing}>
                      {closing ? 'Closing…' : 'Close & Tally Results'}
                    </button>
                  </div>
                )}
              </>
            : <div className="closed-note">
                <p>This election is closed. You can still cast additional ballots — results will be recalculated automatically.</p>
                <BallotInput election={election} onSubmitted={() => { flash('Ballot added & results recalculated!'); fetch_(); }} />
              </div>
        )}

        {/* Manage Ballots tab */}
        {tab === 'manage' && isOwner && (
          election.status === 'open'
          ? <>
              <BallotManager
                election={election}
                onBallotChange={fetch_}
              />
              {election.ballots.length > 0 && (
                    <div className="close-row">
                      <p className="close-hint">{election.ballots.length} ballot{election.ballots.length !== 1 ? 's' : ''} collected. Ready to tally?</p>
                      <button className="btn-danger" onClick={handleClose} disabled={closing}>
                        {closing ? 'Closing…' : 'Close & Tally Results'}
                      </button>
                    </div>
                )}
            </>
            : <BallotManager
                election={election}
                onBallotChange={fetch_}
              />
        )}

        {/* Results tab */}
        {tab === 'results' && election.results && (
          <Results
            results={election.results}
            election={election}
            isOwner={isOwner}
            onRecalculate={handleRecalculate}
            recalculating={recalculating}
          />
        )}
      </div>
    </div>
  );
}
