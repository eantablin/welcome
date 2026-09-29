// =====================================================================
// BRUTAL WORDLE — brutalist word-guessing game.
// Freeplay: random common 5-letter word each game, 6 guesses.
// Common-word list embedded below (no proper nouns).
// WebAudio synthesized SFX. Stats persisted in localStorage.
// Pure logic (checkGuess) exercised by scripts/smoke-wordle.mjs.
// =====================================================================

(() => {
  "use strict";

  // ── theme (respects site-wide dark mode) ─────────────────────────────
  const root = document.documentElement;
  root.dataset.theme =
    localStorage.getItem("theme") ??
    (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");

  // ── audio (synth only, gated behind user gesture) ─────────────────────
  let audioCtx = null;
  let soundOn = false;

  const beep = (freq, dur = 0.08, type = "square", gain = 0.08) => {
    if (!soundOn || !audioCtx) return;
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + dur);
  };

  const typeSfx = () => beep(300, 0.03, "square", 0.04);
  const markSfx = () => { beep(520, 0.06, "square", 0.05); setTimeout(() => beep(440, 0.05, "square", 0.04), 70); };
  const winSfx = () => { beep(660, 0.08); setTimeout(() => beep(990, 0.1), 90); setTimeout(() => beep(1320, 0.12), 180); };
  const loseSfx = () => { beep(150, 0.25, "sawtooth", 0.1); setTimeout(() => beep(110, 0.3, "sawtooth", 0.09), 100); };

  const unlockAudio = () => {
    if (!audioCtx) {
      try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch { /* no audio */ }
    }
    audioCtx?.resume?.();
  };

  // ── pure game logic (also exercised by scripts/smoke-wordle.mjs) ─────
  // verdicts: "correct" (right letter + position) | "present" (letter in
  // answer, wrong spot) | "absent". Duplicate-safe two-pass algorithm.
  function checkGuess(guess, answer) {
    const verdict = new Array(5).fill("absent");
    const remaining = {};
    for (let i = 0; i < 5; i++) {
      if (guess[i] === answer[i]) verdict[i] = "correct";
      else remaining[answer[i]] = (remaining[answer[i]] ?? 0) + 1;
    }
    for (let i = 0; i < 5; i++) {
      if (verdict[i] === "correct") continue;
      if (remaining[guess[i]] > 0) {
        verdict[i] = "present";
        remaining[guess[i]]--;
      }
    }
    return verdict;
  }

  const isWin = (verdict) => verdict.every((v) => v === "correct");

  // ── embedded common words (~300) — answers come from this pool ───────
  const WORDS =
    "ABEND ABORT ACHES ACORN ADEPT ADIEU ADIOS ADMIT AERIE AGENT AGONY AHOYS " +
    "ALTAR AMPLY ANNOY ANTED ANTES ANTSY APORT AREAS ARIAS ASKEW ASTIR ATLAS " +
    "ATONE AUTOS AVANT AXING AXLED BADGE BARDS BARER BARFS BARON BELAY BELLI " +
    "BESOT BETHS BHOYS BINGE BITCH BLAHS BLIPS BLOND BOCCE BOGEY BONES BOOBY " +
    "BOOST BOOTS BOWER BRAWN BREAM BRIER BRUNT BUFFO BUILT BUMPY BUNKO BURET " +
    "BURNT BURST BUTTS CADRE CAGEY CARES CARPS CASAS CASTS CEDES CELEB CHALK " +
    "CHAOS CHOIR CHUTE CLUED COEDS CONED CORMS COVER CRAZE CREED CROCS CRONE " +
    "CROOK CRUST CUBBY CUBER CULLS CUPPY CUSPY DANCE DEEDS DELIS DELLS DIVED " +
    "DOLTS DOOMS DOVEY DOWEL DOZEN DRAIN DROLL DUNCE DUPES DWELT EASES ETUDE " +
    "EXCON FACTO FATAL FEMME FETES FEWER FILAR FLAGS FLAIL FLICK FLITS FLUFF " +
    "FLUID FOIST FORMS FORUM FOUNT FOXED FOXES FOYER FRIAR GAMUT GAUGE GAYLY " +
    "GISMO GLUER GLYPH GONGS GOOSY GRAPY GROAT GROUP GROVE GUEST GUISE GUNKS " +
    "HANGS HAPPY HEMPY HIKER HOLED HONER HOODS HOOEY HOPER HOVEL HUMPF HUNTS " +
    "HYMEN IAMBS ILEUS INDEX INFRA INNER INODE INURE ISSUE JAILS JANES JAUNT " +
    "JEANS JIVES JOWLY JUICY KENAF KITED KITTY KLIEG KNEAD KNIFE LACKS LAMER " +
    "LAPIN LEGOS LEMMA LEMME LIARS LIMED LIMEN LINKS LOADS LOYAL MACER MAMAS " +
    "MICKS MONEY MOORS NADIR NEWTS NONES NORTH NOSED NUKED PANGA PAYEE PEAKS " +
    "PLIES PLINK PLUMS POXED PUBIC PUPPY RAGED RATIO REALS REARS ROGUE ROWED " +
    "RUGBY RULER RUNTS SALLY SAUCE SCOPS SCROD SCRUM SCUDI SCUDS SCUZZ SECCO " +
    "SEIZE SEXES SHEER SHEIK SHELL SHEWS SIDES SIEGE SIFTS SIGHT SIXES SNAKE " +
    "SOAKS SOMAS SPARK SPELL SPIES SPITE SPLAY SPOTS SQUAD STAMP STARE STATS " +
    "STEED STOLE STORE STYLE SUGAR SUITE SURLY SWATH SWISS TABOO TAGUA TAMPS " +
    "TAPED TARDY TATTY TAXER TAXES TEARS TEATS TEMPT TESTY TEXTS THING TIGER " +
    "TIKES TIRED TOWNS TRACK TWEAK TYROS ULCER UNTIE VENDS WAKED WANTA WARTS " +
    "WELCH WESTS WHIRR WHIST WHOLE WILED WILLS WOOSH YESES YIELD YUCCA ZINGS";

  const CONTIGUOUS = /^[A-Z]{5}$/; // per-token shape check
  const LIST = WORDS.split(/\s+/).filter((w) => CONTIGUOUS.test(w));

  // ── DOM ──────────────────────────────────────────────────────────────
  const $ = (id) => document.getElementById(id);
  const els = {
    statsChip: $("statsChip"), grid: $("grid"), msg: $("msg"), keys: $("keys"),
    overlay: $("overlay"), overlayTitle: $("overlayTitle"), overlaySub: $("overlaySub"),
    overlayScore: $("overlayScore"), installHint: $("installHint"),
    startBtn: $("startBtn"), soundBtn: $("soundBtn"),
  };

  // ── constants / persisted stats ──────────────────────────────────────
  const ROWS = 6, COLS = 5;
  const KEY_ROWS = [
    [..."QWERTYUIOP"],
    [..."ASDFGHJKL"],
    ["ENTER", ..."ZXCVBNM", "DEL"],
  ];
  const LETTER_KEYS = [..."QWERTYUIOPASDFGHJKLZXCVBNM"];

  let answer, row, col, guesses, playing;
  const stats = JSON.parse(localStorage.getItem("wordle_stats") ?? '{"w":0,"l":0}');
  const syncStats = () => localStorage.setItem("wordle_stats", JSON.stringify(stats));
  const showStats = () => { els.statsChip.textContent = `W${stats.w} L${stats.l}`; };
  showStats();

  // ── grid population ─────────────────────────────────────────────────
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      const cell = document.createElement("div");
      cell.className = "cell";
      els.grid.appendChild(cell);
    }
  const grid = [];
  for (let r = 0; r < ROWS; r++) grid.push([...els.grid.children].slice(r * COLS, (r + 1) * COLS));

  const keyEls = {};
  for (const rowSpec of KEY_ROWS) {
    const rowEl = document.createElement("div");
    rowEl.className = "keys__row";
    els.keys.appendChild(rowEl);
    for (const label of rowSpec) {
      const k = document.createElement("button");
      k.type = "button";
      k.className = "key" + (label.length > 1 ? " key--wide" : "");
      k.textContent = label;
      k.addEventListener("click", () => {
        unlockAudio();
        if (label === "ENTER") submit();
        else if (label === "DEL") backspace();
        else typeLetter(label);
      });
      rowEl.appendChild(k);
      keyEls[label] = k;
    }
  }

  // ── helpers ─────────────────────────────────────────────────────────
  const setCell = (r, c, ch, cls) => {
    const cell = grid[r][c];
    cell.textContent = ch;
    cell.className = "cell" + (cls ? " cell--" + cls : "");
  };

  const markKeys = (guess, verdict) => {
    for (let i = 0; i < 5; i++) {
      const k = keyEls[guess[i]];
      // keep strongest verdict already shown for this key
      const rank = { absent: 0, present: 1, correct: 2 };
      const old = k.classList.contains("key--correct") ? 2
        : k.classList.contains("key--present") ? 1
        : k.classList.contains("key--absent") ? 0 : -1;
      if (old < rank[verdict[i]]) {
        k.classList.remove("key--filled", "key--present", "key--absent", "key--exact");
        k.classList.add(`key--${verdict[i]}`);
      }
    }
  };

  const resetKeys = () => {
    for (const l of LETTER_KEYS) {
      const k = keyEls[l];
      k.classList.remove("key--filled", "key--present", "key--absent", "key--exact");
    }
  };

  const pickAnswer = () => LIST[Math.floor(Math.random() * LIST.length)];
  const overlayVisible = () => els.overlay.style.display !== "none";

  const reset = () => {
    answer = pickAnswer();
    row = 0;
    col = 0;
    guesses = [];
    playing = true;
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) setCell(r, c, "");
    resetKeys();
    els.msg.textContent = "GUESS THE 5-LETTER WORD";
  };

  // ── game flow ───────────────────────────────────────────────────────
  const start = () => {
    unlockAudio();
    reset();
    playing = true;
    els.overlay.style.display = "none";
  };

  const endGame = (won) => {
    playing = false;
    if (won) { stats.w++; winSfx(); }
    else { stats.l++; loseSfx(); }
    syncStats();
    showStats();
    els.overlayTitle.innerHTML = won ? "SOLVED" : "OUT OF<br>TRIES";
    els.overlaySub.textContent = won ? `IN ${guesses.length} ${guesses.length === 1 ? "TRY" : "TRIES"} — NEW WORD?` : `THE WORD WAS ${answer}`;
    els.overlayScore.textContent = `${stats.w}W / ${stats.l}L`;
    els.overlayScore.hidden = false;
    els.overlay.style.display = "";
  };

  const submit = () => {
    if (!playing || col < COLS) {
      if (playing) els.msg.textContent = `NOT ENOUGH LETTERS (${col}/5)`;
      return;
    }
    let guess = "";
    for (let c = 0; c < COLS; c++) guess += grid[row][c].textContent;
    const inList = LIST.includes(guess);
    if (!inList) {
      els.msg.textContent = `${guess} — NOT IN LIST (STILL COUNTS)`;
    } else {
      els.msg.textContent = "";
    }
    const verdict = checkGuess(guess, answer);
    for (let c = 0; c < COLS; c++) {
      setCell(row, c, guess[c], verdict[c]);
    }
    markKeys(guess, verdict);
    guesses.push({ guess, verdict });
    markSfx();
    if (isWin(verdict)) { endGame(true); return; }
    row++;
    if (row >= ROWS) { endGame(false); return; }
    col = 0;
  };

  const typeLetter = (l) => {
    if (!playing || overlayVisible() || col >= COLS) return;
    grid[row][col].textContent = l;
    grid[row][col].classList.add("cell--filled");
    col++;
    typeSfx();
  };

  const backspace = () => {
    if (!playing || overlayVisible() || col <= 0) return;
    col--;
    setCell(row, col, "");
  };

  document.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "Enter") { e.preventDefault(); overlayVisible() ? start() : submit(); }
    else if (e.key === "Backspace") { e.preventDefault(); if (!overlayVisible()) backspace(); }
    else if (/^[a-zA-Z]$/.test(e.key)) { e.preventDefault(); if (!overlayVisible()) typeLetter(e.key.toUpperCase()); }
  });

  els.startBtn.addEventListener("click", start);

  // sound toggle
  els.soundBtn.addEventListener("click", () => {
    soundOn = !soundOn;
    els.soundBtn.setAttribute("aria-pressed", String(soundOn));
    els.soundBtn.textContent = `SOUND: ${soundOn ? "ON" : "OFF"}`;
    if (soundOn && !audioCtx) {
      try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch { /* no audio */ }
    }
  });

  // ── boot ─────────────────────────────────────────────────────────────
  playing = false;
  registerSW();
})();

// ── service worker (kept outside the IIFE so failures don't kill the game) ──
function registerSW() {
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("sw.js").catch(() => { /* offline cache unavailable */ });
  }
}
