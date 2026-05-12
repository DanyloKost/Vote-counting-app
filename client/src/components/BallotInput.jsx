import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

function RankedBallot({ election, onSubmitted }) {
  const { authFetch } = useAuth();
  const [ranked, setRanked] = useState([]);
  const [unranked, setUnranked] = useState([...election.candidates]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const add = c => {
    setUnranked(u => u.filter(x => x !== c));
    setRanked(r => [...r, c]);
  };

  const remove = c => {
    const newRanked = ranked.filter(x => x !== c);
    setRanked(newRanked);
    setUnranked(election.candidates.filter(x => !newRanked.includes(x)));
  };
  const moveUp   = i => { if (i === 0) return; const r = [...ranked]; [r[i-1],r[i]]=[r[i],r[i-1]]; setRanked(r); };
  const moveDown = i => { if (i === ranked.length-1) return; const r=[...ranked]; [r[i],r[i+1]]=[r[i+1],r[i]]; setRanked(r); };
  const reset = () => { setRanked([]); setUnranked([...election.candidates]); setError(''); };

  const submit = async () => {
    if (!ranked.length) return setError('Rank at least one candidate.');
    setSubmitting(true); setError('');
    try {
      const res = await authFetch(`/api/elections/${election.id}/ballots`, {
        method: 'POST',
        body: JSON.stringify({ preferences: ranked })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      reset(); onSubmitted();
    } catch (e) { setError(e.message); } finally { setSubmitting(false); }
  };

  return (
    <div className="ballot-wrap">
      <p className="ballot-instr">Click candidates to rank them in order of preference — 1st choice first.</p>
      <div className="ballot-cols">
        <div className="ballot-col">
          <div className="bcol-title">Available</div>
          {unranked.length === 0 ? <p className="bcol-empty">All ranked</p> : (
            <ul className="pool-list">
              {unranked.map(c => (
                <li key={c} className="pool-item" onClick={() => add(c)}>
                  <span>{c}</span><span className="pool-add">+ Add</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="ballot-col">
          <div className="bcol-title">Your Ranking</div>
          {ranked.length === 0 ? <p className="bcol-empty">Nothing ranked yet</p> : (
            <ol className="ranked-list">
              {ranked.map((c, i) => (
                <li key={c} className="ranked-item">
                  <span className="ri-num">{i + 1}</span>
                  <span className="ri-name">{c}</span>
                  <div className="ri-btns">
                    <button onClick={() => moveUp(i)} disabled={i === 0}>↑</button>
                    <button onClick={() => moveDown(i)} disabled={i === ranked.length-1}>↓</button>
                    <button className="ri-rm" onClick={() => remove(c)}>✕</button>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
      {error && <p className="field-error">{error}</p>}
      <div className="ballot-actions">
        <button className="btn-ghost" onClick={reset}>Reset</button>
        <button className="btn-primary" onClick={submit} disabled={submitting || !ranked.length}>
          {submitting ? 'Submitting…' : 'Submit Ballot'}
        </button>
      </div>
    </div>
  );
}

// ── Approval ballot ───────────────────────────────────────────────────────────
function ApprovalBallot({ election, onSubmitted }) {
  const { authFetch } = useAuth();
  const [approved, setApproved] = useState(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const toggle = c => setApproved(a => { const n = new Set(a); n.has(c) ? n.delete(c) : n.add(c); return n; });

  const submit = async () => {
    if (!approved.size) return setError('Approve at least one candidate.');
    setSubmitting(true); setError('');
    try {
      const res = await authFetch(`/api/elections/${election.id}/ballots`, {
        method: 'POST',
        body: JSON.stringify({ approvals: [...approved] })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setApproved(new Set()); onSubmitted();
    } catch (e) { setError(e.message); } finally { setSubmitting(false); }
  };

  return (
    <div className="ballot-wrap">
      <p className="ballot-instr">Check every candidate you find acceptable. You may approve as many as you like.</p>
      <div className="approval-grid">
        {election.candidates.map(c => (
          <label key={c} className={`approval-tile ${approved.has(c) ? 'approved' : ''}`}>
            <input type="checkbox" checked={approved.has(c)} onChange={() => toggle(c)} />
            <span className="at-check">{approved.has(c) ? '✓' : ''}</span>
            <span className="at-name">{c}</span>
          </label>
        ))}
      </div>
      <p className="approval-count">{approved.size} candidate{approved.size !== 1 ? 's' : ''} approved</p>
      {error && <p className="field-error">{error}</p>}
      <div className="ballot-actions">
        <button className="btn-ghost" onClick={() => setApproved(new Set())}>Clear</button>
        <button className="btn-primary" onClick={submit} disabled={submitting || !approved.size}>
          {submitting ? 'Submitting…' : 'Submit Ballot'}
        </button>
      </div>
    </div>
  );
}

// ── Plurality ballot ──────────────────────────────────────────────────────────
function PluralityBallot({ election, onSubmitted }) {
  const { authFetch } = useAuth();
  const [choice, setChoice] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!choice) return setError('Select a candidate.');
    setSubmitting(true); setError('');
    try {
      const res = await authFetch(`/api/elections/${election.id}/ballots`, {
        method: 'POST',
        body: JSON.stringify({ choice })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setChoice(''); onSubmitted();
    } catch (e) { setError(e.message); } finally { setSubmitting(false); }
  };

  return (
    <div className="ballot-wrap">
      <p className="ballot-instr">Select one candidate. Your vote goes entirely to that candidate.</p>
      <div className="plurality-list">
        {election.candidates.map(c => (
          <label key={c} className={`plurality-tile ${choice === c ? 'selected' : ''}`}>
            <input type="radio" name="plurality" value={c} checked={choice === c} onChange={() => setChoice(c)} />
            <span className="pt-radio">{choice === c ? '●' : '○'}</span>
            <span className="pt-name">{c}</span>
          </label>
        ))}
      </div>
      {error && <p className="field-error">{error}</p>}
      <div className="ballot-actions">
        <button className="btn-ghost" onClick={() => setChoice('')}>Clear</button>
        <button className="btn-primary" onClick={submit} disabled={submitting || !choice}>
          {submitting ? 'Submitting…' : 'Submit Ballot'}
        </button>
      </div>
    </div>
  );
}

// ── Router ────────────────────────────────────────────────────────────────────
const BALLOT_TYPE = {
  stv: 'ranked', irv: 'ranked', borda: 'ranked',
  approval: 'approval', plurality: 'plurality', trs: 'plurality'
};

export default function BallotInput({ election, onSubmitted }) {
  const bt = BALLOT_TYPE[election.method] || 'ranked';
  if (bt === 'approval')  return <ApprovalBallot  election={election} onSubmitted={onSubmitted} />;
  if (bt === 'plurality') return <PluralityBallot election={election} onSubmitted={onSubmitted} />;
  return <RankedBallot election={election} onSubmitted={onSubmitted} />;
}