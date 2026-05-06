const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config({ path: './project.env' });

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

const MONGODB_URI = process.env.MONGODB_URI;
const JWT_SECRET  = process.env.JWT_SECRET;
const EXPIRY_DAYS = parseInt(process.env.ELECTION_EXPIRY_DAYS || '30');

mongoose.connect(MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB error:', err));

// ─── Schemas ──────────────────────────────────────────────────────────────────
const userSchema = new mongoose.Schema({
  id:           { type: String, default: uuidv4, unique: true, index: true },
  username:     { type: String, required: true, unique: true, trim: true, minlength: 3 },
  email:        { type: String, required: true, unique: true, trim: true, lowercase: true },
  passwordHash: { type: String, required: true },
  createdAt:    { type: Date, default: Date.now }
});
const User = mongoose.model('User', userSchema);

const ballotSchema = new mongoose.Schema({
  id:          { type: String, default: uuidv4 },
  preferences: [String],
  approvals:   [String],
  choice:      { type: String, default: null },
  weight:      { type: Number, default: 1 },
  submittedAt: { type: Date, default: Date.now }
});

const electionSchema = new mongoose.Schema({
  id:        { type: String, default: uuidv4, unique: true, index: true },
  ownerId:   { type: String, required: true, index: true },
  name:      { type: String, required: true },
  candidates:[String],
  seats:     { type: Number, required: true },
  method:    {
    type: String,
    enum: ['stv','irv','borda','condorcet','kemeny','minimax','coombs','baldwin','approval','plurality','trs'],
    default: 'stv'
  },
  ballots:   [ballotSchema],
  status:    { type: String, enum: ['open','closed'], default: 'open' },
  results:   { type: mongoose.Schema.Types.Mixed, default: null },
  createdAt: { type: Date, default: Date.now },
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + EXPIRY_DAYS * 86400000),
    index: { expireAfterSeconds: 0 }
  }
});
const Election = mongoose.model('Election', electionSchema);

// ─── Method Registry ──────────────────────────────────────────────────────────
const METHODS = {
  stv:       { label: 'Single Transferable Vote', ballotType: 'ranked',    supportsMultiSeat: true,  minBallots: (seats) => seats + 1 },
  irv:       { label: 'Instant Runoff Voting',    ballotType: 'ranked',    supportsMultiSeat: false, minBallots: () => 3 },
  borda:     { label: 'Borda Count',              ballotType: 'ranked',    supportsMultiSeat: true,  minBallots: () => 2 },
  condorcet: { label: 'Condorcet (Schulze)',       ballotType: 'ranked',    supportsMultiSeat: false, minBallots: () => 3 },
  kemeny:    { label: 'Kemeny-Young',             ballotType: 'ranked',    supportsMultiSeat: true,  minBallots: () => 2 },
  minimax:   { label: 'Minimax',                  ballotType: 'ranked',    supportsMultiSeat: false, minBallots: () => 3 },
  coombs:    { label: "Coombs' Method",           ballotType: 'ranked',    supportsMultiSeat: false, minBallots: () => 3 },
  baldwin:   { label: "Baldwin's Method",         ballotType: 'ranked',    supportsMultiSeat: false, minBallots: () => 3 },
  approval:  { label: 'Approval Voting',          ballotType: 'approval',  supportsMultiSeat: true,  minBallots: () => 2 },
  plurality: { label: 'Plurality Voting',         ballotType: 'plurality', supportsMultiSeat: false, minBallots: () => 2 },
  trs:       { label: 'Two-Round System',         ballotType: 'plurality', supportsMultiSeat: false, minBallots: () => 3 }
};

const BALLOT_TYPE_GROUPS = {
  ranked:   ['stv','irv','borda','condorcet','kemeny','minimax','coombs','baldwin'],
  approval: ['approval'],
  plurality:['plurality','trs']
};

function compatibleMethods(currentMethod, seats, totalBallots) {
  const bt = METHODS[currentMethod]?.ballotType;
  const group = BALLOT_TYPE_GROUPS[bt] || [];
  const singleOnly = ['irv','condorcet','minimax','coombs','baldwin','trs','plurality'];
  return group.filter(m => {
    if (m === currentMethod) return false;
    if (singleOnly.includes(m) && seats !== 1) return false;
    const minFn = METHODS[m]?.minBallots;
    if (minFn && totalBallots < minFn(seats)) return false;
    return true;
  });
}

function validateBallotCount(method, ballots, seats) {
  const minFn = METHODS[method]?.minBallots;
  if (!minFn) return null;
  const min = minFn(seats);
  if (ballots < min)
    return `Need at least ${min} ballot${min !== 1 ? 's' : ''} for ${METHODS[method].label} (have ${ballots}).`;
  return null;
}

