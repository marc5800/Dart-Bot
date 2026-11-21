import "./style.css";
import { BOT_LEVELS } from "./engine.js";

const app = document.querySelector("#app");

const state = {
  page: "dashboard",
  opponent: "standard",
  level: 3,
  game: 501,
  legs: 3,
  matchStarted: false,
};

const navItems = [
  ["dashboard", "⌂", "Dashboard"],
  ["play", "◎", "Play Bot"],
  ["training", "✣", "Training"],
  ["stats", "▥", "Statistics"],
  ["history", "◷", "History"],
  ["ai", "✧", "My AI"],
];

function setPage(page) {
  state.page = page;
  render();
}

function button(label, action, className = "button") {
  return `<button class="${className}" data-action="${action}">${label}</button>`;
}

function levelCards() {
  return Object.entries(BOT_LEVELS).map(([level, p]) => `
    <button class="level-card ${state.level === Number(level) ? "selected" : ""}" data-level="${level}">
      <span class="level-number">LEVEL ${level}</span>
      <strong>${p.averageMin}–${p.averageMax}</strong>
      <small>3-dart average</small>
      <span class="checkout-rate">${Math.round(p.checkoutRate * 100)}% checkout</span>
    </button>
  `).join("");
}

function dashboard() {
  return `
    <section class="welcome">
      <p class="eyebrow">YOUR GAME. YOUR PROGRESS.</p>
      <h1>Ready to <span>throw?</span></h1>
      <p class="muted">Build consistency, challenge your rival and track every improvement.</p>
      <button class="hero-cta" data-action="play">
        <span class="hero-icon">◎</span>
        <span><b>PLAY AGAINST BOT</b><small>Choose your opponent and start a match</small></span>
        <span class="arrow">↗</span>
      </button>
    </section>
    <section class="metric-grid">
      ${metric("—", "3-DART AVERAGE")}
      ${metric("—", "CHECKOUT RATE")}
      ${metric("0", "MATCH WINS")}
      ${metric("0", "180s HIT")}
    </section>
    <section class="section-block">
      <div class="section-heading"><h2>Your darts centre</h2><span class="muted">OVERVIEW</span></div>
      <div class="feature-grid">
        ${feature("✣", "Training Centre", "Practice and improve", "training")}
        ${feature("▥", "Statistics", "See your performance", "stats")}
        ${feature("◷", "Match History", "Review previous games", "history")}
        ${feature("✧", "My AI Opponent", "Your evolving rival", "ai")}
      </div>
    </section>`;
}

function metric(value, label) {
  return `<article class="metric"><span class="metric-symbol">✦</span><strong>${value}</strong><small>${label}</small></article>`;
}
function feature(icon, title, desc, page) {
  return `<button class="feature-card" data-action="${page}"><span>${icon}</span><b>${title}</b><small>${desc}</small></button>`;
}

function playSetup() {
  return `
    <section class="page-intro">
      <p class="eyebrow">MATCH SETUP · STEP 1</p><h1>Choose your <span>opponent</span></h1>
      <p class="muted">Choose the challenge before the match begins. Settings stay locked during play.</p>
    </section>
    <div class="opponent-grid">
      <button class="opponent-card ${state.opponent === "standard" ? "selected" : ""}" data-opponent="standard">
        <span class="large-symbol">◎</span><b>Standard Bot</b><small>Choose one of five fixed difficulty levels.</small>
        <span class="selection">${state.opponent === "standard" ? "✓ SELECTED" : "SELECT"}</span>
      </button>
      <button class="opponent-card ${state.opponent === "personal" ? "selected" : ""}" data-opponent="personal">
        <span class="large-symbol">✧</span><b>My AI Opponent</b><small>A personalised rival that adapts to your match performance.</small>
        <span class="selection">${state.opponent === "personal" ? "✓ SELECTED" : "SELECT"}</span>
      </button>
    </div>
    ${state.opponent === "standard" ? `
      <section class="section-block">
        <div class="section-heading"><h2>Select difficulty</h2><span class="muted">FIVE LEVELS</span></div>
        <div class="level-grid">${levelCards()}</div>
      </section>` : `
      <section class="info-panel">
        <p class="eyebrow">PERSONALISED OPPONENT</p><h2>Built around your game.</h2>
        <p class="muted">After at least five completed matches, the bot begins adapting. It uses a weighted view of your recent and overall performance, with a target tolerance of ±5%.</p>
        <div class="weight-row"><span>Last 5 matches</span><b>50%</b></div>
        <div class="weight-row"><span>Last 10 matches</span><b>30%</b></div>
        <div class="weight-row"><span>Overall performance</span><b>20%</b></div>
        <button class="text-button" data-action="ai">View AI opponent details ↗</button>
      </section>`}
    <section class="section-block setup-section">
      <p class="eyebrow">MATCH SETUP · STEP 2</p><h2>Choose your game</h2>
      <div class="segmented">
        <button class="${state.game === 501 ? "active" : ""}" data-game="501">501</button>
        <button class="${state.game === 301 ? "active" : ""}" data-game="301">301</button>
      </div>
      <h3>Match format</h3>
      <div class="format-grid">
        ${[1,3,5,7].map(n => `<button class="format-card ${state.legs === n ? "selected" : ""}" data-legs="${n}">${n === 1 ? "Single leg" : `Best of ${n}`}</button>`).join("")}
      </div>
      <div class="rules-row"><span>Checkout rules</span><b>Double out</b></div>
      <button class="primary-button full-width" data-action="start-match">Continue to match <span>→</span></button>
      <p class="tiny muted">Opponent settings are locked once the match starts.</p>
    </section>`;
}

