(() => {
  const API_BASE_URL = String(window.LOCK_MEMORY_CONFIG?.API_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
  const STORAGE_KEYS = {
    best: "lock_memory_best_v3",
    clientId: "lock_memory_client_id_v1",
    theme: "pattern_theme_v1"
  };

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  const ui = {
    stage: document.getElementById("stage"),
    score: document.getElementById("score"),
    combo: document.getElementById("combo"),
    dots: document.getElementById("dots"),
    chance: document.getElementById("chance"),
    tier: document.getElementById("tier"),
    best: document.getElementById("best"),
    status: document.getElementById("status"),
    rule: document.getElementById("rule"),
    countdown: document.getElementById("countdown"),
    overlay: document.getElementById("overlay"),
    overlayTitle: document.getElementById("overlayTitle"),
    overlaySubtitle: document.getElementById("overlaySubtitle"),
    startPanel: document.getElementById("startPanel"),
    startNameInput: document.getElementById("startNameInput"),
    startNameState: document.getElementById("startNameState"),
    menuActions: document.getElementById("menuActions"),
    resultPanel: document.getElementById("resultPanel"),
    resultScore: document.getElementById("resultScore"),
    resultStage: document.getElementById("resultStage"),
    resultTier: document.getElementById("resultTier"),
    resultPlayerName: document.getElementById("resultPlayerName"),
    resultPlayerNote: document.getElementById("resultPlayerNote"),
    resultNameField: document.getElementById("resultNameField"),
    resultNameInput: document.getElementById("resultNameInput"),
    resultSaveState: document.getElementById("resultSaveState"),
    saveScoreBtn: document.getElementById("saveScoreBtn"),
    resultRestartBtn: document.getElementById("resultRestartBtn"),
    start: document.getElementById("start"),
    rankBtn: document.getElementById("rankBtn"),
    bottomRankBtn: document.getElementById("bottomRankBtn"),
    restart: document.getElementById("restart"),
    mute: document.getElementById("mute"),
    display: document.getElementById("display"),
    themeBtn: document.getElementById("themeBtn"),
    modeBtn: document.getElementById("modeBtn"),
    periodBtn: document.getElementById("periodBtn"),
    closePanelBtn: document.getElementById("closePanelBtn"),
    panelScrim: document.getElementById("panelScrim"),
    infoShell: document.getElementById("infoShell"),
    leaderboardList: document.getElementById("leaderboardList"),
    dailyList: document.getElementById("dailyList"),
    dailyDate: document.getElementById("dailyDate"),
    apiState: document.getElementById("apiState")
  };

  const TIERS = [
    { name: "BRONZE", short: "BR", color: "#b8875f" },
    { name: "SILVER", short: "SV", color: "#b8c7d6" },
    { name: "GOLD", short: "GD", color: "#ffd166" },
    { name: "DIAMOND", short: "DM", color: "#3df7ff" },
    { name: "MASTER", short: "MS", color: "#ff4cfa" }
  ];

  const coord = {
    1: [0, 0], 2: [1, 0], 3: [2, 0],
    4: [0, 1], 5: [1, 1], 6: [2, 1],
    7: [0, 2], 8: [1, 2], 9: [2, 2]
  };

  const idFromCoord = new Map(Object.entries(coord).map(([id, value]) => [value.join(","), Number(id)]));
  const THEMES = ["neon", "simple", "flamboyant"];
  const THEME_LABELS = {
    neon: "NEON",
    simple: "SIMPLE",
    flamboyant: "WILD"
  };
  const PARTICLE_LIMIT = 420;

  let W = 0;
  let H = 0;
  let DPR = 1;
  let nodes = [];
  let particles = [];
  let demoTrail = [];
  let inputTrail = [];
  let playerPattern = [];
  let currentPattern = [];
  let currentTier = "BRONZE";
  let currentDifficulty = 0;
  let currentDisplayTimeMs = 330;
  let currentInputLimitSec = 7.2;
  let currentSessionId = "";
  let currentRunId = null;
  let stage = 1;
  let score = 0;
  let combo = 0;
  let remainingChance = 3;
  let best = Number(localStorage.getItem(STORAGE_KEYS.best) || 0);
  let mode = "menu";
  let playMode = "DOUBT";
  let displayMode = "DOT";
  let leaderboardPeriod = "daily";
  let inputLimit = 0;
  let inputRemain = 0;
  let inputStartedAt = 0;
  let pointerDown = false;
  let activePointerId = null;
  let mouse = { x: 0, y: 0 };
  let muted = false;
  let audioCtx = null;
  let lastTime = performance.now();
  let flash = 0;
  let wrongFlash = 0;
  let statusTimerLast = null;
  let roundToken = 0;
  let panelOpen = false;
  let lastRankedSnapshot = null;
  let pendingRunResult = null;
  let savingResult = false;
  let activePlayerName = "";
  let theme = localStorage.getItem(STORAGE_KEYS.theme) || "neon";
  let themeColors = {
    cyan: "#3df7ff",
    green: "#8cff7a",
    red: "#ff4c6a",
    gold: "#ffd166",
    text: "#d9fbff",
    muted: "#6d8b93",
    nodeFill: "rgba(3,16,22,.82)",
    glow: 1,
    lineWidth: 11
  };
  const clientId = getPersistentClientId();

  ui.best.textContent = best;
  ui.modeBtn.textContent = playMode;
  syncPeriodButtons();

  function getPersistentClientId() {
    const saved = localStorage.getItem(STORAGE_KEYS.clientId);
    if (saved) return saved;
    const generated = `anon-${crypto.randomUUID()}`;
    localStorage.setItem(STORAGE_KEYS.clientId, generated);
    return generated;
  }

  function anonymousPlayerName() {
    return `ANON-${clientId.slice(-4).toUpperCase()}`;
  }

  function tierMeta(name) {
    return TIERS.find((tier) => tier.name === name) || TIERS[0];
  }

  function readThemeColors() {
    const styles = getComputedStyle(document.body);
    const pick = (name, fallback) => (styles.getPropertyValue(name) || fallback).trim() || fallback;
    themeColors = {
      cyan: pick("--cyan", "#3df7ff"),
      green: pick("--green", "#8cff7a"),
      red: pick("--red", "#ff4c6a"),
      gold: pick("--gold", "#ffd166"),
      text: pick("--text", "#d9fbff"),
      muted: pick("--muted", "#6d8b93"),
      nodeFill: pick("--node-fill", "rgba(3,16,22,.82)"),
      glow: parseFloat(pick("--glow-strength", "1")) || 0,
      lineWidth: parseFloat(pick("--line-width", "11")) || 11
    };
  }

  function applyTheme(nextTheme) {
    theme = THEMES.includes(nextTheme) ? nextTheme : "neon";
    document.body.classList.remove("theme-simple", "theme-flamboyant");
    if (theme === "simple") {
      document.body.classList.add("theme-simple");
    } else if (theme === "flamboyant") {
      document.body.classList.add("theme-flamboyant");
    }
    ui.themeBtn.textContent = THEME_LABELS[theme];
    localStorage.setItem(STORAGE_KEYS.theme, theme);
    readThemeColors();
  }

  function cycleTheme() {
    const currentIndex = THEMES.indexOf(theme);
    applyTheme(THEMES[(currentIndex + 1) % THEMES.length]);
  }

  function themeDisplayFont() {
    if (theme === "simple") {
      return "\"JetBrains Mono\", \"SF Mono\", ui-monospace, Menlo, Consolas, monospace";
    }
    if (theme === "flamboyant") {
      return "\"Times New Roman\", Georgia, serif";
    }
    return "\"Space Grotesk\", Inter, sans-serif";
  }

  function setStatus(text) {
    statusTimerLast = null;
    ui.status.textContent = text;
  }

  function setStatusThrottled(text, key) {
    if (key === statusTimerLast) return;
    statusTimerLast = key;
    ui.status.textContent = text;
  }

  function setApiState(text) {
    ui.apiState.textContent = text;
  }

  function normalizePlayerNameInput(value) {
    if (typeof value !== "string") return "";
    const normalized = value.trim().replace(/\s+/g, " ");
    if (!normalized) return "";
    if (normalized.length < 2 || normalized.length > 12) {
      throw new Error("Callsign must be between 2 and 12 characters.");
    }
    if (!/^[A-Za-z0-9 _-]+$/.test(normalized)) {
      throw new Error("Callsign may only use letters, numbers, spaces, underscores, or hyphens.");
    }
    if (normalized.toUpperCase().startsWith("ANON-")) {
      throw new Error("Callsign cannot start with ANON-.");
    }
    return normalized;
  }

  function syncPeriodButtons() {
    ui.periodBtn.textContent = leaderboardPeriod.toUpperCase();
  }

  function setStartNameState(text, isError = false) {
    ui.startNameState.textContent = text;
    ui.startNameState.classList.toggle("error", isError);
  }

  function refreshStartNameState() {
    const anonName = anonymousPlayerName();
    const rawValue = ui.startNameInput.value.trim();

    if (!rawValue) {
      setStartNameState(`Leave it blank to start as ${anonName}. You can add a name after game over.`);
      return;
    }

    try {
      const normalized = normalizePlayerNameInput(ui.startNameInput.value);
      setStartNameState(`This run will start as ${normalized}.`, false);
    } catch (error) {
      setStartNameState(error.message, true);
    }
  }

  function setPanelOpen(nextOpen) {
    panelOpen = nextOpen;
    document.body.classList.toggle("panel-open", panelOpen);
    ui.infoShell.setAttribute("aria-hidden", String(!panelOpen));
    syncRankButtons();
  }

  function syncRankButtons() {
    const label = panelOpen ? "CLOSE" : "RANK";
    ui.bottomRankBtn.textContent = label;
    ui.bottomRankBtn.classList.toggle("active-toggle", panelOpen);
    ui.rankBtn.textContent = panelOpen ? "CLOSE RANK" : "VIEW RANK";
  }

  function setOverlayLayout(layout) {
    const isResult = layout === "result";
    ui.menuActions.classList.toggle("hidden", isResult);
    ui.startPanel.classList.toggle("hidden", isResult);
    ui.resultPanel.classList.toggle("hidden", !isResult);
  }

  function setResultSaveState(text, isError = false) {
    ui.resultSaveState.textContent = text;
    ui.resultSaveState.classList.toggle("error", isError);
  }

  function syncUI() {
    const tier = tierMeta(currentTier);
    ui.stage.textContent = stage;
    ui.score.textContent = score;
    ui.combo.textContent = combo;
    ui.dots.textContent = currentPattern.length || 4;
    ui.chance.textContent = remainingChance;
    ui.tier.textContent = tier.short;
    ui.tier.style.color = tier.color;
    ui.best.textContent = best;
    ui.rule.textContent = `${playMode} | ${currentTier} | difficulty ${currentDifficulty}/100 | client ${clientId.slice(-6).toUpperCase()}`;
  }

  function saveBest() {
    best = Math.max(best, score);
    localStorage.setItem(STORAGE_KEYS.best, String(best));
    syncUI();
  }

  async function requestJson(path, options = {}) {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });

    const text = await response.text();
    let body = {};

    if (text) {
      try {
        body = JSON.parse(text);
      } catch (error) {
        body = { error: text };
      }
    }

    if (!response.ok) {
      throw new Error(body.error || `Request failed with ${response.status}`);
    }

    return body;
  }

  async function fetchPatternSession() {
    return requestJson("/api/pattern", {
      method: "POST",
      body: JSON.stringify({
        stage,
        mode: playMode,
        clientId,
        runId: currentRunId
      })
    });
  }

  async function submitStageScore(payload) {
    return requestJson("/api/score/submit", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  async function finalizeRunScore(payload) {
    return requestJson("/api/run/finalize", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  async function refreshPanels() {
    const leaderboardPromise = requestJson(`/api/leaderboard?mode=${encodeURIComponent("DOUBT")}&period=${encodeURIComponent(leaderboardPeriod)}`);
    const dailyPromise = requestJson("/api/daily");
    const [leaderboardResult, dailyResult] = await Promise.allSettled([leaderboardPromise, dailyPromise]);

    if (leaderboardResult.status === "fulfilled") {
      const leaderboardItems = leaderboardResult.value.items || [];
      renderLeaderboard(leaderboardItems);
      const boardState = `${leaderboardResult.value.mode} ${leaderboardResult.value.period}`.toUpperCase();
      setApiState(boardState);
    } else {
      renderLeaderboard([]);
      setApiState("LEADERBOARD OFFLINE");
    }

    if (dailyResult.status === "fulfilled") {
      renderDaily(dailyResult.value.date, dailyResult.value.patterns || []);
    } else {
      renderDaily("--", []);
    }
  }

  function renderLeaderboard(items) {
    if (!items.length) {
      ui.leaderboardList.innerHTML = `<li class="placeholder">No ranked runs yet.</li>`;
      return;
    }

    ui.leaderboardList.innerHTML = items.map((item) => {
      const name = escapeHtml(item.name || "PLAYER");
      const stageLabel = `Stage ${item.stage} | ${item.tier}`;
      return `
        <li class="leaderboard-item">
          <div class="rank-pill">${item.rank}</div>
          <div class="entry-main">
            <div class="entry-name">${name}</div>
            <div class="entry-sub">${stageLabel}</div>
          </div>
          <div class="entry-score">
            <strong>${Number(item.score).toLocaleString()}</strong>
            <span>${formatDateShort(item.createdAt)}</span>
          </div>
        </li>
      `;
    }).join("");
  }

  function renderDaily(date, patterns) {
    ui.dailyDate.textContent = date;

    if (!patterns.length) {
      ui.dailyList.innerHTML = `<li class="placeholder">Daily challenge unavailable.</li>`;
      return;
    }

    ui.dailyList.innerHTML = patterns.map((item) => {
      const patternText = item.pattern.join(" -> ");
      return `
        <li class="daily-item">
          <div class="daily-stage">${item.stage}</div>
          <div class="daily-main">
            <div class="daily-tier">${item.tier} | ${item.difficulty}/100</div>
            <div class="daily-pattern">${patternText}</div>
          </div>
        </li>
      `;
    }).join("");
  }

  function formatDateShort(value) {
    if (!value) return "--";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "--" : date.toISOString().slice(5, 16).replace("T", " ");
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll("\"", "&quot;")
      .replaceAll("'", "&#39;");
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
    const [x1, y1] = coord[a];
    const [x2, y2] = coord[b];
    let dx = x2 - x1;
    let dy = y2 - y1;
    const divisor = gcd(dx, dy);
    dx /= divisor;
    dy /= divisor;
    return `${dx},${dy}`;
  }

  function uniqueSlopeCount(pattern) {
    const slopes = new Set();
    for (let index = 1; index < pattern.length; index += 1) {
      slopes.add(normalizedSlope(pattern[index - 1], pattern[index]));
    }
    return slopes.size;
  }

  function computePracticeAward(stageValue, comboValue, pattern, difficulty) {
    return (
      (100 * stageValue) +
      (comboValue * 25) +
      (pattern.length * 40) +
      (difficulty * 8) +
      (uniqueSlopeCount(pattern) * 35)
    );
  }

  function blockerBetween(a, b) {
    const [x1, y1] = coord[a];
    const [x2, y2] = coord[b];
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

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.floor(window.innerWidth);
    H = Math.floor(window.innerHeight);
    canvas.width = Math.floor(W * DPR);
    canvas.height = Math.floor(H * DPR);
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    buildNodes();
  }

  function buildNodes() {
    const size = Math.min(W, H) * (W < 600 ? 0.62 : 0.54);
    const gap = size / 2;
    const centerX = W / 2;
    const centerY = H * (W < 600 ? 0.56 : 0.55);
    const startX = centerX - gap;
    const startY = centerY - gap;
    const radius = Math.max(20, Math.min(36, size * 0.085));
    nodes = [];

    let id = 1;
    for (let row = 0; row < 3; row += 1) {
      for (let col = 0; col < 3; col += 1) {
        nodes.push({
          id,
          x: startX + (col * gap),
          y: startY + (row * gap),
          r: radius,
          glow: 0,
          hit: 0,
          fail: 0
        });
        id += 1;
      }
    }
  }

  function getNode(id) {
    return nodes[id - 1];
  }

  function dist(ax, ay, bx, by) {
    return Math.hypot(ax - bx, ay - by);
  }

  function nodeAt(x, y) {
    const slack = W < 600 ? 1.7 : 1.45;
    return nodes.find((node) => dist(x, y, node.x, node.y) < node.r * slack);
  }

  function initAudio() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === "suspended") {
      audioCtx.resume();
    }
  }

  function tone(freq = 440, duration = 0.08, type = "sine", gain = 0.055) {
    if (muted || !audioCtx) return;

    const now = audioCtx.currentTime;
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(Math.max(40, freq), now);
    gainNode.gain.setValueAtTime(0.0001, now);
    gainNode.gain.exponentialRampToValueAtTime(gain, now + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
  }

  function sfx(name, note = 1) {
    if (name === "demo") tone(260 + (note * 38), 0.075, "triangle", 0.05);
    if (name === "input") tone(420 + (note * 42), 0.055, "sine", 0.045);
    if (name === "auto") tone(250 + (note * 30), 0.05, "triangle", 0.035);
    if (name === "success") {
      tone(520, 0.07, "triangle", 0.055);
      setTimeout(() => tone(720, 0.09, "triangle", 0.055), 65);
      setTimeout(() => tone(980, 0.12, "triangle", 0.05), 130);
    }
    if (name === "fail") {
      tone(140, 0.18, "sawtooth", 0.035);
      setTimeout(() => tone(90, 0.2, "sawtooth", 0.03), 80);
    }
  }

  function addBurst(x, y, color = "cyan", amount = 20) {
    for (let index = 0; index < amount; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 80 + (Math.random() * 300);
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.45 + (Math.random() * 0.5),
        max: 0.85,
        size: 1 + (Math.random() * 3),
        color
      });
    }
    if (particles.length > PARTICLE_LIMIT) {
      particles.splice(0, particles.length - PARTICLE_LIMIT);
    }
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function showMenu(title, subtitle, buttonText) {
    pendingRunResult = null;
    savingResult = false;
    ui.overlayTitle.innerHTML = title;
    ui.overlaySubtitle.textContent = subtitle;
    ui.start.textContent = buttonText;
    ui.startNameInput.placeholder = anonymousPlayerName();
    refreshStartNameState();
    setOverlayLayout("menu");
    ui.overlay.classList.remove("hidden");
  }

  function hideMenu() {
    ui.overlay.classList.add("hidden");
  }

  function showResultMenu(payload) {
    pendingRunResult = payload;
    savingResult = false;

    const anonName = anonymousPlayerName();
    const runPlayerName = payload.playerName || "";
    const needsNameInput = !runPlayerName;

    ui.overlayTitle.innerHTML = "RUN<br />OVER";
    ui.overlaySubtitle.textContent = payload.subtitle;
    ui.resultScore.textContent = Number(payload.score).toLocaleString();
    ui.resultStage.textContent = String(payload.stage);
    ui.resultTier.textContent = payload.tier;
    ui.resultPlayerName.textContent = runPlayerName || anonName;
    ui.resultPlayerNote.textContent = runPlayerName
      ? `This run started as ${runPlayerName}. Save it to keep that name on the board.`
      : `You started anonymously. Add a callsign now or leave it blank for ${anonName}.`;
    ui.resultNameField.classList.toggle("hidden", !needsNameInput);
    ui.resultNameInput.value = "";
    ui.resultNameInput.placeholder = anonName;
    ui.saveScoreBtn.disabled = false;
    ui.resultRestartBtn.disabled = false;
    setResultSaveState(
      runPlayerName
        ? `Ready to save as ${runPlayerName}.`
        : `Leave it blank to save as ${anonName}. Callsign: 2-12 letters, numbers, spaces, _ or -.`
    );
    setOverlayLayout("result");
    ui.overlay.classList.remove("hidden");

    window.setTimeout(() => {
      if (needsNameInput) {
        ui.resultNameInput.focus();
        ui.resultNameInput.select();
        return;
      }
      ui.saveScoreBtn.focus();
    }, 24);
  }

  async function saveRunResult() {
    if (!pendingRunResult || savingResult) return;

    let playerName = "";
    try {
      playerName = pendingRunResult.playerName || normalizePlayerNameInput(ui.resultNameInput.value);
    } catch (error) {
      setResultSaveState(error.message, true);
      ui.resultNameInput.focus();
      return;
    }

    savingResult = true;
    ui.saveScoreBtn.disabled = true;
    ui.resultRestartBtn.disabled = true;
    setResultSaveState("Saving your run...");

    try {
      const response = await finalizeRunScore({
        runId: pendingRunResult.runId,
        clientId,
        playerName
      });

      lastRankedSnapshot = null;
      pendingRunResult = null;
      activePlayerName = "";
      ui.startNameInput.value = playerName || "";
      refreshStartNameState();
      setStatus(`RANK #${response.rank}`);
      refreshPanels().catch(() => {});
      setPanelOpen(true);
      showMenu(
        "ENTRY<br />SAVED",
        `Saved as ${response.name}. Final score ${Number(response.score).toLocaleString()} | Rank #${response.rank}.`,
        "PLAY AGAIN"
      );
    } catch (error) {
      setResultSaveState(error.message, true);
      ui.saveScoreBtn.disabled = false;
      ui.resultRestartBtn.disabled = false;
      savingResult = false;
      return;
    }

    savingResult = false;
  }

  function openRankPanel() {
    setPanelOpen(true);
    refreshPanels().catch(() => {
      setApiState("LEADERBOARD OFFLINE");
    });
  }

  function cycleLeaderboardPeriod() {
    leaderboardPeriod = leaderboardPeriod === "daily" ? "weekly" : leaderboardPeriod === "weekly" ? "all" : "daily";
    syncPeriodButtons();
    refreshPanels().catch(() => {
      setApiState("LEADERBOARD OFFLINE");
    });
  }

  function resetRoundState() {
    playerPattern = [];
    inputTrail = [];
    demoTrail = [];
    pointerDown = false;
    activePointerId = null;
    statusTimerLast = null;
    currentSessionId = "";
    currentPattern = [];
    currentDifficulty = 0;
    currentInputLimitSec = playMode === "ZEN" ? 0 : 7.2;
    syncUI();
  }

  function resetGameState() {
    roundToken += 1;
    currentRunId = null;
    lastRankedSnapshot = null;
    pendingRunResult = null;
    savingResult = false;
    activePlayerName = "";
    stage = 1;
    score = 0;
    combo = 0;
    remainingChance = 3;
    flash = 0;
    wrongFlash = 0;
    currentTier = "BRONZE";
    resetRoundState();
  }

  async function startGame() {
    if (mode === "loading" || mode === "submitting") return;

    let chosenName = "";
    try {
      chosenName = normalizePlayerNameInput(ui.startNameInput.value);
    } catch (error) {
      setStartNameState(error.message, true);
      ui.startNameInput.focus();
      return;
    }

    ui.startNameInput.value = chosenName;
    refreshStartNameState();
    initAudio();
    setPanelOpen(false);
    hideMenu();
    resetGameState();
    activePlayerName = chosenName;
    await nextStage();
  }

  async function nextStage() {
    const token = ++roundToken;
    mode = "loading";
    remainingChance = 3;
    playerPattern = [];
    inputTrail = [];
    demoTrail = [];
    syncUI();
    setStatus("SYNCING PATTERN");
    setApiState("REQUESTING PATTERN");

    try {
      const session = await fetchPatternSession();
      if (token !== roundToken) return;

      currentSessionId = session.sessionId;
      currentRunId = session.runId || currentRunId;
      currentPattern = session.pattern || [];
      currentTier = session.tier || "BRONZE";
      currentDifficulty = Number(session.difficulty || 0);
      currentDisplayTimeMs = Number(session.displayTimeMs || 330);
      currentInputLimitSec = Number(session.inputLimitSec || 0);

      syncUI();
      setStatus("WATCH CAREFULLY");
      setApiState(`SESSION ${currentSessionId.slice(0, 8).toUpperCase()}`);
      await playDemo(token);
    } catch (error) {
      if (token !== roundToken) return;
      mode = "menu";
      setStatus("API ERROR");
      setApiState("PATTERN REQUEST FAILED");
      showMenu("API<br />ERROR", `Could not load the next pattern. ${error.message}`, "TRY AGAIN");
    }
  }

  async function playDemo(token) {
    mode = "demo";
    await wait(430);
    if (token !== roundToken || mode !== "demo") return;

    for (let index = 0; index < currentPattern.length; index += 1) {
      if (token !== roundToken || mode !== "demo") return;
      const node = getNode(currentPattern[index]);
      node.glow = 1;
      node.hit = 1;
      demoTrail = currentPattern.slice(0, index + 1);
      sfx("demo", currentPattern[index]);
      addBurst(node.x, node.y, "cyan", 10);
      await wait(currentDisplayTimeMs);
    }

    demoTrail = [];
    setStatus("MEMORY LOCK");
    await countdown(token);
    if (token !== roundToken) return;
    mode = "input";
    inputTrail = [];
    playerPattern = [];
    inputLimit = currentInputLimitSec;
    inputRemain = inputLimit;
    inputStartedAt = performance.now();
    setStatus(playMode === "ZEN" ? "INPUT NOW" : `INPUT | ${inputRemain.toFixed(1)}S`);
  }

  async function countdown(token) {
    for (const value of ["3", "2", "1"]) {
      if (token !== roundToken) return;
      ui.countdown.textContent = value;
      ui.countdown.classList.add("show");
      tone(value === "3" ? 300 : value === "2" ? 380 : 480, 0.08, "triangle", 0.04);
      await wait(650);
      ui.countdown.classList.remove("show");
      await wait(350);
    }
  }

  function pushPlayerNode(id, auto = false) {
    if (mode !== "input") return;
    if (playerPattern.includes(id)) return;

    const expected = currentPattern[playerPattern.length];
    const node = getNode(id);

    playerPattern.push(id);
    inputTrail.push(id);
    node.hit = 1;
    node.glow = 1;
    addBurst(node.x, node.y, auto ? "cyan" : "green", auto ? 9 : 16);
    sfx(auto ? "auto" : "input", id);

    if (id !== expected) {
      fail(node);
      return;
    }

    if (playerPattern.length === currentPattern.length) {
      success();
    }
  }

  function registerNode(node) {
    if (mode !== "input") return;
    if (playerPattern[playerPattern.length - 1] === node.id) return;
    if (playerPattern.includes(node.id)) return;

    const last = playerPattern[playerPattern.length - 1];
    if (last) {
      const blockers = blockerBetween(last, node.id);
      if (blockers) {
        for (const blocker of blockers) {
          if (!playerPattern.includes(blocker)) {
            pushPlayerNode(blocker, true);
            if (mode !== "input") return;
          }
        }
      }
    }

    pushPlayerNode(node.id, false);
  }

  async function success() {
    if (mode !== "input") return;
    const token = roundToken;
    mode = "success";

    const comboAfter = combo + 1;
    const predictedAward = computePracticeAward(stage, comboAfter, currentPattern, currentDifficulty);
    let awarded = predictedAward;

    try {
      if (playMode === "DOUBT") {
        setStatus("VERIFYING SCORE");
        setApiState("SUBMITTING SCORE");
        const response = await submitStageScore({
          sessionId: currentSessionId,
          runId: currentRunId,
          clientId,
          stage,
          score: score + predictedAward,
          combo: comboAfter,
          success: true,
          inputPattern: playerPattern.slice(),
          elapsedMs: Math.round(performance.now() - inputStartedAt)
        });

        if (token !== roundToken) return;

        combo = Number(response.combo || comboAfter);
        score = Number(response.score || score);
        awarded = Number(response.awardedScore || predictedAward);
        lastRankedSnapshot = {
          runId: currentRunId,
          score,
          stage,
          tier: currentTier
        };
        setApiState(`RUN VERIFIED | PROJECTED #${response.rank || "-"}`);
      } else {
        combo = comboAfter;
        score += predictedAward;
        setApiState("ZEN PRACTICE");
      }
    } catch (error) {
      if (token !== roundToken) return;
      mode = "menu";
      setStatus("SCORE REJECTED");
      setApiState("SUBMIT FAILED");
      showMenu("RUN<br />REJECTED", `The server rejected this stage. ${error.message}`, "RESTART");
      return;
    }

    flash = 1;
    setStatus(`${playMode === "ZEN" ? "ZEN CLEAR" : "ACCESS GRANTED"} +${awarded}`);
    saveBest();
    syncUI();
    sfx("success");

    for (const id of currentPattern) {
      const node = getNode(id);
      addBurst(node.x, node.y, "green", 12);
    }

    setTimeout(() => {
      if (token !== roundToken) return;
      stage += 1;
      syncUI();
      nextStage();
    }, 950);
  }

  function retrySameStage() {
    mode = "demo";
    playerPattern = [];
    inputTrail = [];
    demoTrail = [];
    setStatus(`RETRY | ${remainingChance} CHANCE LEFT`);
    syncUI();
    setTimeout(() => {
      if (mode === "demo") {
        playDemo(roundToken);
      }
    }, 760);
  }

  function fail(node) {
    mode = "fail";

    if (playMode === "ZEN") {
      combo = 0;
      wrongFlash = 1;
      setStatus("ZEN RETRY");
      ui.status.classList.add("shake");
      setTimeout(() => ui.status.classList.remove("shake"), 300);
      sfx("fail");
      node.fail = 1;
      addBurst(node.x, node.y, "red", 26);
      syncUI();
      setTimeout(() => retrySameStage(), 900);
      return;
    }

    remainingChance -= 1;
    combo = 0;
    wrongFlash = 1;
    setStatus(remainingChance > 0 ? `ACCESS DENIED | RETRY ${remainingChance}/3` : "ACCESS DENIED");
    ui.status.classList.add("shake");
    setTimeout(() => ui.status.classList.remove("shake"), 300);
    sfx("fail");
    node.fail = 1;
    addBurst(node.x, node.y, "red", 34);
    syncUI();

    if (remainingChance > 0) {
      setTimeout(() => retrySameStage(), 950);
      return;
    }

    setTimeout(() => {
      mode = "menu";
      if (playMode === "DOUBT" && lastRankedSnapshot && Number(lastRankedSnapshot.score) > 0) {
        showResultMenu({
          runId: lastRankedSnapshot.runId,
          score: lastRankedSnapshot.score,
          stage: lastRankedSnapshot.stage,
          tier: lastRankedSnapshot.tier,
          playerName: activePlayerName,
          subtitle: `You failed on stage ${stage}. Save your best cleared run to the rank board.`
        });
        openRankPanel();
        return;
      }

      showMenu(
        "SYSTEM<br />LOCKED",
        `Stage ${stage} failed three times. Pattern: ${currentPattern.join(" -> ")}. Final score ${score}.`,
        "RETRY"
      );
    }, 850);
  }

  function pointerPos(event, source = null) {
    const rect = canvas.getBoundingClientRect();
    const point = source || (event.touches ? event.touches[0] : event);
    return {
      x: point.clientX - rect.left,
      y: point.clientY - rect.top
    };
  }

  function touchById(event, identifier) {
    if (!event.touches) return event;
    for (const touch of event.touches) {
      if (touch.identifier === identifier) {
        return touch;
      }
    }
    return null;
  }

  function onDown(event) {
    if (mode !== "input") return;
    event.preventDefault();
    initAudio();
    pointerDown = true;
    if (event.touches && event.touches.length) {
      activePointerId = event.touches[0].identifier;
    }
    const point = pointerPos(event);
    mouse = point;
    const node = nodeAt(point.x, point.y);
    if (node) registerNode(node);
  }

  function onMove(event) {
    let point;
    if (event.touches) {
      const touch = activePointerId !== null ? touchById(event, activePointerId) : event.touches[0];
      if (!touch) return;
      point = pointerPos(event, touch);
    } else {
      point = pointerPos(event);
    }
    mouse = point;
    if (!pointerDown || mode !== "input") return;
    event.preventDefault();
    const node = nodeAt(point.x, point.y);
    if (node) registerNode(node);
  }

  function onUp() {
    pointerDown = false;
    activePointerId = null;
  }

  function drawGridBackground(time) {
    ctx.save();
    ctx.globalAlpha = theme === "simple" ? 0.08 : 0.22 * Math.max(0.3, themeColors.glow || 1);
    ctx.strokeStyle = themeColors.muted;
    ctx.lineWidth = 1;
    const step = 42;
    const offset = (time * 12) % step;

    for (let x = -step; x < W + step; x += step) {
      ctx.beginPath();
      ctx.moveTo(x + offset, 0);
      ctx.lineTo(x + offset, H);
      ctx.stroke();
    }

    for (let y = -step; y < H + step; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y + offset);
      ctx.lineTo(W, y + offset);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawLine(a, b, color, width = 12, alpha = 1) {
    const glow = themeColors.glow ?? 1;
    const themedWidth = themeColors.lineWidth || width;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.shadowBlur = 28 * glow;
    ctx.shadowColor = color;
    ctx.strokeStyle = color;
    if (glow > 0) {
      ctx.globalAlpha = alpha * 0.18;
      ctx.lineWidth = themedWidth * 2.4;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    ctx.globalAlpha = alpha;
    ctx.lineWidth = themedWidth;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();

    ctx.globalAlpha = theme === "simple" ? 0.9 : 0.95;
    ctx.strokeStyle = theme === "simple" ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.7)";
    ctx.lineWidth = Math.max(1.4, themedWidth * 0.18);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.restore();
  }

  function drawTrail(list, color, alpha = 1, livePointer = false) {
    if (!list.length) return;

    for (let index = 1; index < list.length; index += 1) {
      drawLine(getNode(list[index - 1]), getNode(list[index]), color, 11, alpha);
    }

    if (livePointer && pointerDown && list.length > 0 && mode === "input") {
      drawLine(getNode(list[list.length - 1]), mouse, color, 8, 0.42);
    }
  }

  function drawNodes(dt, time) {
    const glow = themeColors.glow ?? 1;
    for (const node of nodes) {
      node.glow = Math.max(0, node.glow - (dt * 2.5));
      node.hit = Math.max(0, node.hit - (dt * 3.2));
      node.fail = Math.max(0, node.fail - (dt * 2.6));
      const pulse = 0.5 + (Math.sin(time * 2.2 + node.id) * 0.5);
      const active = node.glow;
      const failState = node.fail;
      const radius = node.r * (1 + (node.hit * 0.24));

      ctx.save();
      ctx.translate(node.x, node.y);
      ctx.globalAlpha = 0.18 + (pulse * 0.04 * glow) + (active * 0.55) + (failState * 0.5);
      ctx.fillStyle = failState ? hexToRgba(themeColors.red, 0.18) : hexToRgba(themeColors.cyan, 0.12 * Math.max(0.2, glow));
      ctx.shadowBlur = (42 + (active * 48) + (failState * 60)) * glow;
      ctx.shadowColor = failState ? themeColors.red : themeColors.cyan;
      ctx.beginPath();
      ctx.arc(0, 0, radius * 2.3, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = 1;
      ctx.lineWidth = theme === "simple" ? 1.5 : 2;
      ctx.strokeStyle = failState ? hexToRgba(themeColors.red, 0.9) : hexToRgba(themeColors.cyan, 0.55);
      ctx.fillStyle = failState ? hexToRgba(themeColors.red, 0.22) : themeColors.nodeFill;
      ctx.shadowBlur = (22 + (active * 42)) * glow;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      if (displayMode === "NUMBER") {
        ctx.fillStyle = failState ? themeColors.red : active > 0.15 ? themeColors.text : themeColors.cyan;
        ctx.shadowBlur = 20 * glow;
        ctx.font = `900 ${Math.max(13, node.r * 0.55)}px ${themeDisplayFont()}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.globalAlpha = 0.34 + (active * 0.66);
        ctx.fillText(node.id, 0, 1);
      } else {
        ctx.globalAlpha = 0.55 + (active * 0.45);
        ctx.fillStyle = failState ? themeColors.red : active > 0.15 ? themeColors.text : themeColors.cyan;
        ctx.shadowBlur = (18 + (active * 20)) * glow;
        ctx.beginPath();
        ctx.arc(0, 0, Math.max(3.5, node.r * 0.13), 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = active > 0.1 ? 0.95 : 0.22;
        ctx.lineWidth = theme === "simple" ? 1.4 : 2;
        ctx.strokeStyle = failState
          ? hexToRgba(themeColors.red, 0.8)
          : (theme === "simple" ? hexToRgba(themeColors.text, 0.7) : "rgba(255,255,255,0.75)");
        ctx.beginPath();
        ctx.arc(0, 0, radius * 0.72, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function hexToRgba(color, alpha) {
    if (!color) return `rgba(61,247,255,${alpha})`;
    const normalized = color.trim();
    if (normalized.startsWith("rgba") || normalized.startsWith("rgb")) {
      const parts = normalized.match(/[\d.]+/g);
      if (parts && parts.length >= 3) {
        return `rgba(${parts[0]},${parts[1]},${parts[2]},${alpha})`;
      }
      return normalized;
    }
    if (normalized.startsWith("#")) {
      let hex = normalized.slice(1);
      if (hex.length === 3) {
        hex = hex.split("").map((value) => value + value).join("");
      }
      const red = parseInt(hex.slice(0, 2), 16);
      const green = parseInt(hex.slice(2, 4), 16);
      const blue = parseInt(hex.slice(4, 6), 16);
      return `rgba(${red},${green},${blue},${alpha})`;
    }
    return normalized;
  }

  function drawParticles(dt) {
    const glow = themeColors.glow ?? 1;
    for (let index = particles.length - 1; index >= 0; index -= 1) {
      const particle = particles[index];
      particle.life -= dt;
      if (particle.life <= 0) {
        particles.splice(index, 1);
        continue;
      }

      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= Math.pow(0.05, dt);
      particle.vy *= Math.pow(0.05, dt);

      const alpha = Math.max(0, particle.life / particle.max);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = particle.color === "red" ? themeColors.red : particle.color === "green" ? themeColors.green : themeColors.cyan;
      ctx.shadowBlur = 16 * glow;
      ctx.shadowColor = ctx.fillStyle;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawTimeBar() {
    if (mode !== "input" || playMode === "ZEN" || inputLimit <= 0) return;
    const percent = Math.max(0, inputRemain / inputLimit);
    const barWidth = Math.min(420, W * 0.62);
    const x = (W / 2) - (barWidth / 2);
    const y = H * (W < 600 ? 0.19 : 0.17);
    const glow = themeColors.glow ?? 1;

    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = hexToRgba(themeColors.cyan, theme === "simple" ? 0.15 : 0.08);
    ctx.beginPath();
    ctx.roundRect(x, y, barWidth, 5, 99);
    ctx.fill();

    ctx.shadowBlur = 18 * glow;
    ctx.shadowColor = percent < 0.28 ? themeColors.red : themeColors.cyan;
    ctx.fillStyle = percent < 0.28 ? hexToRgba(themeColors.red, 0.86) : hexToRgba(themeColors.cyan, 0.82);
    ctx.beginPath();
    ctx.roundRect(x, y, barWidth * percent, 5, 99);
    ctx.fill();
    ctx.restore();
  }

  function drawWatermark() {
    ctx.save();
    ctx.globalAlpha = theme === "simple" ? 0.05 : 0.035;
    ctx.fillStyle = themeColors.text;
    ctx.font = `950 ${Math.min(120, W * 0.12)}px ${themeDisplayFont()}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(currentTier || "PATTERN", W / 2, H * 0.5);
    ctx.restore();
  }

  function loop(now) {
    const dt = Math.min(0.033, (now - lastTime) / 1000);
    const time = now / 1000;
    lastTime = now;

    if (mode === "input" && playMode !== "ZEN" && inputLimit > 0) {
      inputRemain -= dt;
      if (inputRemain <= 0) {
        inputRemain = 0;
        const node = inputTrail.length ? getNode(inputTrail[inputTrail.length - 1]) : getNode(currentPattern[0]);
        if (node) fail(node);
      } else {
        const rounded = Math.ceil(inputRemain * 10);
        setStatusThrottled(`INPUT | ${inputRemain.toFixed(1)}S`, rounded);
      }
    }

    flash = Math.max(0, flash - (dt * 1.8));
    wrongFlash = Math.max(0, wrongFlash - (dt * 2.2));

    ctx.clearRect(0, 0, W, H);
    drawGridBackground(time);
    drawWatermark();

    if (flash > 0) {
      ctx.fillStyle = hexToRgba(themeColors.green, flash * 0.08);
      ctx.fillRect(0, 0, W, H);
    }

    if (wrongFlash > 0) {
      ctx.fillStyle = hexToRgba(themeColors.red, wrongFlash * 0.11);
      ctx.fillRect(0, 0, W, H);
    }

    drawTrail(demoTrail, currentTier === "MASTER" ? themeColors.gold : themeColors.cyan, 1, false);
    drawTrail(inputTrail, mode === "fail" ? themeColors.red : themeColors.green, 1, true);
    drawNodes(dt, time);
    drawTimeBar();
    drawParticles(dt);
    requestAnimationFrame(loop);
  }

  window.addEventListener("resize", resize);
  canvas.addEventListener("mousedown", onDown);
  canvas.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
  canvas.addEventListener("touchstart", onDown, { passive: false });
  canvas.addEventListener("touchmove", onMove, { passive: false });
  window.addEventListener("touchend", onUp);
  window.addEventListener("touchcancel", onUp);

  ui.start.addEventListener("click", () => {
    startGame().catch((error) => {
      mode = "menu";
      showMenu("START<br />FAILED", error.message, "TRY AGAIN");
    });
  });

  ui.rankBtn.addEventListener("click", () => {
    if (panelOpen) {
      setPanelOpen(false);
      return;
    }
    openRankPanel();
  });

  ui.bottomRankBtn.addEventListener("click", () => {
    if (panelOpen) {
      setPanelOpen(false);
      return;
    }
    openRankPanel();
  });

  ui.saveScoreBtn.addEventListener("click", () => {
    saveRunResult().catch((error) => {
      setResultSaveState(error.message, true);
    });
  });

  ui.resultRestartBtn.addEventListener("click", () => {
    if (savingResult) return;
    startGame().catch((error) => {
      mode = "menu";
      showMenu("START<br />FAILED", error.message, "TRY AGAIN");
    });
  });

  ui.startNameInput.addEventListener("input", () => {
    refreshStartNameState();
  });

  ui.startNameInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    startGame().catch((error) => {
      mode = "menu";
      showMenu("START<br />FAILED", error.message, "TRY AGAIN");
    });
  });

  ui.resultNameInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    saveRunResult().catch((error) => {
      setResultSaveState(error.message, true);
    });
  });

  ui.closePanelBtn.addEventListener("click", () => {
    setPanelOpen(false);
  });

  ui.panelScrim.addEventListener("click", () => {
    setPanelOpen(false);
  });

  ui.restart.addEventListener("click", () => {
    mode = "menu";
    setPanelOpen(false);
    resetGameState();
    setStatus("READY");
    setApiState("IDLE");
    showMenu(
      "LOCK<br />MEMORY",
      "Trace the remembered lock pattern. Enter a callsign now, or leave it blank and decide when the run ends.",
      "START GAME"
    );
  });

  ui.display.addEventListener("click", () => {
    displayMode = displayMode === "DOT" ? "NUMBER" : "DOT";
    ui.display.textContent = displayMode === "DOT" ? "DOT" : "123";
  });

  ui.modeBtn.addEventListener("click", () => {
    if (mode !== "menu" && ui.overlay.classList.contains("hidden")) {
      setStatus("RESTART TO SWITCH MODE");
      return;
    }

    playMode = playMode === "DOUBT" ? "ZEN" : "DOUBT";
    ui.modeBtn.textContent = playMode;
    setStatus(playMode === "ZEN" ? "ZEN MODE" : "DOUBT MODE");
    syncUI();
  });

  ui.periodBtn.addEventListener("click", () => {
    cycleLeaderboardPeriod();
  });

  ui.themeBtn.addEventListener("click", () => {
    cycleTheme();
  });

  ui.mute.addEventListener("click", () => {
    muted = !muted;
    ui.mute.textContent = muted ? "SOUND OFF" : "SOUND";
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && panelOpen) {
      setPanelOpen(false);
    }
  });

  applyTheme(theme);
  resize();
  syncUI();
  syncRankButtons();
  ui.startNameInput.placeholder = anonymousPlayerName();
  refreshStartNameState();
  refreshPanels().catch(() => {
    setApiState("API OFFLINE");
  });
  requestAnimationFrame(loop);
})();
