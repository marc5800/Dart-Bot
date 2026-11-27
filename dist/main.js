import {
  BOT_LEVELS, createLeg, applyVisit, applyTotalVisit, generateBotVisit,
  summariseLeg, threeDartAverage, firstNineAverage, checkoutRoute
} from "./engine.js";

const app = document.querySelector("#app");
const API_BASE = "https://darts-bot-api.marcb1986.workers.dev";
const state = {
  apiToken: sessionStorage.getItem("dartsbot_api_token") || "",
  apiReady: false,
  apiError: "",
  saveStatus: "",
  historyMatches: [], historyLoading: false, historyError: "", historyMonth: "all", historyVisible: 5, selectedHistoryMatch: null, reviewLoading: false,
  page: "dashboard", opponent: "standard", level: 3, game: 501, legs: 5,
  match: null, undoStack: [], notice: "", lastTurn: null, entryMode: "total", scoreInput: "", checkoutModal: false, checkoutDarts: 3, checkoutAttempts: 1, dartSelections: [],
};

const navItems = [
  ["dashboard", "⌂", "Dashboard"], ["play", "◎", "Play Bot"],
  ["training", "✣", "Training"], ["stats", "▥", "Statistics"],
  ["history", "◷", "History"], ["ai", "✧", "My AI"],
];

const dartOptions = [
  ...Array.from({length:20}, (_,i)=>`S${i+1}`),
  ...Array.from({length:20}, (_,i)=>`D${i+1}`),
  ...Array.from({length:20}, (_,i)=>`T${i+1}`),
  "25", "BULL", "MISS"
];

async function apiRequest(path, options = {}, token = state.apiToken) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `API request failed (${response.status}).`);
  return data;
}

async function connectApi(token) {
  state.apiError = "";
  try {
    await apiRequest("/api/matches", { method: "GET" }, token);
    state.apiToken = token;
    sessionStorage.setItem("dartsbot_api_token", token);
    state.apiReady = true;
    render();
  } catch (error) {
    state.apiReady = false;
    state.apiError = error.message.includes("Unauthorised")
      ? "That token was not accepted. Check the API_TOKEN secret in Cloudflare."
      : error.message;
    render();
  }
}

function authPage() {
  return `<div class="app-shell"><main><section class="page-intro"><p class="eyebrow">PRIVATE PLAYER ACCESS</p><h1>Darts <span>Bot</span></h1><p class="muted">Enter your private API token to connect to your match records.</p></section><section class="info-panel" style="max-width:520px;margin:24px auto"><label for="api-token" style="display:block;margin-bottom:10px">Cloudflare API token</label><input id="api-token" type="password" autocomplete="off" placeholder="Paste your API token" style="width:100%;padding:14px;border-radius:10px;border:1px solid #555;background:#171717;color:#fff"><button class="primary-button full-width" data-action="connect-api" style="margin-top:14px">Connect to my records</button>${state.apiError ? `<p class="match-notice">${state.apiError}</p>` : ""}<p class="tiny muted">The token is kept only for this browser tab session. It is not included in the published website code. Never share it.</p></section></main></div>`;
}

async function saveCompletedMatch() {
  const m = state.match;
  if (!m || m.status !== "complete" || m.savedToDatabase || !state.apiReady) return;
  const legs = m.completedLegs.map((leg, i) => ({
    ...leg,
    playerFirstNineAverage: leg.playerFirstNineDarts ? leg.playerFirstNinePoints / leg.playerFirstNineDarts * 3 : 0,
    botFirstNineAverage: leg.botFirstNineDarts ? leg.botFirstNinePoints / leg.botFirstNineDarts * 3 : 0
  }));
  const payload = {
    id: m.id,
    playedAt: m.playedAt,
    game: m.game,
    bestOf: m.bestOf,
    playerLegs: m.playerLegs,
    botLegs: m.botLegs,
    opponent: m.opponent,
    dartSetupSnapshot: m.dartSetupSnapshot || null,
    legs
  };
  state.saveStatus = "Saving match to your records…";
  render();
  try {
    await apiRequest("/api/matches", { method: "POST", body: JSON.stringify(payload) });
    state.match.savedToDatabase = true;
    state.saveStatus = "Match saved to your records.";
  } catch (error) {
    state.saveStatus = `Match not saved: ${error.message}`;
  }
  render();
}

function setPage(page) { state.page = page; render(); if (page === "history") loadMatchHistory(); }
function metric(value,label) { return `<article class="metric"><span class="metric-symbol">✦</span><strong>${value}</strong><small>${label}</small></article>`; }
function feature(icon,title,desc,page) { return `<button class="feature-card" data-action="${page}"><span>${icon}</span><b>${title}</b><small>${desc}</small></button>`; }

function dashboard() {
  return `<section class="welcome">
    <p class="eyebrow">YOUR GAME. YOUR PROGRESS.</p><h1>Ready to <span>throw?</span></h1>
    <p class="muted">Build consistency, challenge your rival and track every improvement.</p>
    <button class="hero-cta" data-action="play"><span class="hero-icon">◎</span><span><b>PLAY AGAINST BOT</b><small>Choose your opponent and start a match</small></span><span class="arrow">↗</span></button>
  </section>
  <section class="metric-grid">${metric("—","3-DART AVERAGE")}${metric("—","CHECKOUT RATE")}${metric("0","MATCH WINS")}${metric("0","180s HIT")}</section>
  <section class="section-block"><div class="section-heading"><h2>Your darts centre</h2><span class="muted">OVERVIEW</span></div>
  <div class="feature-grid">${feature("✣","Training Centre","Practice and improve","training")}${feature("▥","Statistics","See your performance","stats")}${feature("◷","Match History","Review previous games","history")}${feature("✧","My AI Opponent","Your evolving rival","ai")}</div></section>`;
}

