import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import BallotInput from './BallotInput';

const BALLOT_TYPE = {
  stv: 'ranked', irv: 'ranked', borda: 'ranked',
  condorcet: 'ranked', kemeny: 'ranked', minimax: 'ranked',
  coombs: 'ranked', baldwin: 'ranked',
  approval: 'approval', plurality: 'plurality', trs: 'plurality'
};

function formatBallot(ballot, ballotType) {
  if (ballotType === 'ranked')   return ballot.preferences?.join(' → ') || '—';
  if (ballotType === 'approval') return ballot.approvals?.join(', ')    || '—';
  if (ballotType === 'plurality')return ballot.choice                   || '—';
  return '—';
}

function formatDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' +
    dt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export default function BallotManager({ election, onBallotChange }) {
  const { authFetch } = useAuth();
  const [ballots, setBallots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [removing, setRemoving] = useState(null); // ballotId being removed
  const [showAdd, setShowAdd] = useState(false);
  const [notice, setNotice] = useState('');
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState('');
  const fileRef = useRef();
  const [csvStatus, setCsvStatus] = useState(null);
  const [csvUploading, setCsvUploading] = useState(false);

  const PAGE_SIZE = 15;
  const bt = BALLOT_TYPE[election.method] || 'ranked';

  const flash = (msg) => { setNotice(msg); setTimeout(() => setNotice(''), 3000); };

  const loadBallots = async () => {
    setLoading(true);
    try {
      const res = await authFetch(`/api/elections/${election.id}/ballots`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setBallots(data);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadBallots(); }, [election.id]);

  const handleRemove = async (ballotId) => {
    if (!window.confirm('Remove this ballot?')) return;
    setRemoving(ballotId);
    try {
      const res = await authFetch(`/api/elections/${election.id}/ballots/${ballotId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setBallots(prev => prev.filter(b => b.id !== ballotId));
      flash(data.recalculated ? 'Ballot removed & results recalculated.' : 'Ballot removed.');
      onBallotChange();
    } catch (e) { setError(e.message); }
    finally { setRemoving(null); }
  };

  const handleAdded = async () => {
    await loadBallots();
    setShowAdd(false);
    flash(election.status === 'closed' ? 'Ballot added & results recalculated.' : 'Ballot added.');
    onBallotChange();
  };

  const handleCSV = async (file) => {
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    setCsvUploading(true); setCsvStatus(null); setError('');
    try {
      const res = await authFetch(`/api/elections/${election.id}/ballots/csv`, { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCsvStatus(data);
      await loadBallots();
      onBallotChange();
      if (data.recalculated) flash(`${data.imported} ballots imported & results recalculated.`);
      else flash(`${data.imported} ballots imported.`);
    } catch (e) { setError(e.message); }
    finally { setCsvUploading(false); }
  };

  const filtered = filter.trim()
    ? ballots.filter(b => formatBallot(b, bt).toLowerCase().includes(filter.toLowerCase()))
    : ballots;
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className="bm-wrap">
      {/* Top bar */}
      <div className="bm-topbar">
        <div className="bm-stats">
          <span className="bm-count">{ballots.length} ballot{ballots.length !== 1 ? 's' : ''}</span>
          {election.status === 'closed' && (
            <span className="bm-closed-note">Adding or removing ballots will automatically recalculate results.</span>
          )}
        </div>
        <div className="bm-actions">
          <button className="btn-ghost bm-csv-btn" onClick={() => fileRef.current?.click()} disabled={csvUploading}>
            {csvUploading ? 'Importing…' : '↑ Import CSV'}
          </button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }}
            onChange={e => { handleCSV(e.target.files[0]); e.target.value = ''; }} />
          {/* <button className="btn-primary bm-add-btn" onClick={() => setShowAdd(s => !s)}>
            {showAdd ? '✕ Cancel' : '+ Add Ballot'}
          </button> */}
        </div>
      </div>

      {notice && <div className="notice-bar">{notice}</div>}
      {error  && <div className="error-bar">{error}</div>}

      {csvStatus && (
        <div className="csv-result">
          <span className="csv-ok">✓ {csvStatus.imported} imported</span>
          {csvStatus.skipped > 0 && <span className="csv-warn">, {csvStatus.skipped} skipped</span>}
          {csvStatus.errors?.length > 0 && (
            <ul className="csv-errors">{csvStatus.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
          )}
        </div>
      )}

      {/* Inline add-ballot form */}
      {/* {showAdd && (
        <div className="bm-add-panel">
          <h4 className="bm-add-title">Add a ballot</h4>
          <BallotInput election={election} onSubmitted={handleAdded} />
        </div>
      )} */}

      {/* Search / filter */}
      {ballots.length > 5 && (
        <input className="field-input bm-filter" placeholder="Filter ballots…"
          value={filter} onChange={e => { setFilter(e.target.value); setPage(0); }} />
      )}

      {/* Ballot list */}
      {loading ? (
        <div className="loading-row"><div className="spinner-sm" /> Loading ballots…</div>
      ) : filtered.length === 0 ? (
        <p className="bm-empty">{ballots.length === 0 ? 'No ballots yet.' : 'No ballots match the filter.'}</p>
      ) : (
        <>
          <div className="bm-list">
            {paginated.map((b, i) => (
              <div key={b.id} className="bm-row">
                <span className="bm-idx">#{page * PAGE_SIZE + i + 1}</span>
                <span className="bm-content">{formatBallot(b, bt)}</span>
                <span className="bm-date">{formatDate(b.submittedAt)}</span>
                <button
                  className="bm-remove"
                  onClick={() => handleRemove(b.id)}
                  disabled={removing === b.id}
                  title="Remove ballot"
                >
                  {removing === b.id ? '…' : '✕'}
                </button>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="bm-pagination">
              <button className="btn-ghost bm-page-btn" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>←</button>
              <span className="bm-page-info">Page {page + 1} of {totalPages}</span>
              <button className="btn-ghost bm-page-btn" onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page === totalPages - 1}>→</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