function matchPreview() {
  const name = state.opponent === "standard" ? `Standard Bot · Level ${state.level}` : "My AI Opponent";
  return `
    <section class="page-intro"><p class="eyebrow">MATCH READY</p><h1>${state.game} <span>match</span></h1><p class="muted">Your opponent and rules are locked for this match.</p></section>
    <div class="match-preview">
      <div><small>YOU</small><strong>${state.game}</strong><span>Player</span></div>
      <div class="versus">VS</div>
      <div><small>OPPONENT</small><strong>${state.game}</strong><span>${name}</span></div>
    </div>
    <div class="info-panel"><b>Match format</b><p class="muted">${state.legs === 1 ? "One leg" : `Best of ${state.legs}`} · Double out</p><p class="tiny muted">The live scoring interface and automated bot turns are the next integration stage. This preview confirms the match setup only.</p></div>
    <button class="primary-button full-width" data-action="back-setup">← Back to setup</button>`;
}

function simplePage(title, subtitle, icon, body) {
  return `<section class="page-intro"><p class="eyebrow">DARTS BOT</p><h1>${title}</h1><p class="muted">${subtitle}</p></section>
    <section class="info-panel"><span class="large-symbol">${icon}</span><h2>${body}</h2><p class="muted">This section will connect to the shared match and training database as development continues.</p></section>`;
}

function aiPage() {
  return `<section class="page-intro"><p class="eyebrow">YOUR PERSONAL RIVAL</p><h1>My AI <span>Opponent</span></h1><p class="muted">An opponent that develops as your game develops.</p></section>
    <section class="info-panel"><span class="large-symbol">✧</span><h2>Adaptive performance model</h2>
      <div class="weight-row"><span>Last 5 matches</span><b>50%</b></div>
      <div class="weight-row"><span>Last 10 matches</span><b>30%</b></div>
      <div class="weight-row"><span>Overall performance</span><b>20%</b></div>
      <div class="weight-row"><span>Competitive tolerance</span><b>±5%</b></div>
      <div class="weight-row"><span>Minimum matches to begin</span><b>5</b></div>
      <p class="muted">Scoring and checkout ability adapt independently. Settings are locked at the start of each match.</p>
    </section>`;
}

function render() {
  const content = state.page === "dashboard" ? dashboard()
    : state.page === "play" ? playSetup()
    : state.page === "match" ? matchPreview()
    : state.page === "ai" ? aiPage()
    : state.page === "training" ? simplePage("Training Centre", "Focused practice to sharpen your game.", "✣", "Your training games")
    : state.page === "stats" ? simplePage("Statistics", "Track your scoring, finishing and consistency.", "▥", "Your performance dashboard")
    : simplePage("Match History", "Every match, every leg and every improvement.", "◷", "Your match history");

  app.innerHTML = `
    <div class="app-shell">
      <header class="topbar">
        <button class="brand" data-action="dashboard"><span class="brand-mark">◎</span><span>DARTS <b>BOT</b><small>YOUR GAME. YOUR PROGRESS.</small></span></button>
        <button class="profile-button" aria-label="Profile">MB</button>
      </header>
      <main>${content}</main>
      <nav class="bottom-nav" aria-label="Main navigation">
        ${navItems.map(([page, icon, label]) => `<button class="${state.page === page ? "current" : ""}" data-action="${page}"><span>${icon}</span><small>${label}</small></button>`).join("")}
      </nav>
      <footer> DARTS BOT <span>·</span> BUILDING YOUR GAME, ONE VISIT AT A TIME </footer>
    </div>`;

  app.querySelectorAll("[data-action]").forEach(el => el.addEventListener("click", () => {
    const action = el.dataset.action;
    if (action === "start-match") { state.matchStarted = true; setPage("match"); }
    else if (action === "back-setup") setPage("play");
    else setPage(action);
  }));
  app.querySelectorAll("[data-opponent]").forEach(el => el.addEventListener("click", () => {
    state.opponent = el.dataset.opponent; render();
  }));
  app.querySelectorAll("[data-level]").forEach(el => el.addEventListener("click", () => {
    state.level = Number(el.dataset.level); render();
  }));
  app.querySelectorAll("[data-game]").forEach(el => el.addEventListener("click", () => {
    state.game = Number(el.dataset.game); render();
  }));
  app.querySelectorAll("[data-legs]").forEach(el => el.addEventListener("click", () => {
    state.legs = Number(el.dataset.legs); render();
  }));
}

render();