function levelCards() {
  return Object.entries(BOT_LEVELS).map(([level,p])=>`<button class="level-card ${state.level===Number(level)?"selected":""}" data-level="${level}">
    <span class="level-number">LEVEL ${level}</span><strong>${p.averageMin}–${p.averageMax}</strong><small>3-dart average</small><span class="checkout-rate">501 finish target · ${p.peakDarts} darts peak</span><small>Normal target up to ${p.normalMaxDarts} darts</small>
  </button>`).join("");
}

function playSetup() {
  return `<section class="page-intro"><p class="eyebrow">MATCH SETUP · STEP 1</p><h1>Choose your <span>opponent</span></h1><p class="muted">Choose your challenge before the match. Settings lock when play begins.</p></section>
  <div class="opponent-grid">
    <button class="opponent-card ${state.opponent==="standard"?"selected":""}" data-opponent="standard"><span class="large-symbol">◎</span><b>Standard Bot</b><small>Choose one of five fixed difficulty levels.</small><span class="selection">${state.opponent==="standard"?"✓ SELECTED":"SELECT"}</span></button>
    <button class="opponent-card ${state.opponent==="personal"?"selected":""}" data-opponent="personal"><span class="large-symbol">✧</span><b>My AI Opponent</b><small>A personalised rival that adapts as match data builds.</small><span class="selection">${state.opponent==="personal"?"✓ SELECTED":"SELECT"}</span></button>
  </div>
  ${state.opponent==="standard"?`<section class="section-block"><div class="section-heading"><h2>Select difficulty</h2><span class="muted">FIVE LEVELS</span></div><div class="level-grid">${levelCards()}</div></section>`:
  `<section class="info-panel"><p class="eyebrow">PERSONALISED OPPONENT</p><h2>Built around your game.</h2><p class="muted">Adaptation begins after at least five completed matches. Learning weights: last 5 matches 50%, last 10 matches 30%, overall 20%. Target tolerance ±5%.</p><button class="text-button" data-action="ai">View AI details ↗</button></section>`}
  <section class="section-block setup-section"><p class="eyebrow">MATCH SETUP · STEP 2</p><h2>Choose your game</h2>
    <div class="segmented"><button class="${state.game===501?"active":""}" data-game="501">501</button><button class="${state.game===301?"active":""}" data-game="301">301</button></div>
    <h3>Match format</h3><div class="format-grid">${[5,7,9,11].map(n=>`<button class="format-card ${state.legs===n?"selected":""}" data-legs="${n}">Best of ${n}</button>`).join("")}</div>
    <div class="rules-row"><span>Checkout rules</span><b>Double out</b></div>
    <button class="primary-button full-width" data-action="start-match">Start match <span>→</span></button>
    <p class="tiny muted">Best of ${state.legs}: first to ${Math.ceil(state.legs/2)} legs wins.</p>
  </section>`;
}

function opponentName() {
  return state.match.opponent.type==="standard" ? `Standard Bot · Level ${state.match.opponent.level}` : "My AI Opponent · initial Level 3 baseline";
}
function activeLeg() { return state.match?.currentLeg; }
function playerLabel() { return "YOU"; }

function dartBoardEntry() {
  const slots=[0,1,2].map(i=>`<button class="dart-slot ${state.dartSelections[i]?"filled":""}" data-clear-slot="${i}"><small>DART ${i+1}</small><strong>${state.dartSelections[i]||"—"}</strong></button>`).join("");
  const rows=Array.from({length:20},(_,i)=>i+1);
  const columns=[["S","SINGLE"],["D","DOUBLE"],["T","TREBLE"]];
  return `<div class="dart-board-entry"><div class="dart-slots">${slots}</div><div class="dart-target-grid">${columns.map(([prefix,label])=>`<div class="dart-target-column"><b>${label}</b>${rows.map(n=>`<button data-dart-code="${prefix}${n}">${n}</button>`).join("")}</div>`).join("")}</div><div class="bull-row"><button data-dart-code="25"><b>25</b><small>OUTER BULL</small></button><button data-dart-code="BULL"><b>50</b><small>INNER BULL</small></button><button data-dart-code="MISS"><b>MISS</b><small>NO SCORE</small></button></div><div class="score-entry-actions"><button class="secondary-button" data-action="clear-darts">Clear</button><button class="primary-button" data-action="submit-visit" ${state.dartSelections.length!==3?"disabled":""}>CONFIRM DARTS</button></div></div>`;
}
function dartFromCode(code) {
  if (code==="MISS") return {score:0};
  if (code==="BULL") return {score:50,isDouble:true,isBull:true};
  if (code==="25") return {score:25};
  const mult=code[0], n=Number(code.slice(1));
  if (!n || n<1 || n>20) throw new Error("Choose a valid dart for all three darts.");
  const factor=mult==="T"?3:mult==="D"?2:1;
  return {score:n*factor,isDouble:mult==="D",isTreble:mult==="T"};
}
function formatVisit(v) {
  if (v.bust) return "BUST";
  if (v.checkout) return "CHECKOUT";
  return `${v.pointsScored}`;
}
function visitsMarkup(visits, label) {
  if (!visits?.length) return `<p class="muted tiny">No visits yet.</p>`;
  return [...visits].slice(-5).reverse().map(v=>`<div class="visit-row"><span>${label}</span><b>${formatVisit(v)}</b><small>${v.before} → ${v.after}</small></div>`).join("");
}
function dartLabel(d) {
  if (d.isBull) return "BULL";
  if (d.score===25) return "25";
  if (d.isDouble) return `D${d.score/2}`;
  if (d.isTreble) return `T${d.score/3}`;
  return `S${d.score}`;
}
function checkoutSuggestion(remaining) {
  if (remaining>170 || remaining<2) return "No checkout available";
  const route=checkoutRoute(remaining);
  return route ? route.map(dartLabel).join(" · ") : "No standard checkout";
}
function firstNineTotals(visits=[]) {
  let darts=0, points=0;
  for (const visit of visits) {
    if (darts >= 9) break;
    const visitDarts = Math.max(0, Number(visit.dartsThrown ?? visit.darts?.length ?? 0));
    if (!visitDarts) continue;
    const includedDarts = Math.min(visitDarts, 9 - darts);
    const visitPoints = visit.bust ? 0 : Number(visit.pointsScored || 0);
    // Visits are recorded as complete turns; this also supports manually recorded checkouts.
    points += visitDarts > includedDarts ? visitPoints * (includedDarts / visitDarts) : visitPoints;
    darts += includedDarts;
  }
  return { darts, points, average: darts ? (points / darts) * 3 : 0 };
}
function pooledFirstNine(completedLegs, currentVisits, side) {
  const completedDarts = completedLegs.reduce((sum, leg) => sum + (leg[`${side}FirstNineDarts`] || 0), 0);
  const completedPoints = completedLegs.reduce((sum, leg) => sum + (leg[`${side}FirstNinePoints`] || 0), 0);
  const current = firstNineTotals(currentVisits);
  const darts = completedDarts + current.darts;
  const points = completedPoints + current.points;
  return darts ? (points / darts) * 3 : 0;
}

