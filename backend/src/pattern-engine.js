import { randomUUID } from "node:crypto";

export const COORD = {
  1: [0, 0], 2: [1, 0], 3: [2, 0],
  4: [0, 1], 5: [1, 1], 6: [2, 1],
  7: [0, 2], 8: [1, 2], 9: [2, 2]
};

export const TOTAL_STAGES = 30;
export const CHECKPOINT_RULES = {
  10: {
    code: "REVERSE",
    label: "REVERSE",
    instruction: "Enter the pattern in reverse."
  },
  20: {
    code: "ECHO",
    label: "ECHO x2",
    instruction: "Repeat the pattern twice."
  },
  30: {
    code: "REVERSE_FORWARD",
    label: "REVERSE -> FORWARD",
    instruction: "Enter reverse first, then forward."
  }
};

export const TIERS = [
  { name: "BRONZE", short: "BR", min: 1, max: 25, stageFrom: 1, color: "#b8875f" },
  { name: "SILVER", short: "SV", min: 26, max: 45, stageFrom: 6, color: "#b8c7d6" },
  { name: "GOLD", short: "GD", min: 46, max: 65, stageFrom: 11, color: "#ffd166" },
  { name: "DIAMOND", short: "DM", min: 66, max: 82, stageFrom: 18, color: "#3df7ff" },
  { name: "MASTER", short: "MS", min: 83, max: 100, stageFrom: 26, color: "#ff4cfa" }
];

const idFromCoord = new Map(Object.entries(COORD).map(([id, value]) => [value.join(","), Number(id)]));
const MAX_COMPLEXITY_BASES = [
  [1, 2, 3, 6, 9, 8, 7, 4, 5]
];
let maxComplexityCache = null;

export function createRng(seedText = randomUUID()) {
  const seedBuilder = xmur3(seedText);
  return mulberry32(seedBuilder());
}

function xmur3(text) {
  let hash = 1779033703 ^ text.length;
  for (let index = 0; index < text.length; index += 1) {
    hash = Math.imul(hash ^ text.charCodeAt(index), 3432918353);
    hash = (hash << 13) | (hash >>> 19);
  }
  return () => {
    hash = Math.imul(hash ^ (hash >>> 16), 2246822507);
    hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
    return (hash ^= hash >>> 16) >>> 0;
  };
}

