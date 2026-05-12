import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

const METHODS = {
  stv:       { label: 'Single Transferable Vote', short: 'STV', color: '#c8f545', seats: 'multi', ballot: 'ranked', desc: 'Voters rank candidates. Surplus votes transfer until seats filled. Best for proportional multi-seat elections.' },
  irv:       { label: 'Instant Runoff Voting', short: 'IRV', color: '#7ef4c4', seats: 'single', ballot: 'ranked', desc: 'Voters rank candidates. Weakest eliminated each round until one gets a majority.' },
  borda:     { label: 'Borda Count', short: 'Borda', color: '#c084fc', seats: 'multi', ballot: 'ranked', desc: 'Each ranking position awards decreasing points. Candidate with most total points wins.' },
  condorcet: { label: 'Condorcet (Schulze)', short: 'Condorcet', color: '#a78bfa', seats: 'single', ballot: 'ranked', desc: 'Finds the candidate that beats every other in pairwise comparisons, using Schulze path strengths.' },
  kemeny:    { label: 'Kemeny-Young', short: 'Kemeny', color: '#34d399', seats: 'multi', ballot: 'ranked', desc: 'Finds the full ranking most consistent with all voter preferences. Elects top S candidates.' },
  minimax:   { label: 'Minimax', short: 'Minimax', color: '#f59e0b', seats: 'single', ballot: 'ranked', desc: 'Eliminates the candidate with the biggest worst-case pairwise loss each round.' },
  coombs:    { label: "Coombs' Method", short: 'Coombs', color: '#fb7185', seats: 'single', ballot: 'ranked', desc: 'Like IRV but eliminates the candidate with the most last-place rankings instead of fewest first-place.' },
  baldwin:   { label: "Baldwin's Method", short: 'Baldwin', color: '#22d3ee', seats: 'single', ballot: 'ranked', desc: 'Iterative Borda: recompute Borda scores each round and eliminate the lowest scorer until one remains.' },
  approval:  { label: 'Approval Voting', short: 'Approval', color: '#60a5fa', seats: 'multi',  ballot: 'approval', desc: 'Voters approve any number of candidates they accept. Most approvals wins. Reduces strategic voting.' },
  plurality: { label: 'Plurality Voting', short: 'Plurality', color: '#fb923c', seats: 'single', ballot: 'plurality', desc: 'Each voter picks one candidate. Most votes wins. Simple, familiar, but can split the vote.' },
  trs:       { label: 'Two-Round System', short: 'TRS', color: '#f472b6', seats: 'single', ballot: 'plurality', desc: 'If no majority in round 1, top-2 candidates face a runoff in round 2. Used in many national elections.' }
};

const MAX_CANDIDATES = 30;
const MAX_CANDIDATE_LEN = 100;
const MAX_ELECTION_NAME = 200;

export default function CreateElection({ onCreated, onBack }) {
  const { authFetch } = useAuth();
  const [name, setName] = useState('');
  const [method, setMethod] = useState('stv');
  const [seats, setSeats] = useState(1);
  const [candidateInput, setCandidateInput] = useState('');
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isSingleOnly = ['irv', 'condorcet', 'minimax', 'coombs', 'baldwin', 'plurality', 'trs'].includes(method);
  useEffect(() => { if (isSingleOnly) setSeats(1); }, [method]);

  const addCandidate = () => {
    const t = candidateInput.trim();
    if (!t || candidates.includes(t)) return;
    if (t.length > MAX_CANDIDATE_LEN) return setError(`Candidate name must be ${MAX_CANDIDATE_LEN} characters or fewer.`);
    if (candidates.length >= MAX_CANDIDATES) return setError(`Elections may have at most ${MAX_CANDIDATES} candidates.`);
    setCandidates(p => [...p, t]);
    setCandidateInput('');
    setError('');
  };

  const handleCreate = async () => {
    if (!name.trim()) return setError('Election name is required.');
    if (name.trim().length > MAX_ELECTION_NAME) return setError(`Election name must be ${MAX_ELECTION_NAME} characters or fewer.`);
    if (candidates.length < 2) return setError('At least 2 candidates required.');
    if (!isSingleOnly && (seats < 1 || seats >= candidates.length))
      return setError(`Seats must be between 1 and ${candidates.length - 1}.`);
    setLoading(true); setError('');
    try {
      const res = await authFetch('/api/elections', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim(), candidates, seats: Number(seats), method })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onCreated(data);
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  };

  const m = METHODS[method];

  return (
    <div className="page-wrap">
      <div className="page-bg"></div>
      <div className="panel">
        <button className="back-link" onClick={onBack}>← Back</button>
        <h2 className="panel-title">New Election</h2>

        <div className="field">
          <label className="field-label">Election Name</label>
          <input className="field-input" placeholder="e.g. Student Council 2025" value={name} onChange={e => setName(e.target.value)} />
        </div>

        <div className="field">
          <label className="field-label">Voting Method</label>
          <div className="method-grid method-grid-lg">
            {Object.entries(METHODS).map(([key, info]) => (
              <button key={key} type="button"
                className={`method-tile ${method === key ? 'selected' : ''}`}
                style={{ '--mc': info.color }}
                onClick={() => setMethod(key)}>
                <span className="mt-short">{info.short}</span>
                <span className="mt-label">{info.label}</span>
                <span className="mt-ballot">{info.ballot} ballot · {info.seats === 'multi' ? 'multi-seat' : 'single-seat'}</span>
              </button>
            ))}
          </div>
          <div className="method-desc">
            <span className="md-label" style={{ color: m.color }}>{m.label}</span>
            <span className="md-text">{m.desc}</span>
          </div>
        </div>

        {!isSingleOnly && (
          <div className="field field-inline">
            <div>
              <label className="field-label">Seats to Fill</label>
              <input className="field-input narrow" type="number" min={1} value={seats} onChange={e => setSeats(e.target.value)} />
            </div>
            <p className="field-hint">How many winners?</p>
          </div>
        )}
        {isSingleOnly && (
          <p className="field-hint mt-0">{m.label} always elects exactly 1 winner.</p>
        )}

        <div className="field">
          <label className="field-label">
            Candidates
            <span className="field-counter" style={{ color: candidates.length >= MAX_CANDIDATES ? '#f87171' : undefined }}>
              {candidates.length}/{MAX_CANDIDATES}
            </span>
          </label>
          <div className="add-row">
            <input className="field-input" placeholder="Candidate name…" value={candidateInput}
              onChange={e => setCandidateInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addCandidate()}
              disabled={candidates.length >= MAX_CANDIDATES} />
            <button className="btn-add" onClick={addCandidate} disabled={candidates.length >= MAX_CANDIDATES}>Add</button>
          </div>
          {candidates.length > 0 && (
            <ul className="cand-list">
              {candidates.map((c, i) => (
                <li key={c} className="cand-item">
                  <span className="ci-num">{i + 1}</span>
                  <span className="ci-name">{c}</span>
                  <button className="ci-rm" onClick={() => setCandidates(p => p.filter(x => x !== c))}>✕</button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {error && <p className="field-error">{error}</p>}
        <button className="btn-primary full" onClick={handleCreate} disabled={loading}>
          {loading ? 'Creating…' : 'Launch Election →'}
        </button>
      </div>
    </div>
  );
}
