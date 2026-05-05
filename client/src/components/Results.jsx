import React, { useState } from 'react';

// ─── Method metadata ──────────────────────────────────────────────────────────
const METHOD_META = {
  stv:       { label: 'Single Transferable Vote', color: '#c8f545', ballotType: 'ranked' },
  irv:       { label: 'Instant Runoff Voting',    color: '#7ef4c4', ballotType: 'ranked' },
  borda:     { label: 'Borda Count',              color: '#c084fc', ballotType: 'ranked' },
  condorcet: { label: 'Condorcet (Schulze)',       color: '#a78bfa', ballotType: 'ranked' },
  kemeny:    { label: 'Kemeny-Young',             color: '#34d399', ballotType: 'ranked' },
  minimax:   { label: 'Minimax',                  color: '#f59e0b', ballotType: 'ranked' },
  coombs:    { label: "Coombs' Method",           color: '#fb7185', ballotType: 'ranked' },
  baldwin:   { label: "Baldwin's Method",         color: '#22d3ee', ballotType: 'ranked' },
  approval:  { label: 'Approval Voting',          color: '#60a5fa', ballotType: 'approval' },
  plurality: { label: 'Plurality Voting',         color: '#fb923c', ballotType: 'plurality' },
  trs:       { label: 'Two-Round System',         color: '#f472b6', ballotType: 'plurality' }
};