function currentMatchMarkup() {
  const m=state.match, leg=m.currentLeg;
  const playerAvg=threeDartAverage(leg.player);
  const botAvg=leg.botDarts ? (leg.botPoints/leg.botDarts)*3 : 0;
  const playerFirstNine=firstNineTotals(leg.player.visits);
  const botFirstNine=firstNineTotals(leg.botVisits);
  const completedPlayerDarts=m.completedLegs.reduce((n,l)=>n+(l.playerDarts||0),0);
  const completedPlayerPoints=m.completedLegs.reduce((n,l)=>n+(l.playerPoints||0),0);
  const completedBotDarts=m.completedLegs.reduce((n,l)=>n+(l.botDarts||0),0);
  const completedBotPoints=m.completedLegs.reduce((n,l)=>n+(l.botPoints||0),0);
  const playerMatchAvg=(completedPlayerDarts+leg.player.dartsThrown)?((completedPlayerPoints+leg.player.pointsScored)/(completedPlayerDarts+leg.player.dartsThrown))*3:0;
  const botMatchAvg=(completedBotDarts+leg.botDarts)?((completedBotPoints+leg.botPoints)/(completedBotDarts+leg.botDarts))*3:0;
  const playerMatchFirstNine=pooledFirstNine(m.completedLegs,leg.player.visits,"player");
  const botMatchFirstNine=pooledFirstNine(m.completedLegs,leg.botVisits,"bot");
  const lastPlayer=leg.playerVisits[leg.playerVisits.length - 1];
  const lastBot=leg.botVisits[leg.botVisits.length - 1];
  const checkout=checkoutSuggestion(leg.player.remaining);
  const modeToggle=`<div class="entry-mode-switch"><button class="${state.entryMode==="total"?"active":""}" data-mode="total">Total score</button><button class="${state.entryMode==="darts"?"active":""}" data-mode="darts">Individual darts</button></div>`;
  const totalEntry=`<div class="total-entry"><div class="total-score-display">${state.scoreInput||"0"}</div><div class="number-pad">${["1","2","3","4","5","6","7","8","9","back","0"].map(k=>`<button data-key="${k}">${k==="back"?"DEL":k}</button>`).join("")}<button class="primary-button confirm-score" data-action="confirm-total">CONFIRM SCORE</button></div></div>`;
  const dartEntry=dartBoardEntry();
  const checkoutDialog=state.checkoutModal?`<div class="checkout-modal-backdrop"><section class="checkout-modal" role="dialog" aria-modal="true"><h2>Checkout recorded</h2><p>You entered ${leg.player.remaining} to finish. How many darts did you use?</p><div class="choice-row">${[1,2,3].map(n=>`<button class="${state.checkoutDarts===n?"selected":""}" data-checkout-darts="${n}">${n} ${n===1?"dart":"darts"}</button>`).join("")}</div><p>How many darts did you throw at a double?</p><div class="choice-row">${[1,2,3].map(n=>`<button class="${state.checkoutAttempts===n?"selected":""}" data-checkout-attempts="${n}">${n}</button>`).join("")}</div><div class="score-entry-actions"><button class="secondary-button" data-action="cancel-checkout">Cancel</button><button class="primary-button" data-action="record-checkout">Confirm checkout</button></div></section></div>`:"";
  return `<div class="landscape-match-layout"><section class="match-header-strip"><span class="best-of-label">BEST OF ${m.bestOf}</span><div><strong>YOU ${m.playerLegs} – ${m.botLegs} BOT</strong></div><span class="leg-count-label">LEG ${m.completedLegs.length+1}</span></section>
  <div class="live-score-grid reference-score-grid">
    <article class="live-player is-throwing is-active"><div class="live-player-heading"><small>YOU</small><span class="visit-counter">VISIT ${leg.playerVisits.length+1}</span></div><strong>${leg.player.remaining}</strong><div class="reference-average"><div class="average-metric"><span>LEG AVG</span><b>${playerAvg.toFixed(2)}</b></div><div class="average-metric"><span>LEG FIRST 9</span><b>${playerFirstNine.average.toFixed(2)}</b></div><div class="average-metric"><span>MATCH AVG</span><b>${playerMatchAvg.toFixed(2)}</b></div><div class="average-metric"><span>MATCH FIRST 9</span><b>${playerMatchFirstNine.toFixed(2)}</b></div></div></article>
    <article class="live-player bot-player"><div class="live-player-heading"><small>DART BOT</small><span class="visit-counter">VISIT ${leg.botVisits.length+1}</span></div><strong>${leg.botRemaining}</strong><div class="reference-average"><div class="average-metric"><span>LEG AVG</span><b>${botAvg.toFixed(2)}</b></div><div class="average-metric"><span>LEG FIRST 9</span><b>${botFirstNine.average.toFixed(2)}</b></div><div class="average-metric"><span>MATCH AVG</span><b>${botMatchAvg.toFixed(2)}</b></div><div class="average-metric"><span>MATCH FIRST 9</span><b>${botMatchFirstNine.toFixed(2)}</b></div></div></article>
  </div>
  <section class="checkout-panel"><small>CHECKOUT SUGGESTION</small><strong>${checkout}</strong></section>
  <section class="score-entry-panel reference-entry-panel"><div class="section-heading"><h2>SCORE ENTRY</h2><button class="score-undo-icon" type="button" data-action="undo" aria-label="Undo last visit" title="Undo last visit">↶</button></div>
    ${modeToggle}
    ${state.entryMode==="total"?totalEntry:dartEntry}
    <p class="tiny muted">Enter a visit total from 0–180. A score leaving 1 is a bust. For a checkout, use Individual darts to record the finishing double.</p>
  </section>
  ${state.notice?`<div class="match-notice">${state.notice}</div>`:""}
  <section class="info-panel"><div class="section-heading"><h2>Recent visits</h2></div>
    <div class="visit-columns"><div><h3>You</h3>${visitsMarkup(leg.playerVisits,"YOU")}</div><div><h3>Bot</h3>${visitsMarkup(leg.botVisits,"BOT")}</div></div>
  </section>
  <button class="secondary-button full-width landscape-end-match" data-action="abandon-match">End match</button>${checkoutDialog}</div>`;
}