function mulberry32(seed) {
  return () => {
    let value = seed += 0x6d2b79f5;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function randomInt(rng, min, max) {
  return min + Math.floor(rng() * ((max - min) + 1));
}

function gcd(a, b) {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) {
    [a, b] = [b, a % b];
  }
  return a || 1;
}

function normalizedSlope(a, b) {
  const [x1, y1] = COORD[a];
  const [x2, y2] = COORD[b];
  let dx = x2 - x1;
  let dy = y2 - y1;
  const divisor = gcd(dx, dy);
  dx /= divisor;
  dy /= divisor;
  return `${dx},${dy}`;
}

function blockerBetween(a, b) {
  const [x1, y1] = COORD[a];
  const [x2, y2] = COORD[b];
  const dx = x2 - x1;
  const dy = y2 - y1;
  const divisor = gcd(dx, dy);

  if (divisor <= 1) {
    return null;
  }

  const stepX = dx / divisor;
  const stepY = dy / divisor;
  const blockers = [];

  for (let index = 1; index < divisor; index += 1) {
    const id = idFromCoord.get(`${x1 + stepX * index},${y1 + stepY * index}`);
    if (id) blockers.push(id);
  }

  return blockers.length ? blockers : null;
}

function isLegalMove(a, b, used) {
  if (a === b || used.has(b)) return false;
  const blockers = blockerBetween(a, b);
  if (!blockers) return true;
  return blockers.every((id) => used.has(id));
}

function shuffle(values, rng) {
  const cloned = values.slice();
  for (let index = cloned.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [cloned[index], cloned[swapIndex]] = [cloned[swapIndex], cloned[index]];
  }
  return cloned;
}

function legalNexts(last, used, rng) {
  const result = [];
  for (let id = 1; id <= 9; id += 1) {
    if (!used.has(id) && (!last || isLegalMove(last, id, used))) {
      result.push(id);
    }
  }
  return shuffle(result, rng);
}

export function uniqueSlopeCount(pattern) {
  const slopes = new Set();
  for (let index = 1; index < pattern.length; index += 1) {
    slopes.add(normalizedSlope(pattern[index - 1], pattern[index]));
  }
  return slopes.size;
}

function buildSymmetryMaps() {
  const transforms = [
    (x, y) => [x, y],
    (x, y) => [2 - y, x],
    (x, y) => [2 - x, 2 - y],
    (x, y) => [y, 2 - x],
    (x, y) => [2 - x, y],
    (x, y) => [y, x],
    (x, y) => [x, 2 - y],
    (x, y) => [2 - y, 2 - x]
  ];

  return transforms.map((transform) => {
    const map = {};
    for (let id = 1; id <= 9; id += 1) {
      const [x, y] = COORD[id];
      const [mappedX, mappedY] = transform(x, y);
      map[id] = idFromCoord.get(`${mappedX},${mappedY}`);
    }
    return map;
  });
}

const SYMMETRY_MAPS = buildSymmetryMaps();

function generateLegalPattern(length, preferUniqueSlopes, rng) {
  let bestCandidate = null;
  let bestScore = -999;

  for (let attempt = 0; attempt < 220; attempt += 1) {
    const start = 1 + Math.floor(rng() * 9);
    const used = new Set([start]);
    const pattern = [start];
    const slopes = new Set();

    function dfs() {
      if (pattern.length === length) return true;
      const nexts = legalNexts(pattern[pattern.length - 1], used, rng);

      if (preferUniqueSlopes) {
        nexts.sort((left, right) => {
          const leftSlope = normalizedSlope(pattern[pattern.length - 1], left);
          const rightSlope = normalizedSlope(pattern[pattern.length - 1], right);
          return Number(slopes.has(leftSlope)) - Number(slopes.has(rightSlope)) || (rng() - 0.5);
        });
      }

      for (const next of nexts) {
        const slope = normalizedSlope(pattern[pattern.length - 1], next);
        const hadSlope = slopes.has(slope);
        used.add(next);
        pattern.push(next);
        slopes.add(slope);

        if (dfs()) return true;

        if (!hadSlope) slopes.delete(slope);
        pattern.pop();
        used.delete(next);
      }

      return false;
    }

    if (dfs()) {
      const score = (uniqueSlopeCount(pattern) * 10) + pattern.length + (new Set(pattern).size);
      if (score > bestScore) {
        bestScore = score;
        bestCandidate = pattern.slice();
      }
      if (!preferUniqueSlopes || uniqueSlopeCount(pattern) >= Math.min(8, length - 1)) {
        return pattern;
      }
    }
  }

  return bestCandidate || [1, 2, 3, 6];
}

function expandMaxComplexityCache() {
  if (maxComplexityCache) {
    return maxComplexityCache;
  }

  const results = [];
  const seen = new Set();

  for (const base of MAX_COMPLEXITY_BASES) {
    for (const map of SYMMETRY_MAPS) {
      const variant = base.map((id) => map[id]);
      const key = variant.join("-");
      const reverseKey = variant.slice().reverse().join("-");
      if (seen.has(key) || seen.has(reverseKey)) continue;
      seen.add(key);
      results.push(variant);
    }
  }

  maxComplexityCache = results;
  return results;
}

function generateMaxComplexity3x3(rng) {
  const cache = expandMaxComplexityCache();
  if (cache.length) {
    return cache[Math.floor(rng() * cache.length)].slice();
  }
  return generateLegalPattern(9, true, rng);
}

function segmentIntersect(a, b, c, d) {
  const A = COORD[a];
  const B = COORD[b];
  const C = COORD[c];
  const D = COORD[d];

  function orient(p, q, r) {
    return ((q[0] - p[0]) * (r[1] - p[1])) - ((q[1] - p[1]) * (r[0] - p[0]));
  }

  if (a === c || a === d || b === c || b === d) return false;
  const o1 = orient(A, B, C);
  const o2 = orient(A, B, D);
  const o3 = orient(C, D, A);
  const o4 = orient(C, D, B);
  return (o1 * o2 < 0) && (o3 * o4 < 0);
}

function angleTurnScore(prev, current, next) {
  const [x1, y1] = COORD[prev];
  const [x2, y2] = COORD[current];
  const [x3, y3] = COORD[next];
  const ax = x2 - x1;
  const ay = y2 - y1;
  const bx = x3 - x2;
  const by = y3 - y2;
  const leftLength = Math.hypot(ax, ay);
  const rightLength = Math.hypot(bx, by);

  if (!leftLength || !rightLength) return 0;

  const dot = Math.max(-1, Math.min(1, ((ax * bx) + (ay * by)) / (leftLength * rightLength)));
  const degrees = (Math.acos(dot) * 180) / Math.PI;

  if (degrees < 20) return 0;
  if (degrees < 70) return 3;
  if (degrees < 120) return 6;
  return 9;
}

function patternMetrics(pattern) {
  const slopes = new Set();
  let longMoves = 0;
  let knightMoves = 0;
  let turns = 0;
  let crossings = 0;
  let backtrack = 0;
  const centerEarly = pattern.indexOf(5) >= 0 && pattern.indexOf(5) <= 2 ? 1 : 0;

  for (let index = 1; index < pattern.length; index += 1) {
    const left = pattern[index - 1];
    const right = pattern[index];
    slopes.add(normalizedSlope(left, right));
    const [x1, y1] = COORD[left];
    const [x2, y2] = COORD[right];
    const dx = Math.abs(x2 - x1);
    const dy = Math.abs(y2 - y1);
    const distance = Math.hypot(dx, dy);
    if (distance >= 2) longMoves += 1;
    if ((dx === 1 && dy === 2) || (dx === 2 && dy === 1)) knightMoves += 1;
  }

  for (let index = 2; index < pattern.length; index += 1) {
    turns += angleTurnScore(pattern[index - 2], pattern[index - 1], pattern[index]);
    const firstSlope = normalizedSlope(pattern[index - 2], pattern[index - 1]).split(",").map(Number);
    const secondSlope = normalizedSlope(pattern[index - 1], pattern[index]).split(",").map(Number);
    if (firstSlope[0] === -secondSlope[0] && firstSlope[1] === -secondSlope[1]) {
      backtrack += 1;
    }
  }

  for (let leftIndex = 1; leftIndex < pattern.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 2; rightIndex < pattern.length; rightIndex += 1) {
      if (segmentIntersect(pattern[leftIndex - 1], pattern[leftIndex], pattern[rightIndex - 1], pattern[rightIndex])) {
        crossings += 1;
      }
    }
  }

  return {
    length: pattern.length,
    slopes: slopes.size,
    longMoves,
    knightMoves,
    turns,
    crossings,
    centerEarly,
    backtrack
  };
}

