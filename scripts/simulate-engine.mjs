import { generateBotVisit, BOT_LEVELS } from "../engine.js";

const game = Number(process.argv[2] || 501);
const runs = Number(process.argv[3] || 20000);
if (![301, 501].includes(game)) throw new Error("Game must be 301 or 501.");
if (!Number.isInteger(runs) || runs < 1) throw new Error("Runs must be a positive integer.");

function makeRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

for (let level = 1; level <= 5; level++) {
  const rng = makeRng(0xD47A0000 + game * 100 + level);
  const distribution = new Map();
  let totalDarts = 0, busts = 0, unfinished = 0, longest = 0;
  for (let i = 0; i < runs; i++) {
    let remaining = game, darts = 0, visits = 0;
    while (remaining > 0 && darts < 180 && visits < 100) {
      const visit = generateBotVisit({ level, remaining, game, rng });
      darts += visit.dartsThrown;
      visits++;
      if (visit.bust) busts++;
      else remaining -= visit.score;
      if (visit.checkout) remaining = 0;
    }
    if (remaining > 0) { unfinished++; continue; }
    totalDarts += darts;
    longest = Math.max(longest, darts);
    distribution.set(darts, (distribution.get(darts) || 0) + 1);
  }
  const ranked = [...distribution.entries()].sort((a, b) => b[1] - a[1]);
  const peak = ranked[0]?.[0] ?? null;
  const normalMax = BOT_LEVELS[level].normalMaxDarts;
  const withinNormalMax = game === 501
    ? [...distribution].filter(([d]) => d <= normalMax).reduce((sum, [, count]) => sum + count, 0)
    : null;
  console.log(JSON.stringify({
    game, level, runs, threeDartAverage: Number((3 * game * (runs - unfinished) / totalDarts).toFixed(2)),
    meanDarts: Number((totalDarts / (runs - unfinished)).toFixed(2)),
    peakDarts: peak, peakSharePct: Number((100 * (ranked[0]?.[1] || 0) / runs).toFixed(1)),
    withinNormalMaxPct: withinNormalMax === null ? null : Number((100 * withinNormalMax / runs).toFixed(1)),
    bustsPerLeg: Number((busts / runs).toFixed(2)), unfinished
  }));
}