const METHOD_EXPLANATIONS = {
  stv: {
    summary: 'Single Transferable Vote is a proportional ranked-choice system designed for multi-seat elections.',
    steps: [
      { title: 'Droop Quota', body: 'The winning threshold is floor(votes ÷ (seats + 1)) + 1. This guarantees no more winners than seats.' },
      { title: 'First preferences counted', body: 'Each ballot\'s top-ranked candidate gets 1 vote.' },
      { title: 'Quota met → elected + surplus transferred', body: 'If a candidate reaches the quota, they are elected. Any votes above the quota are redistributed to next preferences at a fractional transfer value = surplus ÷ total votes.' },
      { title: 'No quota → lowest eliminated', body: 'If nobody reaches the quota, the candidate with fewest votes is eliminated and their votes transfer to next preferences at full value.' },
      { title: 'Repeat', body: 'Rounds continue until all seats are filled or remaining candidates equal remaining seats.' }
    ]
  },
  irv: {
    summary: 'Instant Runoff Voting is a single-seat ranked-choice system that guarantees a majority winner.',
    steps: [
      { title: 'Majority threshold', body: 'A candidate must receive more than 50% of active votes to win.' },
      { title: 'First preferences counted', body: 'Each ballot\'s top-ranked active candidate receives 1 vote.' },
      { title: 'Check for majority', body: 'If any candidate has >50% of votes cast, they win immediately.' },
      { title: 'Eliminate the weakest', body: 'If no majority, the candidate with fewest votes is eliminated. Their ballots transfer to each voter\'s next ranked candidate.' },
      { title: 'Repeat', body: 'Rounds continue until one candidate holds a majority.' }
    ]
  },
  borda: {
    summary: 'Borda Count is a points-based system that rewards candidates ranked highly across many ballots.',
    steps: [
      { title: 'Points assigned per position', body: 'With N candidates, 1st place gets N−1 points, 2nd gets N−2, …, last gets 0. Unranked candidates receive 0.' },
      { title: 'Points accumulated', body: 'Each ballot distributes points to all ranked candidates. A candidate ranked 1st by everyone would score (N−1) × total_ballots.' },
      { title: 'Rank by total score', body: 'Candidates are sorted by total points. The top S candidates (for S seats) are elected.' },
      { title: 'No elimination rounds', body: 'Borda is a one-pass calculation — no rounds or transfers. Results are immediate once all ballots are tallied.' }
    ]
  },
  condorcet: {
    summary: 'The Condorcet method (using Schulze path-strength) elects the candidate who beats every other candidate in head-to-head comparisons.',
    steps: [
      { title: 'Pairwise matrix', body: 'For every pair of candidates, count how many voters ranked A above B and how many ranked B above A.' },
      { title: 'Schulze path strengths', body: 'Compute the strongest "path" of wins between each pair. A path A→B→C means A beat B and B beat C; its strength is the weaker of the two margins.' },
      { title: 'Find the Schulze winner', body: 'Candidate A beats B if the strongest path from A to B is stronger than the strongest path from B to A.' },
      { title: 'Rank by wins', body: 'Candidates are sorted by how many other candidates they beat through these strongest paths. The top candidate is elected.' },
      { title: 'Handling cycles', body: 'Schulze paths resolve Condorcet cycles (where A beats B, B beats C, C beats A) by considering indirect paths of wins.' }
    ]
  },
  kemeny: {
    summary: 'Kemeny-Young finds the complete ranking of candidates that maximises agreement with all pairwise voter preferences.',
    steps: [
      { title: 'Pairwise preferences', body: 'For every pair of candidates, count how many voters preferred A over B and vice versa.' },
      { title: 'Score a ranking', body: 'A ranking\'s Kemeny score is the sum of pairwise preference counts that agree with it. Higher is better.' },
      { title: 'Find the optimal ranking', body: 'The algorithm searches all possible orderings to find the one with the highest Kemeny score (exact for ≤8 candidates; greedy approximation beyond).' },
      { title: 'Elect top S', body: 'The top S candidates in the optimal ranking are elected. The full ranking is shown as standings.' }
    ]
  },
  minimax: {
    summary: "Minimax elects the candidate whose worst pairwise defeat is the smallest — the most 'defensible' candidate.",
    steps: [
      { title: 'Pairwise comparisons', body: 'For every candidate, find their worst loss: the largest margin by which any opponent beat them head-to-head.' },
      { title: 'Eliminate the most vulnerable', body: 'The candidate with the largest worst-defeat is the most vulnerable and is eliminated.' },
      { title: 'Repeat', body: 'Recompute pairwise comparisons among remaining candidates and eliminate again until two remain.' },
      { title: 'Elect the winner', body: 'In the final round, the candidate with the smaller worst-defeat wins.' }
    ]
  },
  coombs: {
    summary: "Coombs' method is like IRV in reverse: instead of eliminating who has the fewest first-place votes, it eliminates who has the most last-place votes.",
    steps: [
      { title: 'Check for majority', body: 'If any candidate holds a majority (>50%) of first-preference votes, they win immediately.' },
      { title: 'Count last-place rankings', body: 'For each candidate, count how many ballots rank them last among remaining candidates.' },
      { title: 'Eliminate the most disliked', body: 'The candidate with the most last-place rankings is eliminated. Their ballots are not transferred — ballots simply re-evaluate among remaining candidates.' },
      { title: 'Repeat', body: 'Continue checking for majorities and eliminating until one candidate wins.' }
    ]
  },
  baldwin: {
    summary: "Baldwin's method runs Borda Count iteratively: eliminate the Borda loser each round and recompute until one candidate remains.",
    steps: [
      { title: 'Compute Borda scores', body: 'Score candidates using Borda Count restricted to remaining candidates. With K candidates left, 1st place gets K−1 points, last gets 0.' },
      { title: 'Eliminate the lowest scorer', body: 'The candidate with the fewest Borda points is eliminated.' },
      { title: 'Recompute', body: 'With that candidate removed, recalculate Borda scores among the remaining candidates. Rankings shift because the point scale changes.' },
      { title: 'Repeat until one remains', body: 'Continue eliminating the Borda loser each round. The last candidate standing wins.' }
    ]
  },
  approval :{
    summary: 'Approval Voting lets voters support any number of candidates, reducing strategic pressure to pick just one.',
    steps: [
      { title: 'Voters approve any subset', body: 'Each ballot marks any number of candidates as "approved." There is no ranking — every approval counts equally.' },
      { title: 'Count approvals per candidate', body: 'Each candidate\'s score equals the number of ballots that approved them.' },
      { title: 'Elect top S', body: 'Candidates are sorted by approval count. The top S (for S seats) are elected.' },
      { title: 'No threshold required', body: 'Unlike plurality, a candidate can win even without majority support, as long as they have more approvals than rivals.' }
    ]
  },
  plurality: {
    summary: 'Plurality Voting (first-past-the-post) is the simplest method: the candidate with the most votes wins.',
    steps: [
      { title: 'Each voter picks one', body: 'Voters mark a single candidate. Choosing multiple is not allowed.' },
      { title: 'Count first-choice votes', body: 'Each candidate\'s score is the number of ballots that named them as the sole choice.' },
      { title: 'Highest count wins', body: 'The candidate with the most votes is elected, even without a majority. Ties are typically resolved by lot or rules set in advance.' },
      { title: 'Vote splitting risk', body: 'Plurality can produce unexpected results when similar candidates split the vote, allowing a less-preferred candidate to win.' }
    ]
  },
  trs: {
    summary: 'The Two-Round System combines plurality simplicity with a majority guarantee via a runoff.',
    steps: [
      { title: 'Round 1 — plurality', body: 'All candidates compete. If any candidate receives >50% of votes, they are elected outright and there is no round 2.' },
      { title: 'No outright majority → top 2 advance', body: 'The two candidates with the most votes proceed to the runoff. All others are eliminated.' },
      { title: 'Round 2 — runoff', body: 'Voters choose between the top 2. Because the same ballots are reused here, each ballot\'s original choice is checked: if it matches one of the top 2, it counts for them; otherwise it is exhausted.' },
      { title: 'Majority winner', body: 'The candidate with more votes in round 2 is elected, always holding a majority of the votes cast between the two.' }
    ]
  }
};