export function difficultyScore(pattern) {
  const metrics = patternMetrics(pattern);
  let score = 0;
  score += metrics.length * 6;
  score += metrics.slopes * 7;
  score += metrics.longMoves * 6;
  score += metrics.knightMoves * 5;
  score += metrics.turns;
  score += metrics.crossings * 12;
  score += metrics.backtrack * 5;
  score -= metrics.centerEarly * 6;
  return Math.max(1, Math.min(100, Math.round(score)));
}

export function tierForStage(stage) {
  let selected = TIERS[0];
  for (const tier of TIERS) {
    if (stage >= tier.stageFrom) {
      selected = tier;
    }
  }
  return selected;
}

export function tierByName(name) {
  return TIERS.find((tier) => tier.name === name) || TIERS[0];
}

export function checkpointRuleForStage(stage) {
  const rule = CHECKPOINT_RULES[stage];
  return rule ? { ...rule } : null;
}

export function isCheckpointStage(stage) {
  return Boolean(CHECKPOINT_RULES[stage]);
}

export function effectivePatternStage(stage) {
  return isCheckpointStage(stage) ? Math.max(1, stage - 1) : stage;
}

export function tierProgress(tier, stage) {
  const tierIndex = TIERS.indexOf(tier);
  const nextTier = TIERS[tierIndex + 1];
  const start = tier.stageFrom;
  const end = nextTier ? nextTier.stageFrom : start + 5;
  const span = Math.max(1, end - start);
  return Math.max(0, Math.min(1, (stage - start) / span));
}

