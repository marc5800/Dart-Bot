/**
 * Darts Bot scoring engine — first implementation
 * Pure JavaScript, no framework or storage dependency.
 *
 * A dart is { score: number, isDouble?: boolean, isBull?: boolean }.
 * score is the points scored by that dart (0–60).
 */

export const BOT_LEVELS = Object.freeze({
  1: { averageMin: 55, averageMax: 64, checkoutRate: 0.15 },
  2: { averageMin: 65, averageMax: 74, checkoutRate: 0.22 },
  3: { averageMin: 75, averageMax: 84, checkoutRate: 0.30 },
  4: { averageMin: 85, averageMax: 94, checkoutRate: 0.38 },
  5: { averageMin: 95, averageMax: 104, checkoutRate: 0.46 },
});

export function createLeg(startingScore = 501, rules = {}) {
  if (!Number.isInteger(startingScore) || startingScore < 2) {
    throw new Error("Starting score must be an integer of at least 2.");
  }
  return {
    startingScore,
    remaining: startingScore,
    dartsThrown: 0,
    pointsScored: 0,
    visits: [],
    finished: false,
    busted: false,
    doubleIn: Boolean(rules.doubleIn),
    doubleOut: rules.doubleOut !== false,
    opened: !rules.doubleIn,
  };
}

function validateDart(dart) {
  if (!dart || !Number.isInteger(dart.score) || dart.score < 0 || dart.score > 60) {
    throw new Error("Each dart must have an integer score from 0 to 60.");
  }
}

export function applyVisit(leg, darts) {
  if (leg.finished) throw new Error("This leg has already finished.");
  if (!Array.isArray(darts) || darts.length < 1 || darts.length > 3) {
    throw new Error("A visit must contain between one and three darts.");
  }
  darts.forEach(validateDart);

  const before = leg.remaining;
  let remaining = before;
  let opened = leg.opened;
  let countedDarts = 0;
  let countedPoints = 0;
  let bustReason = null;
  let checkout = false;

  for (let i = 0; i < darts.length; i++) {
    const dart = darts[i];
    countedDarts += 1;

    if (!opened && (dart.isDouble || dart.isBull)) {
      opened = true;
    }

    if (!opened) continue;

    remaining -= dart.score;
    countedPoints += dart.score;

    if (remaining < 0) {
      bustReason = "score_below_zero";
      break;
    }

    if (remaining === 1 && leg.doubleOut) {
      bustReason = "leave_one";
      break;
    }

    if (remaining === 0) {
      if (leg.doubleOut && !(dart.isDouble || dart.isBull)) {
        bustReason = "finish_not_on_double";
      } else {
        checkout = true;
      }
      break;
    }
  }

  // Bust restores the score to the start of the visit. Darts thrown still count.
  const isBust = Boolean(bustReason);
  const after = isBust ? before : remaining;
  const pointsForVisit = isBust ? 0 : countedPoints;

  const visit = {
    before,
    after,
    darts: darts.slice(0, countedDarts).map(d => ({ ...d })),
    dartsThrown: countedDarts,
    pointsScored: pointsForVisit,
    rawPoints: countedPoints,
    bust: isBust,
    bustReason,
    checkout: !isBust && checkout,
  };

  return {
    ...leg,
    remaining: after,
    dartsThrown: leg.dartsThrown + countedDarts,
    pointsScored: leg.pointsScored + pointsForVisit,
    visits: [...leg.visits, visit],
    finished: !isBust && checkout,
    busted: isBust,
    opened,
  };
}

export function undoVisit(leg) {
  if (!leg.visits.length) return leg;
  const visits = leg.visits.slice(0, -1);
  const dartsThrown = visits.reduce((n, v) => n + v.dartsThrown, 0);
  const pointsScored = visits.reduce((n, v) => n + v.pointsScored, 0);
  const last = visits[visits.length - 1];
  return {
    ...leg,
    remaining: last ? last.after : leg.startingScore,
    dartsThrown,
    pointsScored,
    visits,
    finished: Boolean(last?.checkout),
    busted: Boolean(last?.bust),
    opened: leg.doubleIn ? visits.some(v => v.darts.some(d => d.isDouble || d.isBull)) : true,
  };
}

export function threeDartAverage(leg) {
  return leg.dartsThrown ? (leg.pointsScored / leg.dartsThrown) * 3 : 0;
}

export function firstNineAverage(leg) {
  const firstNine = leg.visits.flatMap(v =>
    v.darts.map(d => ({ score: v.bust ? 0 : d.score }))
  ).slice(0, 9);
  if (!firstNine.length) return 0;
  const points = firstNine.reduce((sum, d) => sum + d.score, 0);
  return (points / firstNine.length) * 3;
}

export function summariseLeg(leg) {
  const successfulVisits = leg.visits.filter(v => !v.bust);
  const checkoutVisits = leg.visits.filter(v => v.checkout);
  const highestVisit = Math.max(0, ...successfulVisits.map(v => v.pointsScored));
  return {
    remaining: leg.remaining,
    dartsThrown: leg.dartsThrown,
    pointsScored: leg.pointsScored,
    threeDartAverage: threeDartAverage(leg),
    highestVisit,
    visits: leg.visits.length,
    busts: leg.visits.filter(v => v.bust).length,
    finished: leg.finished,
    checkout: checkoutVisits.length > 0,
  };
}

/**
 * Generates a plausible bot visit total with natural variation.
 * This is a first-pass distribution model, not yet a trained statistical model.
 * Pass a seeded/custom rng for reproducible tests.
 */
export function generateBotVisit({ level = 3, remaining = 501, rng = Math.random, checkoutRate } = {}) {
  const profile = BOT_LEVELS[level];
  if (!profile) throw new Error("Bot level must be from 1 to 5.");
  const targetAverage = (profile.averageMin + profile.averageMax) / 2;
  const average = targetAverage + (rng() - 0.5) * 8;
  const volatility = 22 + level * 2.5;

  let total = 0;
  for (let i = 0; i < 3; i++) {
    // Normal-like variation from summed uniform samples.
    let noise = 0;
    for (let j = 0; j < 4; j++) noise += rng();
    noise -= 2;
    const dart = Math.max(0, Math.min(60, Math.round(average / 3 + noise * volatility / 4)));
    total += dart;
  }

  // Occasional low and high visits keep the bot from scoring mechanically.
  const event = rng();
  if (event < 0.07) total = Math.round(total * 0.35);
  else if (event > 0.965) total = Math.min(180, total + 45);

  total = Math.max(0, Math.min(180, total));
  const configuredCheckout = checkoutRate ?? profile.checkoutRate;

  return {
    score: total,
    dartsThrown: 3,
    checkoutRate: configuredCheckout,
    targetAverage: Number(targetAverage.toFixed(1)),
  };
}

export function createMatch({ game = 501, legsToWin = 3, opponent = { type: "standard", level: 3 } } = {}) {
  if (![301, 501].includes(game)) throw new Error("Game must be 301 or 501.");
  if (!Number.isInteger(legsToWin) || legsToWin < 1) throw new Error("legsToWin must be a positive integer.");
  if (opponent.type === "standard" && !BOT_LEVELS[opponent.level]) throw new Error("Invalid bot level.");
  return {
    game,
    legsToWin,
    opponent: structuredClone(opponent),
    status: "in_progress",
    currentLeg: createLeg(game, { doubleOut: true }),
    playerLegs: 0,
    botLegs: 0,
    completedLegs: [],
  };
}