// ─── Tie Detection Helpers ────────────────────────────────────────────────────

// Detects ties that straddle the seat boundary or occur within the elected set.
// scoreMap: { candidateName: numericScore }
// ranked: candidates sorted best→worst
// seats: number of seats
// Returns array of { score, candidates, context }
function detectScoreTies(scoreMap, ranked, seats) {
  const ties = [];
  if (ranked.length < 2) return ties;
  const groups = new Map();
  for (const c of ranked) {
    const s = scoreMap[c];
    if (!groups.has(s)) groups.set(s, []);
    groups.get(s).push(c);
  }
  for (const [score, group] of groups) {
    if (group.length < 2) continue;
    const indices = group.map(c => ranked.indexOf(c));
    const minIdx  = Math.min(...indices);
    const maxIdx  = Math.max(...indices);
    let context;
    if (minIdx < seats && maxIdx >= seats) context = 'boundary';
    else if (maxIdx < seats)               context = 'within-elected';
    else                                   continue; // within not-elected — not noteworthy
    ties.push({ score, candidates: group, context });
  }
  return ties;
}

// Returns candidates tied with loser at the elimination value (for round-based methods).
function detectEliminationTie(tallyObj, loser) {
  const loserVal = tallyObj[loser];
  return Object.keys(tallyObj).filter(c => c !== loser && tallyObj[c] === loserVal);
}

// ─── Tie detection ────────────────────────────────────────────────────────────
// Returns an array of tie-group descriptions whenever the boundary between
// elected and not-elected contains candidates with identical scores.
function detectTies(allCandidates, electedCount, scoreOf) {
  if (allCandidates.length === 0) return [];
  const sorted = [...allCandidates].sort((a, b) => scoreOf(b) - scoreOf(a));
  const ties = [];

  // Tie AT the boundary: last elected score === first not-elected score
  if (electedCount > 0 && electedCount < sorted.length) {
    const lastElected    = sorted[electedCount - 1];
    const firstNotElected = sorted[electedCount];
    if (scoreOf(lastElected) === scoreOf(firstNotElected)) {
      const tiedScore = scoreOf(lastElected);
      const tiedGroup = sorted.filter(c => scoreOf(c) === tiedScore);
      ties.push({
        type: 'boundary',
        score: tiedScore,
        candidates: tiedGroup.map(c => c)
      });
    }
  }

  // Tie entirely WITHIN the elected set (two winners share the same score)
  const electedGroup = sorted.slice(0, electedCount);
  const seen = new Set();
  electedGroup.forEach(c => {
    const s = scoreOf(c);
    if (!seen.has(s)) {
      seen.add(s);
      const group = electedGroup.filter(x => scoreOf(x) === s);
      if (group.length > 1) {
        ties.push({ type: 'within_elected', score: s, candidates: group });
      }
    }
  });

  return ties;
}


function runSTV(ballots, candidates, seats) {
  const quota = Math.floor(ballots.length / (seats + 1)) + 1;
  let active = [...candidates], elected = [], eliminated = [], rounds = [];
  let ab = ballots.map(b => ({ prefs: [...b.preferences], weight: b.weight || 1 }));
  const tally = (ab, active) => {
    const t = Object.fromEntries(active.map(c => [c, 0]));
    ab.forEach(b => { const top = b.prefs.find(p => active.includes(p)); if (top) t[top] += b.weight; });
    return t;
  };
  let rn = 1;
  while (elected.length < seats && active.length > 0) {
    const t = tally(ab, active);
    const r = { round: rn++, quota, tally: { ...t }, elected: [], eliminated: null, transfers: [], eliminationTie: null };
    const winners = active.filter(c => t[c] >= quota).sort((a, b) => t[b] - t[a]);
    if (winners.length > 0) {
      const w = winners[0], surplus = t[w] - quota, tv = surplus > 0 ? surplus / t[w] : 0;
      elected.push({ candidate: w, round: r.round, votes: t[w] }); r.elected.push(w);
      r.transfers.push({ from: w, transferValue: tv, surplus });
      active = active.filter(c => c !== w);
      if (surplus > 0) ab = ab.map(b => { const top = b.prefs.find(p => [w,...active].includes(p)); return top === w ? { ...b, weight: b.weight * tv } : b; });
    } else {
      const loser = active.reduce((l, c) => t[c] < t[l] ? c : l);
      const tied = detectEliminationTie(t, loser);
      if (tied.length) r.eliminationTie = { candidates: [loser, ...tied], value: t[loser] };
      eliminated.push({ candidate: loser, round: r.round, votes: t[loser] }); r.eliminated = loser; active = active.filter(c => c !== loser);
    }
    rounds.push(r);
    if (elected.length >= seats) break;
    if (active.length <= seats - elected.length) {
      const t2 = tally(ab, active); active.forEach(c => elected.push({ candidate: c, round: r.round, votes: t2[c], fillIn: true })); break;
    }
  }
  return { method: 'stv', quota, elected, eliminated, rounds };
}