export function tierTargetRange(tier, stage) {
  const span = tier.max - tier.min;
  const progress = tierProgress(tier, stage);
  const eased = progress * progress * (3 - (2 * progress));
  const minimum = tier.min + (span * eased * 0.30);
  const maximum = tier.min + (span * (0.55 + (eased * 0.45)));

  return {
    min: Math.round(minimum),
    max: Math.round(Math.min(tier.max, maximum))
  };
}

function patternKey(pattern) {
  return pattern.join("-");
}

function reversePatternKey(pattern) {
  return pattern.slice().reverse().join("-");
}

function patternSimilarity(left, right) {
  if (!left?.length || !right?.length) return 0;

  const maxLength = Math.max(left.length, right.length);
  let samePosition = 0;
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    if (left[index] === right[index]) samePosition += 1;
  }

  const edges = new Set();
  for (let index = 1; index < left.length; index += 1) {
    edges.add(`${left[index - 1]}-${left[index]}`);
  }

  let sameEdges = 0;
  for (let index = 1; index < right.length; index += 1) {
    if (edges.has(`${right[index - 1]}-${right[index]}`)) {
      sameEdges += 1;
    }
  }

  return ((samePosition / maxLength) * 0.58) + ((sameEdges / Math.max(1, maxLength - 1)) * 0.42);
}

function isRecentlyUsedPattern(candidate, recentPatterns) {
  const key = patternKey(candidate);
  const reverse = reversePatternKey(candidate);

  for (const recent of recentPatterns) {
    if (recent.key === key || recent.key === reverse) return true;
    if (recent.length === candidate.length && patternSimilarity(recent.pattern, candidate) >= 0.72) return true;
  }

  return false;
}

function tierLengthRange(tierName) {
  if (tierName === "BRONZE") return [4, 5];
  if (tierName === "SILVER") return [5, 7];
  if (tierName === "GOLD") return [6, 9];
  return [8, 9];
}

export function buildRecentPatternState(rows) {
  return (rows || []).flatMap((row) => {
    try {
      const pattern = JSON.parse(row.pattern_json);
      if (!Array.isArray(pattern) || !pattern.length) return [];
      return [{
        key: patternKey(pattern),
        pattern,
        length: pattern.length
      }];
    } catch (error) {
      return [];
    }
  });
}

export function generateTierPattern(tier, recentPatterns = [], rng = createRng(), stage = tier.stageFrom) {
  let bestCandidate = null;
  let bestGap = Number.POSITIVE_INFINITY;
  let bestNovelty = Number.NEGATIVE_INFINITY;
  const [minLength, maxLength] = tierLengthRange(tier.name);
  const { min: targetMin, max: targetMax } = tierTargetRange(tier, stage);
  const progress = tierProgress(tier, stage);
  const lengthBias = Math.round(progress * (maxLength - minLength) * 0.4);
  const effectiveMinLength = Math.min(maxLength, minLength + lengthBias);
  const attempts = tier.name === "MASTER" ? 240 : 760;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    let candidate;
    if (tier.name === "MASTER" && attempt % 3 === 0) {
      candidate = generateMaxComplexity3x3(rng);
    } else {
      const length = randomInt(rng, effectiveMinLength, maxLength);
      candidate = generateLegalPattern(length, tier.name !== "BRONZE", rng);
    }

    const difficulty = difficultyScore(candidate);
    const gap = difficulty < targetMin ? targetMin - difficulty : difficulty > targetMax ? difficulty - targetMax : 0;
    const duplicate = isRecentlyUsedPattern(candidate, recentPatterns);

    if (!duplicate && gap === 0) {
      return { pattern: candidate, difficulty };
    }

    let maxSimilarity = 0;
    for (const recent of recentPatterns) {
      if (recent.length === candidate.length) {
        maxSimilarity = Math.max(maxSimilarity, patternSimilarity(recent.pattern, candidate));
      }
    }

    const novelty = 1 - maxSimilarity;
    const rank = (novelty * 100) - (gap * 3) - (duplicate ? 80 : 0);

    if (rank > bestNovelty || (rank === bestNovelty && gap < bestGap)) {
      bestNovelty = rank;
      bestGap = gap;
      bestCandidate = { pattern: candidate, difficulty };
    }
  }

  if (bestCandidate) {
    return bestCandidate;
  }

  const fallbackPattern = generateLegalPattern(effectiveMinLength, false, rng);
  return {
    pattern: fallbackPattern,
    difficulty: difficultyScore(fallbackPattern)
  };
}

