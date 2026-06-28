import path from "node:path";
import { randomUUID } from "node:crypto";
import express from "express";
import { fileURLToPath, pathToFileURL } from "node:url";
import { db, dbFile } from "./db.js";
import {
  buildDailyChallenge,
  buildRecentPatternState,
  buildStageSession,
  computeAwardedScore,
  minimumElapsedMs
} from "./pattern-engine.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..", "..");
const frontendDir = path.resolve(projectRoot, "frontend");

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";

const app = express();

app.disable("x-powered-by");
app.use(express.json({ limit: "256kb" }));
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", CORS_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  next();
});

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    dbFile,
    now: new Date().toISOString()
  });
});

app.post("/api/pattern", route((req, res) => {
  const body = req.body || {};
  const stage = toPositiveInteger(body.stage, "stage");
  const mode = normalizeMode(body.mode);
  const clientId = normalizeClientId(body.clientId);
  const providedRunId = typeof body.runId === "string" && body.runId.trim() ? body.runId.trim() : null;
  const createdAt = new Date().toISOString();

  let runId = providedRunId;
  let scoreBefore = 0;
  let comboBefore = 0;

  if (stage === 1) {
    runId = randomUUID();
  } else if (mode === "DOUBT" && stage > 1) {
    if (!runId) {
      throw httpError(400, "runId is required for ranked stages after stage 1");
    }

    const previousSession = db.prepare(`
      SELECT stage, score_after, combo_after
      FROM sessions
      WHERE run_id = ? AND client_id = ? AND mode = 'DOUBT' AND score_submitted = 1
      ORDER BY stage DESC
      LIMIT 1
    `).get(runId, clientId);

    if (!previousSession || Number(previousSession.stage) !== stage - 1) {
      throw httpError(409, "The ranked run is out of sync. Start a new run from stage 1.");
    }

    scoreBefore = Number(previousSession.score_after || 0);
    comboBefore = Number(previousSession.combo_after || 0);
  } else if (!runId) {
    runId = randomUUID();
  }

  const recentRows = db.prepare(`
    SELECT pattern_json
    FROM sessions
    WHERE mode = ?
    ORDER BY created_at DESC
    LIMIT 40
  `).all(mode);

  const session = buildStageSession({
    stage,
    mode,
    recentPatterns: buildRecentPatternState(recentRows)
  });

  const sessionId = randomUUID();

  db.prepare(`
    INSERT INTO sessions (
      id, run_id, client_id, stage, mode, tier, difficulty, pattern_json,
      display_time_ms, input_limit_sec, score_before, combo_before, score_submitted, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
  `).run(
    sessionId,
    runId,
    clientId,
    stage,
    mode,
    session.tier,
    session.difficulty,
    JSON.stringify(session.pattern),
    session.displayTimeMs,
    session.inputLimitSec,
    scoreBefore,
    comboBefore,
    createdAt
  );

  res.status(200).json({
    sessionId,
    runId,
    stage,
    tier: session.tier,
    difficulty: session.difficulty,
    pattern: session.pattern,
    displayTimeMs: session.displayTimeMs,
    inputLimitSec: session.inputLimitSec,
    createdAt
  });
}));

app.post("/api/score/submit", route((req, res) => {
  const body = req.body || {};
  const sessionId = requireText(body.sessionId, "sessionId");
  const runId = typeof body.runId === "string" ? body.runId.trim() : "";
  const clientId = normalizeClientId(body.clientId);
  const stage = toPositiveInteger(body.stage, "stage");
  const expectedScore = toNonNegativeInteger(body.score, "score");
  const expectedCombo = toPositiveInteger(body.combo, "combo");
  const success = body.success === true;
  const elapsedMs = toPositiveInteger(body.elapsedMs, "elapsedMs");
  const inputPattern = normalizePattern(body.inputPattern);

  if (!success) {
    throw httpError(400, "Only successful ranked stage submissions are accepted.");
  }

  const session = db.prepare(`
    SELECT *
    FROM sessions
    WHERE id = ?
    LIMIT 1
  `).get(sessionId);

  if (!session) {
    throw httpError(404, "Session not found.");
  }

  if (session.mode !== "DOUBT") {
    throw httpError(400, "Score submission is only available for DOUBT mode.");
  }

  if (session.client_id !== clientId) {
    throw httpError(403, "clientId does not match the session owner.");
  }

  if (runId && session.run_id !== runId) {
    throw httpError(409, "runId does not match this session.");
  }

  if (Number(session.score_submitted) === 1) {
    throw httpError(409, "This session has already been submitted.");
  }

  if (Number(session.stage) !== stage) {
    throw httpError(409, "Stage does not match the stored session.");
  }

  const storedPattern = normalizePattern(JSON.parse(session.pattern_json));
  if (!patternsEqual(storedPattern, inputPattern)) {
    throw httpError(422, "Submitted inputPattern does not match the generated pattern.");
  }

  const minimumMs = minimumElapsedMs(storedPattern, Number(session.difficulty));
  if (elapsedMs < minimumMs) {
    throw httpError(422, `elapsedMs is too short for validation. Minimum accepted: ${minimumMs}.`);
  }

  const flawlessCombo = Number(session.combo_before) + 1;
  const comboAfter = expectedCombo;
  const isValidCombo = comboAfter === 1 || comboAfter === flawlessCombo;

  if (!isValidCombo) {
    throw httpError(422, "Combo progression does not match the server state.");
  }

  const awardedScore = computeAwardedScore({
    stage: Number(session.stage),
    comboAfter,
    pattern: storedPattern,
    difficulty: Number(session.difficulty)
  });
  const scoreAfter = Number(session.score_before) + awardedScore;

  if (expectedScore !== scoreAfter) {
    throw httpError(422, "Score does not match the server-calculated total.");
  }

  submitScoreTransaction({
    sessionId,
    awardedScore,
    scoreAfter,
    comboAfter
  });

  const rankRow = db.prepare(`
    SELECT COUNT(*) + 1 AS rank
    FROM leaderboard_entries
    WHERE mode = ?
      AND (score > ? OR (score = ? AND stage > ?))
  `).get(session.mode, scoreAfter, scoreAfter, Number(session.stage));

  res.status(200).json({
    accepted: true,
    rank: Number(rankRow?.rank || 1),
    score: scoreAfter,
    awardedScore,
    combo: comboAfter
  });
}));