function matchSideStats(legs, side) {
  const isPlayer = side === "player";
  const visits = legs.flatMap(leg => isPlayer
    ? (leg.playerVisits || leg.player?.visits || [])
    : (leg.botVisits || leg.bot?.visits || []));
  const darts = legs.reduce((n, leg) => n + Number(leg[isPlayer ? "playerDarts" : "botDarts"] || 0), 0);
  const points = legs.reduce((n, leg) => n + Number(leg[isPlayer ? "playerPoints" : "botPoints"] || 0), 0);
  const first9Darts = legs.reduce((n, leg) => n + Number(leg[isPlayer ? "playerFirstNineDarts" : "botFirstNineDarts"] || 0), 0);
  const first9Points = legs.reduce((n, leg) => n + Number(leg[isPlayer ? "playerFirstNinePoints" : "botFirstNinePoints"] || 0), 0);
  const checkoutVisits = visits.filter(v => Number(v.before) >= 2 && Number(v.before) <= 170);
  const checkouts = visits.filter(v => v.checkout);
  const checkoutRate = checkoutVisits.length ? checkouts.length / checkoutVisits.length * 100 : null;
  const highestFinish = checkouts.reduce((best, v) => Math.max(best, Number(v.before) || 0), 0);
  const highestScore = visits.filter(v => !v.bust).reduce((best, v) => Math.max(best, Number(v.pointsScored) || 0), 0);
  const legDarts = legs.map(leg => Number(leg[isPlayer ? "playerDarts" : "botDarts"] || 0)).filter(n => n > 0);
  return {
    average: darts ? points / darts * 3 : 0,
    first9: first9Darts ? first9Points / first9Darts * 3 : 0,
    checkoutRate, checkouts: checkouts.length, checkoutAttempts: checkoutVisits.length,
    highestFinish, highestScore,
    bestLeg: legDarts.length ? Math.min(...legDarts) : 0,
    worstLeg: legDarts.length ? Math.max(...legDarts) : 0
  };
}
function performanceComparison(legs) {
  const player = matchSideStats(legs, "player");
  const bot = matchSideStats(legs, "bot");
  const rows = [
    [player.average.toFixed(2), "3-DART AVERAGE", bot.average.toFixed(2)],
    [player.first9.toFixed(2), "FIRST 9 AVG.", bot.first9.toFixed(2)],
    [player.checkoutRate === null ? "—" : `${player.checkoutRate.toFixed(2)}%`, "CHECKOUT RATE", bot.checkoutRate === null ? "—" : `${bot.checkoutRate.toFixed(2)}%`],
    [`${player.checkouts} / ${player.checkoutAttempts}`, "CHECKOUTS", `${bot.checkouts} / ${bot.checkoutAttempts}`],
    [String(player.highestFinish || "—"), "HIGHEST FINISH", String(bot.highestFinish || "—")],
    [String(player.highestScore || "—"), "HIGHEST SCORE", String(bot.highestScore || "—")],
    [player.bestLeg ? `${player.bestLeg} DARTS` : "—", "BEST LEG", bot.bestLeg ? `${bot.bestLeg} DARTS` : "—"],
    [player.worstLeg ? `${player.worstLeg} DARTS` : "—", "WORST LEG", bot.worstLeg ? `${bot.worstLeg} DARTS` : "—"]
  ];
  return `<section class="info-panel performance-panel"><div class="section-heading"><h2>Performance overview</h2><span class="muted">YOU vs BOT</span></div><div class="comparison-grid">${rows.map(([left,label,right]) => `<div class="comparison-value player-value">${left}</div><div class="comparison-label">${label}</div><div class="comparison-value bot-value">${right}</div>`).join("")}</div><p class="tiny muted comparison-note">Checkout rate is successful checkout visits divided by visits taken from a finishable score (170 or less).</p></section>`;
}
function legReviewMarkup(legs, compact = false) {
  return `<section class="info-panel"><div class="section-heading"><h2>Leg breakdown</h2><span class="muted">${legs.length} LEGS</span></div>${legs.map((leg,i) => {
    const playerVisits = leg.playerVisits || leg.player?.visits || [];
    const botVisits = leg.botVisits || leg.bot?.visits || [];
    const visitRows = (items, who) => items.map((v,j) => `<div class="review-visit"><span class="review-visit-number">${who} · ${j+1}</span><b class="review-visit-score">${v.bust ? "BUST" : v.checkout ? "CHECKOUT" : Number(v.pointsScored || 0)}</b><small>${v.before ?? "—"} → ${v.after ?? "—"}${v.darts?.length ? ` · ${v.darts.map(d => d.isBull ? "BULL" : d.isDouble ? `D${d.score/2}` : d.isTreble ? `T${d.score/3}` : d.score===25 ? "25" : `S${d.score}`).join(" / ")}` : v.manualCheckout ? ` · ${v.checkoutDarts} darts to finish` : ""}</small></div>`).join("");
    return `<details class="review-leg" ${i===0 ? "open" : ""}><summary><b>Leg ${i+1} · ${leg.winner === "player" ? "You won" : "Bot won"}</b><span>${leg.playerDarts || 0} – ${leg.botDarts || 0} darts</span><i>⌄</i></summary><div class="review-leg-stats"><span>Your avg <b>${Number(leg.playerAverage || 0).toFixed(2)}</b></span><span>Bot avg <b>${Number(leg.botAverage || 0).toFixed(2)}</b></span><span>Your first 9 <b>${(leg.playerFirstNineDarts ? Number(leg.playerFirstNinePoints || 0) / Number(leg.playerFirstNineDarts) * 3 : 0).toFixed(2)}</b></span><span>Bot first 9 <b>${(leg.botFirstNineDarts ? Number(leg.botFirstNinePoints || 0) / Number(leg.botFirstNineDarts) * 3 : 0).toFixed(2)}</b></span></div><div class="review-side"><h3>You</h3>${visitRows(playerVisits,"You") || `<p class="tiny muted">No visit detail recorded.</p>`}</div><div class="review-side"><h3>Bot</h3>${visitRows(botVisits,"Bot") || `<p class="tiny muted">No visit detail recorded.</p>`}</div></details>`;
  }).join("")}</section>`;
}
function matchSummary() {
  const m = state.match;
  const won = m.playerLegs > m.botLegs;
  const opponent = opponentName();
  const legs = m.completedLegs || [];
  return `<style>${matchReviewStyles()}</style><section class="page-intro"><p class="eyebrow">MATCH COMPLETE</p><h1>${won ? "You won" : "Bot won"} <span>the match</span></h1><p class="muted">${opponent} · ${m.game} · Best of ${m.bestOf} · ${matchDate(m.playedAt)}</p></section><section class="match-result review-result"><div><small>FINAL SCORE</small><strong>${m.playerLegs} – ${m.botLegs}</strong></div><div class="review-result-names"><span>YOU</span><span>BOT</span></div></section>${performanceComparison(legs)}${legReviewMarkup(legs)}<section class="info-panel" aria-live="polite"><h2>Match record</h2><p class="muted">${state.saveStatus || (m.savedToDatabase ? "Match saved to your records." : "Saving match to your records…")}</p>${!m.savedToDatabase && state.saveStatus.startsWith("Match not saved:") ? `<button class="secondary-button full-width" data-action="retry-save">Retry saving match</button>` : ""}</section><button class="primary-button full-width" data-action="new-match">New match</button><button class="secondary-button full-width" data-action="dashboard">Dashboard</button>`;
}
function matchReviewStyles() {
  return `.review-result{display:flex;align-items:center;justify-content:space-between}.review-result>div:first-child strong{font-size:2.3rem}.review-result-names{display:flex;gap:32px;color:#aeb4c2;font-size:.75rem;font-weight:800}.performance-panel{margin-top:14px}.comparison-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(112px,1.35fr) minmax(0,1fr);align-items:center;gap:7px 8px;margin-top:18px}.comparison-value{font-weight:800;font-size:clamp(.92rem,2.5vw,1.2rem);font-variant-numeric:tabular-nums;white-space:nowrap}.player-value{text-align:right;color:#d9b34b}.bot-value{text-align:left;color:#f4f4f4}.comparison-label{background:#30343a;color:#f1f2f4;text-align:center;border-radius:5px;padding:5px 3px;font-size:clamp(.57rem,1.5vw,.7rem);font-weight:800;letter-spacing:.025em}.comparison-note{margin:16px 0 0}.review-leg{border-top:1px solid #34383f;padding:14px 0}.review-leg summary{display:flex;align-items:center;justify-content:space-between;gap:10px;cursor:pointer;list-style:none}.review-leg summary::-webkit-details-marker{display:none}.review-leg summary span{color:#d8b04b;font-weight:700;font-size:.82rem}.review-leg summary i{color:#d8b04b;font-style:normal}.review-leg-stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px 16px;color:#aeb4c2;margin:14px 0}.review-leg-stats b{color:#fff;margin-left:5px;font-variant-numeric:tabular-nums}.review-side h3{font-size:.82rem;margin:15px 0 6px;color:#d8b04b}.review-visit{display:grid;grid-template-columns:minmax(65px,.8fr) 90px minmax(0,2fr);align-items:center;gap:8px;padding:8px 0;border-top:1px solid #292d32}.review-visit-number{font-size:.78rem;color:#aeb4c2}.review-visit-score{font-size:.9rem;color:#fff}.review-visit small{font-size:.72rem;color:#aeb4c2;text-align:right;overflow-wrap:anywhere}@media(max-width:430px){.comparison-grid{grid-template-columns:minmax(0,1fr) minmax(100px,1.45fr) minmax(0,1fr);gap:6px 5px}.comparison-value{font-size:.85rem}.comparison-label{font-size:.55rem}.review-visit{grid-template-columns:62px 74px minmax(0,1fr);gap:5px}.review-visit small{font-size:.66rem}}`;
}