// Compatible recalculation (mirrors server logic)
const BALLOT_GROUPS = {
  ranked:   ['stv','irv','borda','condorcet','kemeny','minimax','coombs','baldwin'],
  approval: ['approval'],
  plurality:['plurality','trs']
};
const SINGLE_SEAT_ONLY = ['irv','condorcet','minimax','coombs','baldwin','trs','plurality'];
function getCompatible(method, seats) {
  const bt = METHOD_META[method]?.ballotType;
  const group = BALLOT_GROUPS[bt] || [];
  return group.filter(m => {
    if (m === method) return false;
    if (SINGLE_SEAT_ONLY.includes(m) && seats !== 1) return false;
    return true;
  });
}

// ─── Shared sub-components ────────────────────────────────────────────────────
function Bar({ value, max, color = '#c8f545', label }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="bar-wrap">
      <div className="bar-track">
        <div className="bar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="bar-label">{label ?? value}</span>
    </div>
  );
}

function QuotaBar({ votes, quota, max, color }) {
  const pct    = max > 0 ? Math.min((votes / max) * 100, 100) : 0;
  const qPct   = max > 0 ? Math.min((quota / max) * 100, 100) : 0;
  const over   = votes >= quota;
  return (
    <div className="bar-wrap">
      <div className="bar-track">
        <div className="bar-fill" style={{ width: `${pct}%`, background: over ? color : '#2f3d6e' }} />
        <div className="quota-tick" style={{ left: `${qPct}%` }} title={`Quota: ${quota}`} />
      </div>
      <span className="bar-label">{typeof votes === 'number' ? votes.toFixed(2) : votes}</span>
    </div>
  );
}

function WinnerGrid({ winners, color, metric }) {
  return (
    <div className="winner-grid">
      {winners.map((w, i) => (
        <div key={w.candidate} className="winner-card" style={{ '--wc': color }}>
          <div className="wc-rank">#{i + 1}</div>
          <div className="wc-name">{w.candidate}</div>
          <div className="wc-meta">{metric(w)}</div>
        </div>
      ))}
    </div>
  );
}

// TieNotice: shown in the elected section when score-based ties exist at or within the winning boundary
function TieNotice({ ties }) {
  if (!ties?.length) return null;
  return (
    <div className="tie-notice">
      <span className="tie-icon">⚖</span>
      <div className="tie-body">
        {ties.map((t, i) => {
          const names = t.candidates.join(', ');
          if (t.context === 'boundary') {
            return (
              <p key={i}>
                <strong>Tie at the boundary:</strong> {names} all share a score of <strong>{t.score}</strong>.
                The election result at the seat boundary is ambiguous — a tie-breaking rule or additional ballots are needed to resolve it.
              </p>
            );
          }
          if (t.context === 'within-elected') {
            return (
              <p key={i}>
                <strong>Tie among winners:</strong> {names} share a score of <strong>{t.score}</strong>.
                They are all elected, but their relative ranking is arbitrary.
              </p>
            );
          }
          // Fallback for condorcet / other formats
          if (t.candidates) {
            return (
              <p key={i}>
                <strong>Tie:</strong> {names} are tied
                {t.value !== undefined ? ` with ${t.value} wins` : ''}.
                A tie-breaking rule may be needed.
              </p>
            );
          }
          return null;
        })}
      </div>
    </div>
  );
}