function runIRV(ballots, candidates) {
  let active = [...candidates], eliminated = [], rounds = [];
  let ab = ballots.map(b => ({ prefs: [...b.preferences], weight: b.weight || 1 }));
  const tally = (ab, active) => { const t = Object.fromEntries(active.map(c => [c, 0])); ab.forEach(b => { const top = b.prefs.find(p => active.includes(p)); if (top) t[top] += b.weight; }); return t; };
  let rn = 1, winner = null;
  while (!winner && active.length > 1) {
    const t = tally(ab, active), total = Object.values(t).reduce((s, v) => s + v, 0), quota = Math.floor(total / 2) + 1;
    const r = { round: rn++, quota, tally: { ...t }, elected: [], eliminated: null, transfers: [], eliminationTie: null };
    const maj = active.find(c => t[c] >= quota);
    if (maj) { winner = maj; r.elected.push(maj); rounds.push(r); break; }
    const loser = active.reduce((l, c) => t[c] < t[l] ? c : l);
    const tied = detectEliminationTie(t, loser);
    if (tied.length) r.eliminationTie = { candidates: [loser, ...tied], value: t[loser] };
    eliminated.push({ candidate: loser, round: r.round, votes: t[loser] }); r.eliminated = loser; active = active.filter(c => c !== loser);
    if (active.length === 1) { winner = active[0]; r.elected.push(winner); }
    rounds.push(r);
  }
  const ft = tally(ab, active);
  return { method: 'irv', quota: Math.floor(ballots.length / 2) + 1, elected: [{ candidate: winner, round: rounds.length, votes: ft[winner] || 0 }], eliminated, rounds };
}

function runBorda(ballots, candidates, seats) {
  const n = candidates.length;
  const scores = Object.fromEntries(candidates.map(c => [c, 0]));
  ballots.forEach(b => b.preferences.forEach((c, i) => { if (scores[c] !== undefined) scores[c] += (n - 1 - i); }));
  const ranked = [...candidates].sort((a, b) => scores[b] - scores[a]);
  const elected    = ranked.slice(0, seats).map((c, i) => ({ candidate: c, rank: i + 1, score: scores[c] }));
  const notElected = ranked.slice(seats).map(c => ({ candidate: c, score: scores[c] }));
  const ties = detectScoreTies(scores, ranked, seats);
  return { method: 'borda', maxPointsPerBallot: n - 1, scores, ranked, elected, notElected, ties };
}

function runCondorcet(ballots, candidates) {
  const n = candidates.length, idx = Object.fromEntries(candidates.map((c, i) => [c, i]));
  const d = Array.from({ length: n }, () => Array(n).fill(0));
  ballots.forEach(b => { const prefs = b.preferences || []; for (let a = 0; a < prefs.length; a++) for (let bb = a+1; bb < prefs.length; bb++) { const ai = idx[prefs[a]], bi = idx[prefs[bb]]; if (ai !== undefined && bi !== undefined) d[ai][bi]++; } });
  const p = d.map(r => [...r]);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (i !== j) p[i][j] = d[i][j] > d[j][i] ? d[i][j] : 0;
  for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (i !== j && k !== i && k !== j) p[i][j] = Math.max(p[i][j], Math.min(p[i][k], p[k][j]));
  const wins = candidates.map((c, i) => ({ candidate: c, wins: candidates.filter((_, j) => j !== i && p[i][j] > p[j][i]).length })).sort((a, b) => b.wins - a.wins);
  const topWins = wins[0].wins;
  const tiedForFirst = wins.filter(w => w.wins === topWins);
  const ties = tiedForFirst.length > 1 ? [{ candidates: tiedForFirst.map(w => w.candidate), value: topWins, context: 'boundary' }] : [];
  return {
    method: 'condorcet', ties,
    pairwiseMatrix: candidates.map((c, i) => ({ candidate: c, results: candidates.map((opp, j) => ({ opponent: opp, for: d[i][j], against: d[j][i], wins: d[i][j] > d[j][i] })) })),
    standings: wins,
    elected:    [{ candidate: wins[0].candidate, wins: wins[0].wins }],
    notElected: wins.slice(1).map(w => ({ candidate: w.candidate, wins: w.wins }))
  };
}