async function loadMatchHistory() {
  state.historyLoading = true;
  state.historyError = "";
  render();
  try {
    const data = await apiRequest("/api/matches");
    state.historyMatches = data.matches || [];
    state.historyVisible = 5;
  } catch (error) {
    state.historyError = error.message;
  } finally {
    state.historyLoading = false;
    render();
  }
}

function monthLabel(value) {
  const [year, month] = value.split("-");
  return new Date(Number(year), Number(month) - 1, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}
function matchDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function historyPage() {
  const months = [...new Set(state.historyMatches.map(m => String(m.played_at || "").slice(0, 7)).filter(v => /^\d{4}-\d{2}$/.test(v)))];
  const filtered = state.historyMatches.filter(m => state.historyMonth === "all" || String(m.played_at || "").startsWith(state.historyMonth));
  const shown = filtered.slice(0, state.historyVisible);
  return `<style>
    .history-panel{margin-top:28px}.history-filter{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:18px 0}.history-filter label{color:#aeb4c2;font-size:.9rem}.history-filter select{background:#17191d;color:#fff;border:1px solid #383c43;border-radius:9px;padding:11px 14px;min-width:180px}
    .history-list{display:grid;gap:9px;margin:16px 0}.history-match-row{display:flex;align-items:center;gap:13px;width:100%;text-align:left;padding:14px;background:#111316;border:1px solid #30343a;border-radius:12px;color:#f5f5f5;cursor:pointer}.history-match-row:hover{border-color:#c79b35}.history-result{display:grid;place-items:center;width:34px;height:34px;border-radius:50%;font-weight:800}.history-result.win{background:#263a2c;color:#8bd19b}.history-result.loss{background:#3a2929;color:#e6a0a0}.history-match-main{display:grid;gap:4px;flex:1;min-width:0}.history-match-main small{color:#9ba3b2;font-size:.78rem}.history-match-row>strong{white-space:nowrap}.history-chevron{color:#d7ad4b;font-size:1.5rem}
    .review-leg{border-top:1px solid #34383f;padding:14px 0}.review-leg summary{display:flex;justify-content:space-between;gap:12px;cursor:pointer;list-style:none}.review-leg summary::-webkit-details-marker{display:none}.review-leg summary span{color:#d8b04b;font-weight:700}.review-leg-stats{display:flex;gap:24px;flex-wrap:wrap;color:#aeb4c2;margin:12px 0}.review-leg-stats b{color:#fff;margin-left:5px}.review-leg h3{font-size:.9rem;margin:16px 0 6px;color:#d8b04b}
  </style><section class="page-intro"><p class="eyebrow">DARTS BOT</p><h1>Match <span>History</span></h1><p class="muted">Every match, every leg and every improvement.</p></section>
    <section class="info-panel history-panel">
      <div class="section-heading"><h2>Your match history</h2><span class="muted">${filtered.length} MATCHES</span></div>
      <div class="history-filter"><label for="history-month">Filter by month</label><select id="history-month"><option value="all" ${state.historyMonth==="all"?"selected":""}>All matches</option>${months.map(m=>`<option value="${m}" ${state.historyMonth===m?"selected":""}>${monthLabel(m)}</option>`).join("")}</select></div>
      ${state.historyLoading ? `<p class="muted">Loading your matches…</p>` : ""}
      ${state.historyError ? `<p class="match-notice">Couldn't load match history: ${state.historyError}</p><button class="secondary-button" data-action="refresh-history">Try again</button>` : ""}
      ${!state.historyLoading && !state.historyError && !shown.length ? `<p class="muted">No saved matches${state.historyMonth==="all"?" yet":` for ${monthLabel(state.historyMonth)}`}.</p>` : ""}
      <div class="history-list">${shown.map(m => {
        const won = Number(m.player_legs) > Number(m.bot_legs);
        const opponent = m.opponent_type === "standard" ? `Standard Bot${m.bot_level ? ` · Level ${m.bot_level}` : ""}` : "My AI Opponent";
        return `<button class="history-match-row" data-match-id="${m.id}"><span class="history-result ${won?"win":"loss"}">${won?"W":"L"}</span><span class="history-match-main"><b>${opponent}</b><small>${matchDate(m.played_at)} · ${m.game} · Best of ${m.best_of}</small></span><strong>${m.player_legs}–${m.bot_legs}</strong><span class="history-chevron">›</span></button>`;
      }).join("")}</div>
      ${shown.length < filtered.length ? `<button class="secondary-button full-width" data-action="load-more-history">Load more matches</button>` : ""}
      <p class="tiny muted">Showing the latest ${shown.length} of ${filtered.length} matching records. History currently retrieves up to 100 matches.</p>
    </section>`;
}
async function openMatchReview(id) {
  state.reviewLoading = true;
  state.selectedHistoryMatch = null;
  render();
  try {
    const data = await apiRequest(`/api/matches/${encodeURIComponent(id)}`);
    state.selectedHistoryMatch = data.match;
    state.page = "review";
  } catch (error) {
    state.historyError = error.message;
    state.page = "history";
  } finally {
    state.reviewLoading = false;
    render();
  }
}
function matchReviewPage() {
  const m = state.selectedHistoryMatch;
  if (!m) return `<section class="page-intro"><h1>Match <span>Review</span></h1><p class="muted">Loading match details…</p></section>`;
  const won = Number(m.playerLegs) > Number(m.botLegs);
  const opponent = m.opponent?.type === "standard" ? `Standard Bot · Level ${m.opponent.level || 3}` : "My AI Opponent";
  const legs = m.legs || [];
  return `<style>${matchReviewStyles()}</style><section class="page-intro"><p class="eyebrow">MATCH REVIEW · ${matchDate(m.playedAt)}</p><h1>${won ? "You won" : "Bot won"} <span>the match</span></h1><p class="muted">${opponent} · ${m.game} · Best of ${m.bestOf}</p></section><section class="match-result review-result"><div><small>FINAL SCORE</small><strong>${m.playerLegs} – ${m.botLegs}</strong></div><div class="review-result-names"><span>YOU</span><span>BOT</span></div></section>${performanceComparison(legs)}${legReviewMarkup(legs)}<button class="secondary-button full-width" data-action="back-history">Back to Match History</button>`;
}

function simplePage(title,subtitle,icon,body) {
  return `<section class="page-intro"><p class="eyebrow">DARTS BOT</p><h1>${title}</h1><p class="muted">${subtitle}</p></section><section class="info-panel"><span class="large-symbol">${icon}</span><h2>${body}</h2><p class="muted">This section will connect to your shared match and training records as development continues.</p></section>`;
}
function aiPage() {
  return `<section class="page-intro"><p class="eyebrow">YOUR PERSONAL RIVAL</p><h1>My AI <span>Opponent</span></h1><p class="muted">An opponent that develops as your game develops.</p></section><section class="info-panel"><h2>Adaptive performance model</h2><div class="weight-row"><span>Last 5 matches</span><b>50%</b></div><div class="weight-row"><span>Last 10 matches</span><b>30%</b></div><div class="weight-row"><span>Overall performance</span><b>20%</b></div><div class="weight-row"><span>Competitive tolerance</span><b>±5%</b></div><div class="weight-row"><span>Minimum matches to begin</span><b>5</b></div><p class="muted">The personalised opponent interface is present; learning and persistent history will be integrated in a later stage.</p></section>`;
}

function makeNewLeg() {
  return { player: createLeg(state.match.game,{doubleOut:true}), bot: createLeg(state.match.game,{doubleOut:true}), playerVisits:[], botVisits:[], botRemaining:state.match.game, botDarts:0, botPoints:0 };
}
function startMatch() {
  state.match={
    id: `match_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
    playedAt: new Date().toISOString(),
    game:state.game,bestOf:state.legs,legsToWin:Math.ceil(state.legs/2),
    opponent:{type:state.opponent,level:state.level},
    playerLegs:0,botLegs:0,completedLegs:[],currentLeg:null,status:"in_progress"
  };
  state.match.currentLeg=makeNewLeg();
  state.undoStack=[];state.notice="Match started. You're throwing first.";
  setPage("match");
}
function cloneMatchState(match) {
  // Match state contains plain data only. JSON cloning also works in older
  // Android browsers where structuredClone may not be implemented.
  return JSON.parse(JSON.stringify(match));
}
function saveUndoSnapshot() {
  if (!state.match) throw new Error("There is no active match to save.");
  state.undoStack.push(cloneMatchState(state.match));
  if (state.undoStack.length > 30) state.undoStack.shift();
}
function finishLeg(winner) {
  const l=state.match.currentLeg;
  if(winner==="player")state.match.playerLegs++;else state.match.botLegs++;
  state.match.completedLegs.push({
    winner,playerScore:l.player.remaining,botScore:l.botRemaining,
    playerAverage:Number(threeDartAverage(l.player).toFixed(2)),
    playerDarts:l.player.dartsThrown,
    playerPoints:l.player.pointsScored,
    botAverage:Number(l.botDarts?(l.botPoints/l.botDarts*3).toFixed(1):0),
    botDarts:l.botDarts,
    botPoints:l.botPoints,
    playerFirstNineDarts:firstNineTotals(l.player.visits).darts,
    playerFirstNinePoints:firstNineTotals(l.player.visits).points,
    botFirstNineDarts:firstNineTotals(l.botVisits).darts,
    botFirstNinePoints:firstNineTotals(l.botVisits).points,
    playerVisits: JSON.parse(JSON.stringify(l.playerVisits)),
    botVisits: JSON.parse(JSON.stringify(l.botVisits))
  });
  if(state.match.playerLegs>=state.match.legsToWin||state.match.botLegs>=state.match.legsToWin){
    state.match.status="complete";state.match.currentLeg=null;state.notice="";
    saveCompletedMatch();
  } else {
    state.match.currentLeg=makeNewLeg();
    state.notice=`${winner==="player"?"You won":"Bot won"} the leg. Leg ${state.match.completedLegs.length+1} — you're throwing first.`;
  }
}
function scoreDarts(darts) {
  const l=state.match.currentLeg;
  l.player=applyVisit(l.player,darts);
  const visit=l.player.visits[l.player.visits.length - 1];
  l.playerVisits.push(visit);
  if(visit.bust)state.notice=`Bust — your score stays at ${visit.before}.`;
  else if(visit.checkout){state.notice="Leg won!";finishLeg("player");return;}
  else {state.notice=`You scored ${visit.pointsScored}. Bot is throwing.`;botTurn();}
}
function botTurn() {
  const m=state.match,l=m.currentLeg;
  const result=generateBotVisit({level:m.opponent.level||3,remaining:l.botRemaining,game:m.game});
  const darts=result.darts;
  const before=l.botRemaining;
  const checkout=Boolean(result.checkout);
  const bust=Boolean(result.bust);
  const scored=bust?0:darts.reduce((s,d)=>s+d.score,0);
  l.botDarts+=darts.length;
  l.botPoints+=scored;
  l.botRemaining=checkout?0:(bust?before:before-scored);
  const visit={before,after:l.botRemaining,pointsScored:scored,dartsThrown:darts.length,darts,bust,bustReason:bust?"bust":null,checkout};
  l.botVisits.push(visit);
  if(checkout){state.notice="Bot checked out. Leg to the bot.";finishLeg("bot");}
  else if(bust)state.notice=`Bot busts — score remains ${before}. Your turn.`;
  else state.notice=`Bot scored ${scored}. Your turn.`;
}

