import test from "node:test";
import assert from "node:assert/strict";
import {
  BOT_LEVELS, createLeg, applyVisit, undoVisit, threeDartAverage,
  summariseLeg, generateBotVisit, createMatch
} from "./engine.js";

test("official bot level bands and checkout defaults", () => {
  assert.deepEqual(BOT_LEVELS[3], { averageMin: 75, averageMax: 84, peakDarts: 18, normalMaxDarts: 22 });
  assert.equal(BOT_LEVELS[5].averageMax, 104);
  assert.equal(BOT_LEVELS[1].peakDarts, 25);
  assert.equal(BOT_LEVELS[5].normalMaxDarts, 17);
});

test("ordinary visit reduces score and counts actual darts", () => {
  let leg = createLeg(501);
  leg = applyVisit(leg, [{score:60},{score:20},{score:5}]);
  assert.equal(leg.remaining, 416);
  assert.equal(leg.dartsThrown, 3);
  assert.equal(threeDartAverage(leg), 85);
});

test("bust below zero restores visit score but counts darts", () => {
  let leg = createLeg(40);
  leg = applyVisit(leg, [{score:10},{score:10},{score:21}]);
  assert.equal(leg.remaining, 40);
  assert.equal(leg.pointsScored, 0);
  assert.equal(leg.dartsThrown, 3);
  assert.equal(leg.visits[0].bustReason, "score_below_zero");
});

test("double-out leaves one is a bust", () => {
  let leg = applyVisit(createLeg(3), [{score:2},{score:0},{score:0}]);
  assert.equal(leg.remaining, 3);
  assert.equal(leg.visits[0].bustReason, "leave_one");
});

test("double-out requires final dart to be a double", () => {
  let leg = applyVisit(createLeg(20), [{score:20}]);
  assert.equal(leg.remaining, 20);
  assert.equal(leg.visits[0].bustReason, "finish_not_on_double");
});

test("double-out checkout succeeds on a double", () => {
  let leg = applyVisit(createLeg(40), [{score:8},{score:16},{score:16,isDouble:true}]);
  assert.equal(leg.remaining, 0);
  assert.equal(leg.finished, true);
  assert.equal(leg.dartsThrown, 3);
});

test("double-in requires a double before scoring", () => {
  let leg = createLeg(40, {doubleIn:true, doubleOut:true});
  leg = applyVisit(leg, [{score:20},{score:10},{score:10,isDouble:true}]);
  assert.equal(leg.opened, true);
  assert.equal(leg.remaining, 30);
});

test("undo restores prior visit state", () => {
  let leg = createLeg(501);
  leg = applyVisit(leg, [{score:60},{score:60},{score:60}]);
  leg = undoVisit(leg);
  assert.equal(leg.remaining, 501);
  assert.equal(leg.dartsThrown, 0);
});

test("match validates setup and snapshots opponent", () => {
  const match = createMatch({game:501, legsToWin:3, opponent:{type:"standard",level:3}});
  assert.equal(match.currentLeg.remaining, 501);
  assert.equal(match.opponent.level, 3);
});

test("bot visit returns a legal visit score", () => {
  const result = generateBotVisit({level:3, rng:()=>0.5});
  assert.ok(result.score >= 0 && result.score <= 180);
  assert.ok(Array.isArray(result.darts));
  assert.ok(result.darts.length >= 1 && result.darts.length <= 3);
  assert.equal(result.dartsThrown, result.darts.length);
  assert.equal(result.dartsThrown, 3);
});


test("bot visits contain individual dart outcomes, not synthetic totals", () => {
  let seed = 12345;
  const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const result = generateBotVisit({ level: 3, remaining: 501, rng });
  assert.ok(result.darts.length >= 1 && result.darts.length <= 3);
  assert.equal(result.dartsThrown, result.darts.length);
  for (const dart of result.darts) {
    assert.ok(Number.isInteger(dart.score));
    assert.ok(dart.score >= 0 && dart.score <= 60);
  }
});

test("bot difficulty profiles include agreed 501 finishing targets", () => {
  assert.deepEqual(
    Object.fromEntries(Object.entries(BOT_LEVELS).map(([level, p]) => [level, [p.peakDarts, p.normalMaxDarts]])),
    { 1: [25, 30], 2: [21, 26], 3: [18, 22], 4: [16, 18], 5: [15, 17] }
  );
});