function runKemeny(ballots, candidates, seats) {
  const n = candidates.length, idx = Object.fromEntries(candidates.map((c, i) => [c, i]));
  const d = Array.from({ length: n }, () => Array(n).fill(0));
  ballots.forEach(b => { const prefs = b.preferences || []; for (let a = 0; a < prefs.length; a++) for (let bb = a+1; bb < prefs.length; bb++) { const ai = idx[prefs[a]], bi = idx[prefs[bb]]; if (ai !== undefined && bi !== undefined) d[ai][bi]++; } });
  const scoreRanking = ranking => { let s = 0; for (let i = 0; i < ranking.length; i++) for (let j = i+1; j < ranking.length; j++) s += d[ranking[i]][ranking[j]]; return s; };
  let bestRanking, bestScore = -1, tiedRankingCount = 0;
  if (n <= 8) {
    const permute = (arr, cur = []) => { if (!arr.length) { const s = scoreRanking(cur); if (s > bestScore) { bestScore = s; bestRanking = [...cur]; tiedRankingCount = 1; } else if (s === bestScore) tiedRankingCount++; return; } for (let i = 0; i < arr.length; i++) permute([...arr.slice(0,i),...arr.slice(i+1)],[...cur,arr[i]]); };
    permute(candidates.map((_,i) => i));
  } else {
    const rem = candidates.map((_,i) => i); bestRanking = [];
    while (rem.length > 0) { let best = rem[0], bestS = -1; for (const c of rem) { const s = rem.reduce((acc,o) => acc+(o!==c?d[c][o]:0),0); if (s>bestS){bestS=s;best=c;} } bestRanking.push(best); rem.splice(rem.indexOf(best),1); }
    bestScore = scoreRanking(bestRanking);
  }
  const orderedCandidates = bestRanking.map(i => candidates[i]);
  const ties = tiedRankingCount > 1 ? [{ tiedRankingCount, context: 'kemeny-score', candidates: orderedCandidates.slice(0, seats) }] : [];
  return {
    method: 'kemeny', kemenyScore: bestScore, ties, tiedRankingCount,
    ranking: orderedCandidates,
    elected:    orderedCandidates.slice(0, seats).map((c, i) => ({ candidate: c, rank: i + 1 })),
    notElected: orderedCandidates.slice(seats).map((c, i) => ({ candidate: c, rank: seats + i + 1 }))
  };
}

function runMinimax(ballots, candidates) {
  const n = candidates.length, idx = Object.fromEntries(candidates.map((c,i) => [c,i]));
  const d = Array.from({ length: n }, () => Array(n).fill(0));
  ballots.forEach(b => { const prefs = b.preferences||[]; for (let a=0;a<prefs.length;a++) for (let bb=a+1;bb<prefs.length;bb++){const ai=idx[prefs[a]],bi=idx[prefs[bb]];if(ai!==undefined&&bi!==undefined)d[ai][bi]++;} });
  let active = [...candidates], eliminated = [], rounds = [];
  while (active.length > 1) {
    const wd = active.map(c => { const ci=idx[c]; const maxD=active.filter(o=>o!==c).reduce((w,o)=>Math.max(w,d[idx[o]][ci]-d[ci][idx[o]]),-Infinity); return {candidate:c,worstDefeat:maxD}; });
    const tally = Object.fromEntries(wd.map(w=>[w.candidate,w.worstDefeat]));
    const r = { round: rounds.length+1, tally:{...tally}, elected:[], eliminated:null, eliminationTie:null };
    wd.sort((a,b)=>a.worstDefeat-b.worstDefeat);
    if (active.length===2){r.elected.push(wd[0].candidate);rounds.push(r);break;}
    const loser=wd[wd.length-1]; const tied=wd.filter(w=>w.candidate!==loser.candidate&&w.worstDefeat===loser.worstDefeat);
    if (tied.length) r.eliminationTie={candidates:[loser.candidate,...tied.map(w=>w.candidate)],value:loser.worstDefeat};
    eliminated.push({candidate:loser.candidate,round:r.round,worstDefeat:loser.worstDefeat}); r.eliminated=loser.candidate; active=active.filter(c=>c!==loser.candidate); rounds.push(r);
  }
  return { method:'minimax', elected:[{candidate:active[0],round:rounds.length}], eliminated, rounds };
}