function recordManualCheckout() {
  const l=state.match.currentLeg, before=l.player.remaining;
  const darts=state.checkoutDarts, attempts=state.checkoutAttempts;
  const visit={before,after:0,pointsScored:before,dartsThrown:darts,darts:[],bust:false,bustReason:null,checkout:true,checkoutAttempts:attempts,checkoutDarts:darts,manualCheckout:true};
  l.player={...l.player,remaining:0,dartsThrown:l.player.dartsThrown+darts,pointsScored:l.player.pointsScored+before,visits:[...l.player.visits,visit],finished:true,busted:false};
  l.playerVisits.push(visit);
  state.checkoutModal=false;state.scoreInput="";
  state.notice="Checkout! Leg won.";
  finishLeg("player");
  render();
}
function submitTotalVisit() {
  try {
    const total=Number(state.scoreInput);
    if(state.scoreInput==="" || !Number.isInteger(total) || total<0 || total>180) {
      throw new Error("Enter a visit score between 0 and 180.");
    }
    const remaining=state.match.currentLeg.player.remaining;
    if(total===remaining) {
      state.checkoutModal=true;state.checkoutDarts=3;state.checkoutAttempts=1;render();return;
    }
    saveUndoSnapshot();
    const l=state.match.currentLeg;
    l.player=applyTotalVisit(l.player,total);
    const visit=l.player.visits[l.player.visits.length - 1];
    l.playerVisits.push(visit);
    state.scoreInput="";
    if(visit.bust) state.notice=`Bust — your score stays at ${visit.before}.`;
    else { state.notice=`You scored ${visit.pointsScored}. Bot is throwing.`; botTurn(); }
    render();
  } catch(err){state.notice=err.message;render();}
}
function submitPlayerVisit() {
  try {
    const codes=state.dartSelections;
    if(codes.length!==3)throw new Error("Select all three darts before submitting.");
    saveUndoSnapshot();
    scoreDarts(codes.map(dartFromCode));
    state.dartSelections=[];
    render();
  } catch(err){state.notice=err.message;render();}
}
function undoRound() {
  if(!state.undoStack.length){state.notice="There is no previous round to undo.";render();return;}
  state.match=state.undoStack.pop();state.notice="Last player and bot round undone.";render();
}