app.post("/api/run/finalize", route((req, res) => {
  const body = req.body || {};
  const runId = requireText(body.runId, "runId");
  const clientId = normalizeClientId(body.clientId);
  const requestedPlayerName = normalizeOptionalPlayerName(body.playerName);

  const existingEntry = db.prepare(`
    SELECT *
    FROM leaderboard_entries
    WHERE run_id = ?
    LIMIT 1
  `).get(runId);

  if (existingEntry) {
    if (existingEntry.client_id !== clientId) {
      throw httpError(403, "clientId does not match the finalized run.");
    }

    if (requestedPlayerName && requestedPlayerName !== existingEntry.player_name) {
      db.prepare(`
        UPDATE leaderboard_entries
        SET player_name = ?, name_source = 'CUSTOM'
        WHERE run_id = ?
      `).run(requestedPlayerName, runId);

      existingEntry.player_name = requestedPlayerName;
      existingEntry.name_source = "CUSTOM";
    }

    const rankRow = db.prepare(`
      SELECT COUNT(*) + 1 AS rank
      FROM leaderboard_entries
      WHERE mode = ?
        AND (score > ? OR (score = ? AND stage > ?))
    `).get(existingEntry.mode, Number(existingEntry.score), Number(existingEntry.score), Number(existingEntry.stage));

    res.status(200).json({
      saved: true,
      rank: Number(rankRow?.rank || 1),
      name: existingEntry.player_name,
      score: Number(existingEntry.score),
      stage: Number(existingEntry.stage),
      tier: existingEntry.tier
    });
    return;
  }

  const latestSession = db.prepare(`
    SELECT id, stage, tier, combo_after, score_after
    FROM sessions
    WHERE run_id = ? AND client_id = ? AND mode = 'DOUBT' AND score_submitted = 1
    ORDER BY stage DESC
    LIMIT 1
  `).get(runId, clientId);

  if (!latestSession) {
    throw httpError(422, "No ranked score is available to save for this run.");
  }

  const createdAt = new Date().toISOString();
  const playerName = requestedPlayerName || anonymousPlayerNameForClient(clientId);
  const nameSource = requestedPlayerName ? "CUSTOM" : "ANON";

  db.prepare(`
    INSERT INTO leaderboard_entries (
      run_id, session_id, client_id, player_name, name_source, mode, score, stage, tier, combo, created_at
    )
    VALUES (?, ?, ?, ?, ?, 'DOUBT', ?, ?, ?, ?, ?)
  `).run(
    runId,
    latestSession.id,
    clientId,
    playerName,
    nameSource,
    Number(latestSession.score_after || 0),
    Number(latestSession.stage),
    latestSession.tier,
    Number(latestSession.combo_after || 0),
    createdAt
  );

  const rankRow = db.prepare(`
    SELECT COUNT(*) + 1 AS rank
    FROM leaderboard_entries
    WHERE mode = 'DOUBT'
      AND (score > ? OR (score = ? AND stage > ?))
  `).get(
    Number(latestSession.score_after || 0),
    Number(latestSession.score_after || 0),
    Number(latestSession.stage)
  );

  res.status(200).json({
    saved: true,
    rank: Number(rankRow?.rank || 1),
    name: playerName,
    score: Number(latestSession.score_after || 0),
    stage: Number(latestSession.stage),
    tier: latestSession.tier
  });
}));