function MethodExplainer({ method }) {
  const [open, setOpen] = useState(false);
  const info = METHOD_EXPLANATIONS[method];
  if (!info) return null;
  const color = METHOD_META[method]?.color || '#aaa';
  return (
    <div className="explainer">
      <button className="explainer-toggle" onClick={() => setOpen(o => !o)} style={{ color }}>
        {open ? '▲' : '▼'} How {METHOD_META[method]?.label} works
      </button>
      {open && (
        <div className="explainer-body">
          <p className="explainer-summary">{info.summary}</p>
          <ol className="explainer-steps">
            {info.steps.map((s, i) => (
              <li key={i} className="explainer-step">
                <strong>{s.title}:</strong> {s.body}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

// ─── Method-specific result views ─────────────────────────────────────────────
function RoundResults({ results, color }) {
  const [expanded, setExpanded] = useState(null);
  const { elected, eliminated, rounds, quota } = results;
  const maxV = Math.max(...rounds.flatMap(r => Object.values(r.tally)), quota || 0) * 1.1 || 1;

  return (
    <>
      <div className="section">
        <h3 className="section-title">🏆 Elected</h3>
        <WinnerGrid winners={elected} color={color}
          metric={w => w.fillIn ? 'Elected (fill-in)' : `${typeof w.votes === 'number' ? w.votes.toFixed(2) : w.votes} votes · Round ${w.round}`} />
        {quota && (
          <div className="stat-chip">
            <span>Quota</span><strong>{quota} votes</strong>
          </div>
        )}
      </div>
      <div className="section">
        <h3 className="section-title">Round-by-Round</h3>
        {rounds.map(r => (
          <div key={r.round} className="round-card">
            <button className="round-hdr" onClick={() => setExpanded(expanded === r.round ? null : r.round)}>
              <div className="round-hdr-left">
                <span className="round-num">Round {r.round}</span>
                {r.elected?.length > 0 && <span className="event elected-ev">✓ {r.elected.join(', ')}</span>}
                {r.eliminated && <span className="event elim-ev">✕ {r.eliminated}</span>}
              </div>
              <span>{expanded === r.round ? '▲' : '▼'}</span>
            </button>
            {expanded === r.round && (
              <div className="round-body">
                <p className="round-note">Quota: {r.quota} votes</p>
                {Object.entries(r.tally).sort(([,a],[,b]) => b-a).map(([c, v]) => {
                  const isEl = r.elected?.includes(c); const isRm = r.eliminated === c;
                  return (
                    <div key={c} className={`tally-row ${isEl ? 'tel' : ''} ${isRm ? 'trm' : ''}`}>
                      <span className="tally-name">{isEl && '✓ '}{isRm && '✕ '}{c}</span>
                      <QuotaBar votes={v} quota={r.quota} max={maxV} color={color} />
                    </div>
                  );
                })}
                {r.transfers?.map(t => (
                  <p key={t.from} className="transfer-note">
                    Surplus from <strong>{t.from}</strong>: {t.surplus.toFixed(2)} votes transferred at value {t.transferValue.toFixed(4)}
                  </p>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      {eliminated?.length > 0 && (
        <div className="section">
          <h3 className="section-title">Eliminated</h3>
          {eliminated.map(e => (
            <div key={e.candidate} className="elim-row-item">
              <span className="elim-round">Rd {e.round}</span>
              <span className="elim-name">{e.candidate}</span>
              <span className="elim-votes">{typeof e.votes === 'number' ? e.votes.toFixed(2) : e.votes} votes</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function BordaResults({ results, color }) {
  const { elected, notElected, scores, maxPointsPerBallot, ties } = results;
  const maxScore = Math.max(...Object.values(scores), 1);
  const all = [...elected, ...notElected];
  return (
    <>
      <div className="section">
        <h3 className="section-title">🏆 Elected</h3>
        <WinnerGrid winners={elected} color={color} metric={w => `${w.score} points`} />
        <TieNotice ties={ties} />
        <div className="stat-chip"><span>Max points per ballot</span><strong style={{ color }}>{maxPointsPerBallot}</strong></div>
      </div>
      <div className="section">
        <h3 className="section-title">Full Standings</h3>
        {all.map((e, i) => (
          <div key={e.candidate} className={`tally-row ${i < elected.length ? 'tel' : ''}`}>
            <span className="tally-name">{i < elected.length && '✓ '}{e.candidate}</span>
            <Bar value={e.score} max={maxScore} color={color} />
          </div>
        ))}
      </div>
    </>
  );
}

function ApprovalResults({ results, color }) {
  const { elected, notElected, totalBallots, ties } = results;
  const all = [...elected, ...notElected];
  const maxScore = Math.max(...all.map(e => e.approvals), 1);
  return (
    <>
      <div className="section">
        <h3 className="section-title">🏆 Elected</h3>
        <WinnerGrid winners={elected} color={color} metric={w => `${w.approvals} approvals (${w.pct}%)`} />
        <TieNotice ties={ties} />
        <div className="stat-chip"><span>Total ballots</span><strong>{totalBallots}</strong></div>
      </div>
      <div className="section">
        <h3 className="section-title">Approval Scores</h3>
        {all.map((e, i) => (
          <div key={e.candidate} className={`tally-row ${i < elected.length ? 'tel' : ''}`}>
            <span className="tally-name">{i < elected.length && '✓ '}{e.candidate}</span>
            <Bar value={e.approvals} max={maxScore} color={color} label={`${e.approvals} (${e.pct}%)`} />
          </div>
        ))}
      </div>
    </>
  );
}

function PluralityResults({ results, color }) {
  const { elected, notElected, totalBallots, ties } = results;
  const all = [...elected, ...notElected];
  const maxV = Math.max(...all.map(e => e.votes), 1);
  return (
    <>
      <div className="section">
        <h3 className="section-title">🏆 Elected</h3>
        <WinnerGrid winners={elected} color={color} metric={w => `${w.votes} votes (${w.pct}%)`} />
        <TieNotice ties={ties} />
        <div className="stat-chip"><span>Total ballots</span><strong>{totalBallots}</strong></div>
      </div>
      <div className="section">
        <h3 className="section-title">Vote Shares</h3>
        {all.map((e, i) => (
          <div key={e.candidate} className={`tally-row ${i < elected.length ? 'tel' : ''}`}>
            <span className="tally-name">{i < elected.length && '✓ '}{e.candidate}</span>
            <Bar value={e.votes} max={maxV} color={color} label={`${e.votes} (${e.pct}%)`} />
          </div>
        ))}
      </div>
    </>
  );
}

function TRSResults({ results, color }) {
  const { elected, round1, round2, outright, totalBallots, top2 } = results;
  const maxR1 = Math.max(...round1.map(e => e.votes), 1);
  const maxR2 = round2 ? Math.max(...round2.map(e => e.votes), 1) : 1;
  return (
    <>
      <div className="section">
        <h3 className="section-title">🏆 Elected</h3>
        <WinnerGrid winners={elected} color={color} metric={w => `${w.votes} votes (${w.pct}%)`} />
        {outright && <div className="stat-chip"><span>Won outright in round 1</span></div>}
        <div className="stat-chip"><span>Total ballots</span><strong>{totalBallots}</strong></div>
      </div>
      <div className="section">
        <h3 className="section-title">Round 1 Results</h3>
        {round1.map((e, i) => (
          <div key={e.candidate} className={`tally-row ${top2?.includes(e.candidate) ? 'tel' : 'trm'}`}>
            <span className="tally-name">
              {top2?.includes(e.candidate) ? '→ ' : '✕ '}{e.candidate}
            </span>
            <Bar value={e.votes} max={maxR1} color={color} label={`${e.votes} (${e.pct}%)`} />
          </div>
        ))}
        {!outright && <p className="round-note">No majority — top 2 advance to round 2</p>}
      </div>
      {round2 && (
        <div className="section">
          <h3 className="section-title">Round 2 Runoff</h3>
          {round2.map((e, i) => (
            <div key={e.candidate} className={`tally-row ${i === 0 ? 'tel' : ''}`}>
              <span className="tally-name">{i === 0 && '✓ '}{e.candidate}</span>
              <Bar value={e.votes} max={maxR2} color={color} label={`${e.votes} (${e.pct}%)`} />
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function CondorcetResults({ results, color }) {
  const { elected, notElected, pairwiseMatrix, standings, ties } = results;
  const [showMatrix, setShowMatrix] = useState(false);
  return (
    <>
      <div className="section">
        <h3 className="section-title">🏆 Elected</h3>
        <WinnerGrid winners={elected} color={color} metric={w => `${w.wins} pairwise win${w.wins !== 1 ? 's' : ''}`} />
        <TieNotice ties={ties} />
      </div>
      <div className="section">
        <h3 className="section-title">Schulze Standings</h3>
        {standings.map((s, i) => (
          <div key={s.candidate} className={`tally-row ${i === 0 ? 'tel' : ''}`}>
            <span className="tally-name">{i === 0 && '✓ '}{s.candidate}</span>
            <Bar value={s.wins} max={Math.max(...standings.map(x => x.wins), 1)} color={color}
              label={`${s.wins} win${s.wins !== 1 ? 's' : ''}`} />
          </div>
        ))}
      </div>
      <div className="section">
        <button className="explainer-toggle" style={{ color }} onClick={() => setShowMatrix(o => !o)}>
          {showMatrix ? '▲' : '▼'} Pairwise matrix
        </button>
        {showMatrix && (
          <div className="pairwise-wrap">
            <table className="pairwise-table">
              <thead>
                <tr>
                  <th></th>
                  {pairwiseMatrix.map(r => <th key={r.candidate}>{r.candidate}</th>)}
                </tr>
              </thead>
              <tbody>
                {pairwiseMatrix.map(row => (
                  <tr key={row.candidate}>
                    <th>{row.candidate}</th>
                    {row.results.map(cell => (
                      <td key={cell.opponent}
                        className={cell.opponent === row.candidate ? 'pw-self' : cell.wins ? 'pw-win' : 'pw-loss'}>
                        {cell.opponent === row.candidate ? '—' : cell.for}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="round-note">Each cell shows how many voters preferred the row candidate over the column candidate.</p>
          </div>
        )}
      </div>
      {notElected?.length > 0 && (
        <div className="section">
          <h3 className="section-title">Not Elected</h3>
          {notElected.map(e => (
            <div key={e.candidate} className="elim-row-item">
              <span className="elim-name">{e.candidate}</span>
              <span className="elim-votes" style={{ color }}>{e.wins} win{e.wins !== 1 ? 's' : ''}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function KemenyResults({ results, color }) {
  const { elected, notElected, ranking, kemenyScore } = results;
  return (
    <>
      <div className="section">
        <h3 className="section-title">🏆 Elected</h3>
        <WinnerGrid winners={elected} color={color} metric={w => `Rank #${w.rank}`} />
        <div className="stat-chip"><span>Kemeny score</span><strong style={{ color }}>{kemenyScore}</strong></div>
      </div>
      <div className="section">
        <h3 className="section-title">Optimal Ranking</h3>
        {ranking.map((c, i) => {
          const isElected = i < elected.length;
          return (
            <div key={c} className={`tally-row ${isElected ? 'tel' : ''}`}>
              <span className="tally-name">{isElected && '✓ '}{c}</span>
              <Bar value={ranking.length - i} max={ranking.length} color={color} label={`#${i + 1}`} />
            </div>
          );
        })}
      </div>
    </>
  );
}

// Shared renderer for Minimax, Coombs, Baldwin — all produce rounds + single winner
function EliminationResults({ results, color }) {
  const [expanded, setExpanded] = useState(null);
  const { elected, eliminated, rounds } = results;
  const isBaldwin = results.method === 'baldwin';
  const isCoombs  = results.method === 'coombs';

  return (
    <>
      <div className="section">
        <h3 className="section-title">🏆 Elected</h3>
        <WinnerGrid winners={elected} color={color} metric={w => `Won in round ${w.round}`} />
      </div>
      <div className="section">
        <h3 className="section-title">Round-by-Round</h3>
        {rounds.map(r => {
          const tally = isBaldwin ? r.scores : isCoombs ? r.lastTally : r.tally;
          return (
            <div key={r.round} className="round-card">
              <button className="round-hdr" onClick={() => setExpanded(expanded === r.round ? null : r.round)}>
                <div className="round-hdr-left">
                  <span className="round-num">Round {r.round}</span>
                  {r.elected?.length > 0 && <span className="event elected-ev">✓ {r.elected.join(', ')}</span>}
                  {r.eliminated && <span className="event elim-ev">✕ {r.eliminated}</span>}
                </div>
                <span>{expanded === r.round ? '▲' : '▼'}</span>
              </button>
              {expanded === r.round && tally && (
                <div className="round-body">
                  {isCoombs && r.firstTally && (
                    <>
                      <p className="round-note">First-place votes (quota: {r.quota})</p>
                      {Object.entries(r.firstTally).sort(([,a],[,b]) => b-a).map(([c,v]) => (
                        <div key={c} className={`tally-row ${r.elected?.includes(c) ? 'tel' : ''}`}>
                          <span className="tally-name">{c}</span>
                          <Bar value={v} max={Math.max(...Object.values(r.firstTally),1)} color={color} label={v} />
                        </div>
                      ))}
                      <p className="round-note" style={{marginTop:'0.75rem'}}>Last-place votes</p>
                    </>
                  )}
                  {isMinimax(results) && <p className="round-note">Worst pairwise defeat margin (lower = better)</p>}
                  {Object.entries(tally).sort(([,a],[,b]) => isMinimax(results) ? a-b : b-a).map(([c, v]) => {
                    const isEl = r.elected?.includes(c); const isRm = r.eliminated === c;
                    return (
                      <div key={c} className={`tally-row ${isEl ? 'tel' : ''} ${isRm ? 'trm' : ''}`}>
                        <span className="tally-name">{isEl && '✓ '}{isRm && '✕ '}{c}</span>
                        <Bar value={Math.abs(v)} max={Math.max(...Object.values(tally).map(Math.abs),1)} color={isRm ? '#ff4d5e' : color}
                          label={isMinimax(results) ? (v > 0 ? `+${v}` : v) : v} />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {eliminated?.length > 0 && (
        <div className="section">
          <h3 className="section-title">Eliminated</h3>
          {eliminated.map(e => (
            <div key={e.candidate} className="elim-row-item">
              <span className="elim-round">Rd {e.round}</span>
              <span className="elim-name">{e.candidate}</span>
              <span className="elim-votes">
                {e.score !== undefined && `${e.score} pts`}
                {e.lastPlaceVotes !== undefined && `${e.lastPlaceVotes} last`}
                {e.worstDefeat !== undefined && `margin ${e.worstDefeat > 0 ? '+' : ''}${e.worstDefeat}`}
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
function isMinimax(results) { return results.method === 'minimax'; }

// ─── Main Results component ───────────────────────────────────────────────────
export default function Results({ results, election, isOwner, onRecalculate, recalculating }) {
  const { method } = results;
  const meta = METHOD_META[method] || METHOD_META.stv;
  const compatible = isOwner ? getCompatible(method, election.seats) : [];

  const renderResults = () => {
    switch (method) {
      case 'borda':     return <BordaResults      results={results} color={meta.color} />;
      case 'condorcet': return <CondorcetResults   results={results} color={meta.color} />;
      case 'kemeny':    return <KemenyResults      results={results} color={meta.color} />;
      case 'minimax':
      case 'coombs':
      case 'baldwin':   return <EliminationResults results={results} color={meta.color} />;
      case 'approval':  return <ApprovalResults    results={results} color={meta.color} />;
      case 'plurality': return <PluralityResults   results={results} color={meta.color} />;
      case 'trs':       return <TRSResults         results={results} color={meta.color} />;
      default:          return <RoundResults       results={results} color={meta.color} />;
    }
  };

  return (
    <div className="results-wrap">
      <div className="method-bar">
        <span className="method-badge" style={{ color: meta.color, borderColor: meta.color }}>
          {meta.label}
        </span>
        {compatible.length > 0 && (
          <div className="recalc-group">
            <span className="recalc-label">Recalculate as:</span>
            {compatible.map(m => (
              <button key={m} className="recalc-btn" disabled={recalculating}
                style={{ '--rc': METHOD_META[m].color }}
                onClick={() => onRecalculate(m)}>
                {recalculating ? '…' : (METHOD_META[m].label
                  .replace('Single Transferable Vote','STV')
                  .replace('Instant Runoff Voting','IRV')
                  .replace('Two-Round System','TRS')
                  .replace('Condorcet (Schulze)','Condorcet')
                  .replace("Coombs' Method","Coombs")
                  .replace("Baldwin's Method","Baldwin")
                )}
              </button>
            ))}
          </div>
        )}
      </div>
      <MethodExplainer method={method} />
      {renderResults()}
    </div>
  );
}