function runCoombs(ballots, candidates) {
  let active=[...candidates],eliminated=[],rounds=[];
  let ab=ballots.map(b=>({prefs:[...(b.preferences||[])],weight:b.weight||1}));
  const tallyFirst=(ab,active)=>{const t=Object.fromEntries(active.map(c=>[c,0]));ab.forEach(b=>{const top=b.prefs.find(p=>active.includes(p));if(top)t[top]+=b.weight;});return t;};
  const tallyLast=(ab,active)=>{const t=Object.fromEntries(active.map(c=>[c,0]));ab.forEach(b=>{const ap=b.prefs.filter(p=>active.includes(p));const last=ap[ap.length-1];if(last)t[last]+=b.weight;});return t;};
  let rn=1,winner=null;
  while(!winner&&active.length>1){
    const first=tallyFirst(ab,active),last=tallyLast(ab,active),total=Object.values(first).reduce((s,v)=>s+v,0),quota=Math.floor(total/2)+1;
    const r={round:rn++,quota,firstTally:{...first},lastTally:{...last},elected:[],eliminated:null,eliminationTie:null};
    const maj=active.find(c=>first[c]>=quota);
    if(maj){winner=maj;r.elected.push(maj);rounds.push(r);break;}
    const loser=active.reduce((l,c)=>last[c]>last[l]?c:l);
    const tied=active.filter(c=>c!==loser&&last[c]===last[loser]);
    if(tied.length)r.eliminationTie={candidates:[loser,...tied],value:last[loser]};
    eliminated.push({candidate:loser,round:r.round,lastPlaceVotes:last[loser]});r.eliminated=loser;active=active.filter(c=>c!==loser);
    if(active.length===1){winner=active[0];r.elected.push(winner);}rounds.push(r);
  }
  return {method:'coombs',elected:[{candidate:winner,round:rounds.length}],eliminated,rounds};
}

function runBaldwin(ballots, candidates) {
  let active=[...candidates],eliminated=[],rounds=[];
  let rn=1,winner=null;
  while(active.length>1){
    const n=active.length,scores=Object.fromEntries(active.map(c=>[c,0]));
    ballots.forEach(b=>{const ap=(b.preferences||[]).filter(p=>active.includes(p));ap.forEach((c,i)=>{scores[c]+=(n-1-i);});});
    const r={round:rn++,scores:{...scores},elected:[],eliminated:null,eliminationTie:null};
    if(active.length===2){winner=active.reduce((best,c)=>scores[c]>=scores[best]?c:best);r.elected.push(winner);rounds.push(r);break;}
    const loser=active.reduce((l,c)=>scores[c]<scores[l]?c:l);
    const tied=active.filter(c=>c!==loser&&scores[c]===scores[loser]);
    if(tied.length)r.eliminationTie={candidates:[loser,...tied],value:scores[loser]};
    eliminated.push({candidate:loser,round:r.round,score:scores[loser]});r.eliminated=loser;active=active.filter(c=>c!==loser);
    if(active.length===1){winner=active[0];r.elected.push(winner);}rounds.push(r);
  }
  if(!winner)winner=active[0];
  return {method:'baldwin',elected:[{candidate:winner,round:rounds.length}],eliminated,rounds};
}

function runApproval(ballots, candidates, seats) {
  const scores = Object.fromEntries(candidates.map(c => [c, 0]));
  ballots.forEach(b => (b.approvals || []).forEach(c => { if (scores[c] !== undefined) scores[c]++; }));
  const ranked = [...candidates].sort((a, b) => scores[b] - scores[a]);
  const elected    = ranked.slice(0, seats).map((c, i) => ({ candidate: c, rank: i + 1, approvals: scores[c], pct: +(scores[c] / ballots.length * 100).toFixed(1) }));
  const notElected = ranked.slice(seats).map(c => ({ candidate: c, approvals: scores[c], pct: +(scores[c] / ballots.length * 100).toFixed(1) }));
  const ties = detectScoreTies(scores, ranked, seats);
  return { method: 'approval', totalBallots: ballots.length, scores, ranked, elected, notElected, ties };
}

function runPlurality(ballots, candidates) {
  const scores = Object.fromEntries(candidates.map(c => [c, 0]));
  ballots.forEach(b => { if (b.choice && scores[b.choice] !== undefined) scores[b.choice]++; });
  const ranked = [...candidates].sort((a, b) => scores[b] - scores[a]);
  const winner = ranked[0];
  const tiedForFirst = ranked.filter(c => scores[c] === scores[winner]);
  const ties = tiedForFirst.length > 1 ? [{ candidates: tiedForFirst, value: scores[winner], context: 'boundary' }] : [];
  return {
    method: 'plurality', totalBallots: ballots.length, scores, ranked, ties,
    elected:    [{ candidate: winner, votes: scores[winner], pct: +(scores[winner] / ballots.length * 100).toFixed(1) }],
    notElected: ranked.slice(1).map(c => ({ candidate: c, votes: scores[c], pct: +(scores[c] / ballots.length * 100).toFixed(1) }))
  };
}