app.get("/api/leaderboard", route((req, res) => {
  const mode = normalizeMode(req.query.mode || "DOUBT");
  const period = normalizePeriod(req.query.period || "daily");
  const limit = Math.min(50, Math.max(1, Number(req.query.limit || 10)));
  const params = [mode];
  let where = "WHERE mode = ?";

  const start = periodStart(period);
  if (start) {
    params.push(start);
    where += " AND created_at >= ?";
  }

  const query = `
    SELECT player_name, score, stage, tier, created_at
    FROM leaderboard_entries
    ${where}
    ORDER BY score DESC, stage DESC, created_at ASC
    LIMIT ${limit}
  `;

  const rows = db.prepare(query).all(...params);
  const items = rows.map((row, index) => ({
    rank: index + 1,
    name: row.player_name || "PLAYER",
    score: Number(row.score),
    stage: Number(row.stage),
    tier: row.tier,
    createdAt: row.created_at
  }));

  res.status(200).json({
    period,
    mode,
    items
  });
}));

app.get("/api/daily", route((req, res) => {
  const requestedDate = normalizeDateString(req.query.date) || currentUtcDate();
  const existing = db.prepare(`
    SELECT challenge_date, patterns_json
    FROM daily_challenges
    WHERE challenge_date = ?
    LIMIT 1
  `).get(requestedDate);

  if (existing) {
    res.status(200).json({
      date: existing.challenge_date,
      patterns: JSON.parse(existing.patterns_json)
    });
    return;
  }

  const challenge = buildDailyChallenge(requestedDate);

  db.prepare(`
    INSERT INTO daily_challenges (challenge_date, patterns_json, created_at)
    VALUES (?, ?, ?)
  `).run(
    requestedDate,
    JSON.stringify(challenge.patterns),
    new Date().toISOString()
  );

  res.status(200).json(challenge);
}));

app.use(express.static(frontendDir));
app.get("/", (req, res) => {
  res.sendFile(path.resolve(frontendDir, "index.html"));
});

app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.use((error, req, res, next) => {
  const status = error?.status || (error instanceof SyntaxError && "body" in error ? 400 : 500);
  const message = error instanceof Error ? error.message : "Internal server error";
  res.status(status).json({ error: message });
});

const updateSessionStatement = db.prepare(`
  UPDATE sessions
  SET score_submitted = 1,
      score_awarded = ?,
      score_after = ?,
      combo_after = ?
  WHERE id = ?
`);

const submitScoreTransaction = db.transaction((payload) => {
  updateSessionStatement.run(
    payload.awardedScore,
    payload.scoreAfter,
    payload.comboAfter,
    payload.sessionId
  );
});

function route(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function normalizeMode(value) {
  const upper = String(value || "").trim().toUpperCase();
  if (upper !== "DOUBT" && upper !== "ZEN") {
    throw httpError(400, "mode must be DOUBT or ZEN");
  }
  return upper;
}

function normalizePeriod(value) {
  const normalized = String(value || "daily").trim().toLowerCase();
  if (!["daily", "weekly", "all"].includes(normalized)) {
    throw httpError(400, "period must be daily, weekly, or all");
  }
  return normalized;
}

function periodStart(period) {
  if (period === "all") return null;
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
  if (period === "weekly") {
    start.setUTCDate(start.getUTCDate() - 6);
  }
  return start.toISOString();
}

function currentUtcDate() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeDateString(value) {
  if (!value) return null;
  const normalized = String(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null;
}

function normalizeClientId(value) {
  const clientId = requireText(value, "clientId");
  if (clientId.length > 120) {
    throw httpError(400, "clientId is too long");
  }
  return clientId;
}

function normalizePattern(value) {
  if (!Array.isArray(value) || !value.length) {
    throw httpError(400, "inputPattern must be a non-empty array");
  }

  return value.map((item) => {
    const parsed = Number(item);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 9) {
      throw httpError(400, "inputPattern must only contain integers 1-9");
    }
    return parsed;
  });
}

function patternsEqual(left, right) {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function normalizeOptionalPlayerName(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) return null;
  if (normalized.length < 2 || normalized.length > 12) {
    throw httpError(400, "playerName must be between 2 and 12 characters.");
  }
  if (!/^[A-Za-z0-9 _-]+$/.test(normalized)) {
    throw httpError(400, "playerName may only contain letters, numbers, spaces, underscores, or hyphens.");
  }
  if (normalized.toUpperCase().startsWith("ANON-")) {
    throw httpError(400, "playerName cannot start with ANON-.");
  }
  return normalized;
}

function anonymousPlayerNameForClient(clientId) {
  return `ANON-${clientId.slice(-4).toUpperCase()}`;
}

function requireText(value, fieldName) {
  if (typeof value !== "string" || !value.trim()) {
    throw httpError(400, `${fieldName} is required`);
  }
  return value.trim();
}

function toPositiveInteger(value, fieldName) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw httpError(400, `${fieldName} must be a positive integer`);
  }
  return parsed;
}

function toNonNegativeInteger(value, fieldName) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw httpError(400, `${fieldName} must be a non-negative integer`);
  }
  return parsed;
}

function isDirectRun() {
  if (!process.argv[1]) return false;
  return import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isDirectRun()) {
  app.listen(PORT, HOST, () => {
    console.log(`Lock Memory server listening on http://${HOST}:${PORT}`);
    console.log(`SQLite database: ${dbFile}`);
  });
}

export { app };