export function computeDisplayTimeMs(stage) {
  return Math.max(165, 570 - (stage * 24));
}

export function computeInputLimitSec(stage, patternLength, mode) {
  if (mode === "ZEN") return 0;
  return Math.max(4.2, 9.5 - (stage * 0.18) + (patternLength * 0.18));
}

export function computeAwardedScore({ stage, comboAfter, pattern, difficulty }) {
  return (
    (100 * stage) +
    (comboAfter * 25) +
    (pattern.length * 40) +
    (difficulty * 8) +
    (uniqueSlopeCount(pattern) * 35)
  );
}

export function minimumElapsedMs(pattern, difficulty) {
  return Math.max(450, (pattern.length * 90) + (difficulty * 3));
}

export function expectedSegmentsForPattern(pattern, stage) {
  const basePattern = pattern.slice();
  const rule = checkpointRuleForStage(stage);

  if (!rule) {
    return [basePattern];
  }

  if (rule.code === "REVERSE") {
    return [basePattern.slice().reverse()];
  }

  if (rule.code === "ECHO") {
    return [basePattern.slice(), basePattern.slice()];
  }

  if (rule.code === "REVERSE_FORWARD") {
    return [basePattern.slice().reverse(), basePattern.slice()];
  }

  return [basePattern];
}

export function expectedInputPatternForStage(pattern, stage) {
  return expectedSegmentsForPattern(pattern, stage).flat();
}

export function buildStageSession({ stage, mode, recentPatterns = [], rng = createRng() }) {
  const patternStage = effectivePatternStage(stage);
  const tier = tierForStage(patternStage);
  const generated = generateTierPattern(tier, recentPatterns, rng, patternStage);
  const expectedInputPattern = expectedInputPatternForStage(generated.pattern, stage);

  return {
    stage,
    tier: tier.name,
    checkpointRule: checkpointRuleForStage(stage),
    difficulty: generated.difficulty,
    pattern: generated.pattern,
    displayTimeMs: computeDisplayTimeMs(patternStage),
    inputLimitSec: computeInputLimitSec(patternStage, expectedInputPattern.length, mode)
  };
}

export function buildDailyChallenge(dateText) {
  const challengePlan = [
    { stage: 1, tier: "BRONZE" },
    { stage: 2, tier: "SILVER" },
    { stage: 3, tier: "GOLD" },
    { stage: 4, tier: "DIAMOND" },
    { stage: 5, tier: "MASTER" }
  ];

  const history = [];
  const patterns = challengePlan.map((entry) => {
    const rng = createRng(`${dateText}:${entry.stage}:${entry.tier}`);
    const tier = tierByName(entry.tier);
    const generated = generateTierPattern(tier, history, rng, tier.stageFrom);
    history.push({
      key: patternKey(generated.pattern),
      pattern: generated.pattern,
      length: generated.pattern.length
    });

    return {
      stage: entry.stage,
      tier: entry.tier,
      difficulty: generated.difficulty,
      pattern: generated.pattern
    };
  });

  return {
    date: dateText,
    patterns
  };
}