function runTRS(ballots, candidates) {
  const scores = Object.fromEntries(candidates.map(c => [c, 0]));
  ballots.forEach(b => { if (b.choice && scores[b.choice] !== undefined) scores[b.choice]++; });
  const total = ballots.length;
  const sorted = [...candidates].sort((a, b) => scores[b] - scores[a]);
  const round1 = sorted.map(c => ({ candidate: c, votes: scores[c], pct: +(scores[c] / total * 100).toFixed(1) }));
  const secondScore = scores[sorted[1]];
  const tiedForSecond = sorted.filter(c => scores[c] === secondScore);
  const round1Tie = tiedForSecond.length > 1 ? [{ candidates: tiedForSecond, value: secondScore, context: 'r1-second-place' }] : [];
  const outright = sorted.find(c => scores[c] > total / 2);
  if (outright) {
    return { method: 'trs', totalBallots: total, round1, round2: null, outright: true, ties: round1Tie,
      elected: [{ candidate: outright, votes: scores[outright], pct: +(scores[outright] / total * 100).toFixed(1) }],
      notElected: sorted.filter(c => c !== outright).map(c => ({ candidate: c, votes: scores[c], pct: +(scores[c] / total * 100).toFixed(1) })) };
  }
  const top2 = sorted.slice(0, 2);
  const r2 = Object.fromEntries(top2.map(c => [c, 0]));
  ballots.forEach(b => { if (b.choice && r2[b.choice] !== undefined) r2[b.choice]++; });
  const r2Sorted = [...top2].sort((a, b) => r2[b] - r2[a]);
  const round2 = r2Sorted.map(c => ({ candidate: c, votes: r2[c], pct: +(r2[c] / total * 100).toFixed(1) }));
  const winner = r2Sorted[0];
  const r2Tie = r2[r2Sorted[0]] === r2[r2Sorted[1]] ? [{ candidates: r2Sorted, value: r2[r2Sorted[0]], context: 'r2-final' }] : [];
  return { method: 'trs', totalBallots: total, round1, round2, outright: false, top2, ties: [...round1Tie, ...r2Tie],
    elected:    [{ candidate: winner, votes: r2[winner], pct: +(r2[winner] / total * 100).toFixed(1) }],
    notElected: r2Sorted.slice(1).map(c => ({ candidate: c, votes: r2[c], pct: +(r2[c] / total * 100).toFixed(1) })) };
}

function runMethod(method, ballots, candidates, seats) {
  switch (method) {
    case 'irv':       return runIRV(ballots, candidates);
    case 'borda':     return runBorda(ballots, candidates, seats);
    case 'condorcet': return runCondorcet(ballots, candidates);
    case 'kemeny':    return runKemeny(ballots, candidates, seats);
    case 'minimax':   return runMinimax(ballots, candidates);
    case 'coombs':    return runCoombs(ballots, candidates);
    case 'baldwin':   return runBaldwin(ballots, candidates);
    case 'approval':  return runApproval(ballots, candidates, seats);
    case 'plurality': return runPlurality(ballots, candidates);
    case 'trs':       return runTRS(ballots, candidates);
    default:          return runSTV(ballots, candidates, seats);
  }
}

// ─── CSV Parser ───────────────────────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
  return lines.map(line => {
    const cells = []; let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { cells.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    cells.push(cur.trim()); return cells;
  });
}

// ─── Auth Middleware ──────────────────────────────────────────────────────────
function authRequired(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try { req.user = jwt.verify(header.slice(7), JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Invalid or expired token' }); }
}

// ─── Auth Routes ──────────────────────────────────────────────────────────────
app.post('/api/auth/register', async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || username.length < 3) return res.status(400).json({ error: 'Username must be at least 3 characters' });
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'Valid email required' });
  if (!password || password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ id: uuidv4(), username: username.trim(), email, passwordHash });
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, username: user.username, email: user.email } });
  } catch (e) {
    if (e.code === 11000) return res.status(409).json({ error: 'Username or email already in use' });
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  try {
    const user = await User.findOne({ username: username.trim() });
    if (!user || !(await bcrypt.compare(password, user.passwordHash)))
      return res.status(401).json({ error: 'Invalid credentials' });
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, username: user.username, email: user.email } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/auth/me', authRequired, async (req, res) => {
  try {
    const user = await User.findOne({ id: req.user.id }, { passwordHash: 0 });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ id: user.id, username: user.username, email: user.email });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Election Routes ──────────────────────────────────────────────────────────