function render() {
  if (!state.apiReady) {
    app.innerHTML = authPage();
    app.querySelector('[data-action="connect-api"]')?.addEventListener("click", () => {
      const token = app.querySelector("#api-token")?.value.trim();
      if (!token) { state.apiError = "Enter your API token to continue."; render(); return; }
      connectApi(token);
    });
    return;
  }
  let content;
  if(state.page==="dashboard")content=dashboard();
  else if(state.page==="play")content=playSetup();
  else if(state.page==="match")content=state.match?.status==="complete"?matchSummary():currentMatchMarkup();
  else if(state.page==="review")content=matchReviewPage();
  else if(state.page==="history")content=historyPage();
  else if(state.page==="ai")content=aiPage();
  else if(state.page==="training")content=simplePage("Training Centre","Focused practice to sharpen your game.","✣","Your training games");
  else if(state.page==="stats")content=simplePage("Statistics","Track your scoring, finishing and consistency.","▥","Your performance dashboard");
  else content=simplePage("Match History","Every match, every leg and every improvement.","◷","Your match history");

  app.innerHTML=`<div class="app-shell ${state.page==="match"?"match-active":""}"><header class="topbar"><button class="brand" data-action="dashboard"><span class="brand-mark">◎</span><span>DARTS <b>BOT</b><small>YOUR GAME. YOUR PROGRESS.</small></span></button><button class="profile-button" aria-label="Profile">MB</button></header><main>${content}</main><nav class="bottom-nav" aria-label="Main navigation">${navItems.map(([page,icon,label])=>`<button class="${state.page===page?"current":""}" data-action="${page}"><span>${icon}</span><small>${label}</small></button>`).join("")}</nav><footer>DARTS BOT <span>·</span> BUILDING YOUR GAME, ONE VISIT AT A TIME</footer></div>`;

  app.querySelectorAll("[data-action]").forEach(el=>el.addEventListener("click",()=>{
    const a=el.dataset.action;
    if(a==="start-match")startMatch();
    else if(a==="retry-save")saveCompletedMatch();
    else if(a==="refresh-history")loadMatchHistory();
    else if(a==="load-more-history"){state.historyVisible+=5;render();}
    else if(a==="back-history")setPage("history");
    else if(a==="submit-visit")submitPlayerVisit();
    else if(a==="confirm-total")submitTotalVisit();
    else if(a==="record-checkout")recordManualCheckout();
    else if(a==="cancel-checkout"){state.checkoutModal=false;render();}
    else if(a==="undo")undoRound();
    else if(a==="clear-darts"){state.dartSelections=[];render();}
    else if(a==="abandon-match"){state.match=null;state.undoStack=[];setPage("play");}
    else if(a==="new-match"){state.match=null;state.undoStack=[];setPage("play");}
    else setPage(a);
  }));
  app.querySelector("#history-month")?.addEventListener("change", el => { state.historyMonth = el.target.value; state.historyVisible = 5; render(); });
  app.querySelectorAll("[data-match-id]").forEach(el => el.addEventListener("click", () => openMatchReview(el.dataset.matchId)));
  app.querySelectorAll("[data-dart-code]").forEach(el=>el.addEventListener("click",()=>{
    if(state.dartSelections.length<3){state.dartSelections.push(el.dataset.dartCode);render();}
  }));
  app.querySelectorAll("[data-clear-slot]").forEach(el=>el.addEventListener("click",()=>{
    const i=Number(el.dataset.clearSlot);state.dartSelections.splice(i,1);render();
  }));
  app.querySelectorAll("[data-checkout-darts]").forEach(el=>el.addEventListener("click",()=>{
    state.checkoutDarts=Number(el.dataset.checkoutDarts);render();
  }));
  app.querySelectorAll("[data-checkout-attempts]").forEach(el=>el.addEventListener("click",()=>{
    state.checkoutAttempts=Number(el.dataset.checkoutAttempts);render();
  }));
  app.querySelectorAll("[data-mode]").forEach(el=>el.addEventListener("click",()=>{state.entryMode=el.dataset.mode;state.notice="";render();}));
  app.querySelectorAll("[data-key]").forEach(el=>el.addEventListener("click",()=>{
    const k=el.dataset.key;
    if(k==="back")state.scoreInput=state.scoreInput.slice(0,-1);
    else if(state.scoreInput.length<3)state.scoreInput+=k;
    if(Number(state.scoreInput)>180)state.scoreInput=state.scoreInput.slice(0,-k.length);
    render();
  }));
  app.querySelectorAll("[data-opponent]").forEach(el=>el.addEventListener("click",()=>{state.opponent=el.dataset.opponent;render();}));
  app.querySelectorAll("[data-level]").forEach(el=>el.addEventListener("click",()=>{state.level=Number(el.dataset.level);render();}));
  app.querySelectorAll("[data-game]").forEach(el=>el.addEventListener("click",()=>{state.game=Number(el.dataset.game);render();}));
  app.querySelectorAll("[data-legs]").forEach(el=>el.addEventListener("click",()=>{state.legs=Number(el.dataset.legs);render();}));
}
if (state.apiToken) connectApi(state.apiToken);
else render();