app.get('/api/methods', (req, res) => res.json(METHODS));

app.post('/api/elections', authRequired, async (req, res) => {
  const { name, candidates, seats, method = 'stv' } = req.body;
  if (!name || !candidates || candidates.length < 2 || !seats || seats < 1)
    return res.status(400).json({ error: 'Invalid election parameters' });
  if (!METHODS[method]) return res.status(400).json({ error: 'Invalid voting method' });
  const singleSeatOnly = ['irv','condorcet','minimax','coombs','baldwin','plurality','trs'];
  if (singleSeatOnly.includes(method) && Number(seats) !== 1)
    return res.status(400).json({ error: `${METHODS[method].label} only supports a single seat` });
  try {
    const election = await Election.create({ id: uuidv4(), ownerId: req.user.id, name, candidates, seats: Number(seats), method, expiresAt: new Date(Date.now() + EXPIRY_DAYS * 86400000) });
    res.json(election);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/elections/mine', authRequired, async (req, res) => {
  try {
    const elections = await Election.aggregate([
      { $match: { ownerId: req.user.id } },
      { $addFields: { ballotCount: { $size: '$ballots' } } },
      { $project: { ballots: 0, results: 0 } }
    ]);
    res.json(elections);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/elections/:id', async (req, res) => {
  try {
    const election = await Election.findOne({ id: req.params.id });
    if (!election) return res.status(404).json({ error: 'Election not found' });
    res.json(election);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// List ballots (owner only)
app.get('/api/elections/:id/ballots', authRequired, async (req, res) => {
  try {
    const election = await Election.findOne({ id: req.params.id });
    if (!election) return res.status(404).json({ error: 'Election not found' });
    if (election.ownerId !== req.user.id) return res.status(403).json({ error: 'Only the owner can view ballots' });
    res.json(election.ballots);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/elections/:id/ballots', async (req, res) => {
  try {
    const election = await Election.findOne({ id: req.params.id });
    if (!election) return res.status(404).json({ error: 'Election not found' });
    const bt = METHODS[election.method]?.ballotType;
    const ballot = { id: uuidv4() };
    if (bt === 'ranked') {
      const { preferences } = req.body;
      if (!preferences?.length) return res.status(400).json({ error: 'Ranked ballot requires preferences' });
      const invalid = preferences.filter(p => !election.candidates.includes(p));
      if (invalid.length) return res.status(400).json({ error: `Unknown candidates: ${invalid.join(', ')}` });
      ballot.preferences = preferences;
    } else if (bt === 'approval') {
      const { approvals } = req.body;
      if (!approvals?.length) return res.status(400).json({ error: 'Approval ballot requires at least one approval' });
      const invalid = approvals.filter(p => !election.candidates.includes(p));
      if (invalid.length) return res.status(400).json({ error: `Unknown candidates: ${invalid.join(', ')}` });
      ballot.approvals = approvals;
    } else if (bt === 'plurality') {
      const { choice } = req.body;
      if (!choice || !election.candidates.includes(choice)) return res.status(400).json({ error: 'Plurality ballot requires a valid single choice' });
      ballot.choice = choice;
    }
    election.ballots.push(ballot);
    // Auto-recalculate if the election is already closed
    if (election.status === 'closed') {
      const validationError = validateBallotCount(election.method, election.ballots.length, election.seats);
      if (!validationError) {
        election.results = runMethod(election.method, election.ballots, election.candidates, election.seats);
      }
    }
    await election.save();
    res.json({ message: 'Ballot submitted', totalBallots: election.ballots.length, recalculated: election.status === 'closed' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Delete a single ballot
app.delete('/api/elections/:id/ballots/:ballotId', authRequired, async (req, res) => {
  try {
    const election = await Election.findOne({ id: req.params.id });
    if (!election) return res.status(404).json({ error: 'Election not found' });
    if (election.ownerId !== req.user.id) return res.status(403).json({ error: 'Only the owner can remove ballots' });
    const before = election.ballots.length;
    election.ballots = election.ballots.filter(b => b.id !== req.params.ballotId);
    if (election.ballots.length === before) return res.status(404).json({ error: 'Ballot not found' });
    // Auto-recalculate if the election is closed
    if (election.status === 'closed') {
      const validationError = validateBallotCount(election.method, election.ballots.length, election.seats);
      if (!validationError) {
        election.results = runMethod(election.method, election.ballots, election.candidates, election.seats);
      } else {
        election.results = null; // not enough ballots any more
      }
    }
    await election.save();
    res.json({ message: 'Ballot removed', totalBallots: election.ballots.length, recalculated: election.status === 'closed' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/elections/:id/ballots/csv', authRequired, upload.single('file'), async (req, res) => {
  try {
    const election = await Election.findOne({ id: req.params.id });
    if (!election) return res.status(404).json({ error: 'Election not found' });
    if (election.ownerId !== req.user.id) return res.status(403).json({ error: 'Only the owner can import ballots' });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const text = req.file.buffer.toString('utf-8');
    const rows = parseCSV(text);
    if (rows.length === 0) return res.status(400).json({ error: 'CSV is empty' });
    const bt = METHODS[election.method]?.ballotType;
    let dataRows = rows;
    const firstRow = rows[0].map(c => c.toLowerCase());
    const hasHeader = firstRow.some(c => ['rank1','1st','choice','approve','candidate'].includes(c)) || firstRow.every(c => election.candidates.map(x => x.toLowerCase()).includes(c));
    if (hasHeader) dataRows = rows.slice(1);
    const added = [], errors = [];
    dataRows.forEach((row, i) => {
      const rowNum = i + (hasHeader ? 2 : 1), vals = row.map(v => v.trim()).filter(Boolean);
      if (!vals.length) return;
      try {
        const ballot = { id: uuidv4() };
        if (bt === 'ranked') { const prefs = vals.filter(v => election.candidates.includes(v)); if (!prefs.length) { errors.push(`Row ${rowNum}: no valid candidates`); return; } ballot.preferences = prefs; }
        else if (bt === 'approval') { const approvals = vals.filter(v => election.candidates.includes(v)); if (!approvals.length) { errors.push(`Row ${rowNum}: no valid approvals`); return; } ballot.approvals = approvals; }
        else if (bt === 'plurality') { const choice = vals.find(v => election.candidates.includes(v)); if (!choice) { errors.push(`Row ${rowNum}: no valid choice`); return; } ballot.choice = choice; }
        added.push(ballot);
      } catch (e) { errors.push(`Row ${rowNum}: ${e.message}`); }
    });
    election.ballots.push(...added);
    // Auto-recalculate if the election is closed
    if (election.status === 'closed' && added.length > 0) {
      const validationError = validateBallotCount(election.method, election.ballots.length, election.seats);
      if (!validationError) {
        election.results = runMethod(election.method, election.ballots, election.candidates, election.seats);
      }
    }
    await election.save();
    res.json({ imported: added.length, skipped: errors.length, errors, totalBallots: election.ballots.length, recalculated: election.status === 'closed' && added.length > 0 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/elections/:id/close', authRequired, async (req, res) => {
  try {
    const election = await Election.findOne({ id: req.params.id });
    if (!election) return res.status(404).json({ error: 'Election not found' });
    if (election.ownerId !== req.user.id) return res.status(403).json({ error: 'Only the owner can close elections' });
    if (!election.ballots.length) return res.status(400).json({ error: 'No ballots submitted' });
    const validationError = validateBallotCount(election.method, election.ballots.length, election.seats);
    if (validationError) return res.status(400).json({ error: validationError });
    election.status = 'closed';
    election.results = runMethod(election.method, election.ballots, election.candidates, election.seats);
    await election.save();
    res.json(election);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/elections/:id/recalculate', authRequired, async (req, res) => {
  try {
    const election = await Election.findOne({ id: req.params.id });
    if (!election) return res.status(404).json({ error: 'Election not found' });
    if (election.ownerId !== req.user.id) return res.status(403).json({ error: 'Only the owner can recalculate' });
    if (election.status !== 'closed') return res.status(400).json({ error: 'Election must be closed first' });
    const { method } = req.body;
    if (!method || !METHODS[method]) return res.status(400).json({ error: 'Invalid method' });
    const compat = compatibleMethods(election.method, election.seats, election.ballots.length);
    if (!compat.includes(method)) return res.status(400).json({ error: 'Incompatible method for these ballots or seat count' });
    election.method = method;
    election.results = runMethod(method, election.ballots, election.candidates, election.seats);
    await election.save();
    res.json(election);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/elections', async (req, res) => {
  try {
    const elections = await Election.find({}, { ballots: 0, results: 0 });
    res.json(elections);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Serve React frontend in production
const clientDist = path.join(__dirname, '../client/dist');
app.use(express.static(clientDist));
app.get('*', (req, res) => res.sendFile(path.join(clientDist, 'index.html')));

const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => console.log(`Election server v5 running on :${PORT}`));
