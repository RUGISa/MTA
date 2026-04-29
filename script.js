const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const startScreen = document.getElementById("startScreen");
const settingScreen = document.getElementById("settingScreen");
const resumeBtn = document.getElementById("resumeBtn");

const sensitivitySlider = document.getElementById("sensitivitySlider");
const brightnessSlider = document.getElementById("brightnessSlider");

const keys = {};
const mouse = { dx: 0 };

const CONFIG = {
  moveSpeed: 0.024,
  runSpeed: 0.04,

  tiredSpeedRate: 0.5,
  tiredTime: 300,
  tiredShakePower: 12,
  tiredRecoverRate: 0.5,

  staminaMax: 25,
  staminaRecover: 0.25,
  staminaRecoverDelay: 60,

  runStaminaCost: 0.45,
  dodgeStaminaCost: 12,
  runHoldTime: 14,
  runReadyStamina: 6,

  dodgeTime: 12,
  dodgeSpeed: 0.07,
  dodgeCooldownMax: 8,

  rotSpeed: 0.0018,
  fov: 70,
  rayCount: 320,
  rayDepth: 20,

  maxStage: 10
};

const SHOP_ITEMS = {
  staminaMax1: {
    name: "최대 스태미나 증가 Lv.1",
    desc: "최대 스태미나가 5 증가합니다.",
    cost: 3
  },
  staminaMax2: {
    name: "최대 스태미나 증가 Lv.2",
    desc: "최대 스태미나가 추가로 5 증가합니다.",
    cost: 5,
    require: "staminaMax1"
  },
  staminaMax3: {
    name: "최대 스태미나 증가 Lv.3",
    desc: "최대 스태미나가 추가로 10 증가합니다.",
    cost: 7,
    require: "staminaMax2"
  },
  staminaRecover1: {
    name: "스태미나 회복 증가 Lv.1",
    desc: "스태미나 회복 속도가 증가합니다.",
    cost: 3
  },
  staminaRecover2: {
    name: "스태미나 회복 증가 Lv.2",
    desc: "스태미나 회복 속도가 한 번 더 증가합니다.",
    cost: 5,
    require: "staminaRecover1"
  },
  tiredDown1: {
    name: "탈진 시간 감소 Lv.1",
    desc: "탈진 상태의 지속 시간이 감소합니다.",
    cost: 4
  },
  exitSensor1: {
    name: "출구 근처 알림",
    desc: "출구 근처에 도착하면 알림이 표시됩니다.",
    cost: 3
  }
};

const SAVE_KEY = "maze_time_attack_save";

let audioCtx = null;

let gameStarted = false;
let settingOpen = false;
let loopStarted = false;
let previewLoopStarted = false;

let gameMode = "normal";
let speedrunStartTime = 0;

let countdownActive = false;
let countdownStartTime = 0;
let countdownCallback = null;

let stagePage = 0;

let currentStage = 1;
let mazeSize = 2;

let stageStartTime = 0;
let clearTime = 0;

let sensitivity = 0.75;
let brightness = 1;

let x = 1.5;
let y = 1.5;
let dir = 0;

let mapW = 0;
let mapH = 0;
let level = [];

let stamina = CONFIG.staminaMax;
let staminaIdleTimer = 0;
let staminaRecoveryStarted = true;

let tiredTimer = 0;
let tiredShakeTimer = 0;

let spaceHold = 0;
let prevSpace = false;
let spaceStartedRunning = false;

let isRunning = false;
let canRun = true;

let isDodging = false;
let dodgeTimer = 0;
let dodgeCooldown = 0;
let dodgeVecX = 0;
let dodgeVecY = 0;

let camBob = 0;
let camFovAdd = 0;

let previewReady = false;
let previewDir = 0;

let saveData = {
  unlockedStage: 1,
  stages: {},
  upgrades: {},
  speedrunUnlocked: false,
  bestSpeedrun: null
};

function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }

  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }

  return audioCtx;
}

function unlockAudio() {
  const ctxAudio = getAudioContext();

  const osc = ctxAudio.createOscillator();
  const gain = ctxAudio.createGain();

  gain.gain.value = 0.0001;

  osc.connect(gain);
  gain.connect(ctxAudio.destination);

  osc.start();
  osc.stop(ctxAudio.currentTime + 0.02);
}

function playPantSound() {
  const ctxAudio = getAudioContext();

  for (let i = 0; i < 5; i++) {
    const startTime = ctxAudio.currentTime + i * 0.65;

    const bufferSize = Math.floor(ctxAudio.sampleRate * 0.38);
    const buffer = ctxAudio.createBuffer(1, bufferSize, ctxAudio.sampleRate);
    const data = buffer.getChannelData(0);

    for (let j = 0; j < bufferSize; j++) {
      data[j] = (Math.random() * 2 - 1) * 0.75;
    }

    const noise = ctxAudio.createBufferSource();
    noise.buffer = buffer;

    const filter = ctxAudio.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 680;
    filter.Q.value = 0.85;

    const gain = ctxAudio.createGain();
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(0.45, startTime + 0.06);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.38);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctxAudio.destination);

    noise.start(startTime);
    noise.stop(startTime + 0.42);
  }
}

function loadSave() {
  const raw = localStorage.getItem(SAVE_KEY);

  if (!raw) {
    return;
  }

  try {
    const data = JSON.parse(raw);

    saveData = {
      unlockedStage: data.unlockedStage || 1,
      stages: data.stages || {},
      upgrades: data.upgrades || {},
      speedrunUnlocked: data.speedrunUnlocked || false,
      bestSpeedrun: data.bestSpeedrun || null
    };

    if (isAllNormalStagesCleared()) {
      saveData.speedrunUnlocked = true;
      saveGame();
    }
  } catch {
    saveData = {
      unlockedStage: 1,
      stages: {},
      upgrades: {},
      speedrunUnlocked: false,
      bestSpeedrun: null
    };
  }
}

function saveGame() {
  localStorage.setItem(SAVE_KEY, JSON.stringify(saveData));
}

function isAllNormalStagesCleared() {
  for (let stage = 1; stage <= CONFIG.maxStage; stage++) {
    if (!saveData.stages[stage]) {
      return false;
    }
  }

  return true;
}

function hasUpgrade(id) {
  return !!saveData.upgrades[id];
}

function getTotalStars() {
  let total = 0;

  for (let stage = 1; stage <= CONFIG.maxStage; stage++) {
    const record = saveData.stages[stage];

    if (record) {
      total += record.stars || 0;
    }
  }

  return total;
}

function getSpentStars() {
  let spent = 0;

  for (const id in SHOP_ITEMS) {
    if (hasUpgrade(id)) {
      spent += SHOP_ITEMS[id].cost;
    }
  }

  return spent;
}

function getAvailableStars() {
  return getTotalStars() - getSpentStars();
}

function canBuyUpgrade(id) {
  const item = SHOP_ITEMS[id];

  if (!item) return false;
  if (hasUpgrade(id)) return false;
  if (item.require && !hasUpgrade(item.require)) return false;

  return getAvailableStars() >= item.cost;
}

function buyUpgrade(id) {
  if (!canBuyUpgrade(id)) return;

  saveData.upgrades[id] = true;
  saveGame();

  stamina = Math.min(stamina, getMaxStamina());

  renderShop();
}

function getMaxStamina() {
  let value = CONFIG.staminaMax;

  if (hasUpgrade("staminaMax1")) value += 5;
  if (hasUpgrade("staminaMax2")) value += 5;
  if (hasUpgrade("staminaMax3")) value += 10;

  return value;
}

function getStaminaRecover() {
  let value = CONFIG.staminaRecover;

  if (hasUpgrade("staminaRecover1")) value *= 1.18;
  if (hasUpgrade("staminaRecover2")) value *= 1.35;

  return value;
}

function getTiredTime() {
  let value = CONFIG.tiredTime;

  if (hasUpgrade("tiredDown1")) value *= 0.75;

  return Math.floor(value);
}

function hasExitSensor() {
  return hasUpgrade("exitSensor1");
}

function getStarLimit(stage) {
  return {
    three: 12000 + stage * 4000,
    two: 20000 + stage * 6000,
    one: 35000 + stage * 8000
  };
}

function getStarRuleText(stage) {
  const limit = getStarLimit(stage);

  return (
    `★★★ ${formatTime(limit.three)} 이내\n` +
    `★★☆ ${formatTime(limit.two)} 이내\n` +
    `★☆☆ ${formatTime(limit.one)} 이내`
  );
}

function calculateStars(stage, time) {
  const limit = getStarLimit(stage);

  if (time <= limit.three) return 3;
  if (time <= limit.two) return 2;
  if (time <= limit.one) return 1;

  return 0;
}

function formatTime(ms) {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const milliseconds = Math.floor(ms % 1000);

  return (
    String(minutes).padStart(2, "0") +
    ":" +
    String(seconds).padStart(2, "0") +
    "." +
    String(milliseconds).padStart(3, "0")
  );
}

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

function degToRad(deg) {
  return deg * Math.PI / 180;
}

function cosd(deg) {
  return Math.cos(degToRad(deg));
}

function sind(deg) {
  return Math.sin(degToRad(deg));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function randInt(max) {
  return Math.floor(Math.random() * (max + 1));
}

function isWalkable(tx, ty) {
  if (tx < 0 || tx >= mapW || ty < 0 || ty >= mapH) return false;
  return level[ty][tx] === 0 || level[ty][tx] === 3;
}

function clearInputState() {
  for (const key in keys) {
    keys[key] = false;
  }

  mouse.dx = 0;
  prevSpace = false;
  spaceHold = 0;
  spaceStartedRunning = false;
  isRunning = false;
}

function setMenuHTML(html) {
  startScreen.innerHTML = html;
}

function ensureExitButton() {
  if (!settingScreen || document.getElementById("exitStageBtn")) return;

  const exitBtn = document.createElement("button");
  exitBtn.id = "exitStageBtn";
  exitBtn.textContent = "나가기";
  exitBtn.style.width = "100%";
  exitBtn.style.marginTop = "10px";
  exitBtn.style.padding = "14px 18px";
  exitBtn.style.border = "none";
  exitBtn.style.borderRadius = "16px";
  exitBtn.style.background = "#222";
  exitBtn.style.color = "white";
  exitBtn.style.fontSize = "16px";
  exitBtn.style.fontWeight = "bold";
  exitBtn.style.cursor = "pointer";

  exitBtn.addEventListener("click", exitToMainMenu);

  const innerBox = settingScreen.querySelector("div") || settingScreen;
  innerBox.appendChild(exitBtn);
}

function exitToMainMenu() {
  gameStarted = false;
  settingOpen = false;
  loopStarted = false;
  countdownActive = false;
  countdownCallback = null;

  settingScreen.classList.add("hidden");
  startScreen.classList.remove("hidden");

  clearInputState();

  if (document.pointerLockElement === canvas) {
    document.exitPointerLock();
  }

  generatePreviewRoom();
  renderMainMenu();
  startPreviewLoop();
}

function showMenuScreen() {
  startScreen.classList.remove("hidden");
  settingScreen.classList.add("hidden");

  gameStarted = false;
  settingOpen = false;
  countdownActive = false;
  countdownCallback = null;

  clearInputState();

  if (document.pointerLockElement === canvas) {
    document.exitPointerLock();
  }

  generatePreviewRoom();
  startPreviewLoop();
}

function openSettings(exitLock = true) {
  settingOpen = true;
  settingScreen.classList.remove("hidden");
  ensureExitButton();
  clearInputState();

  if (exitLock && document.pointerLockElement === canvas) {
    document.exitPointerLock();
  }
}

function closeSettings() {
  settingOpen = false;
  settingScreen.classList.add("hidden");
  clearInputState();

  setTimeout(() => {
    if (gameStarted && !settingOpen) {
      canvas.requestPointerLock();
    }
  }, 0);
}

function renderMainMenu() {
  const speedrunBest = saveData.bestSpeedrun
    ? `BEST ${formatTime(saveData.bestSpeedrun)}`
    : "BEST --:--.---";

  setMenuHTML(`
    <div class="menu-box">
      <h1 class="menu-title">MAZE TIME ATTACK</h1>

      <div class="menu-buttons">
        <button id="normalModeBtn">일반 모드</button>
        <button id="speedrunModeBtn" ${saveData.speedrunUnlocked ? "" : "disabled"}>
          스피드런 모드
          <br>
          <span style="font-size:13px; font-weight:500;">
            ${saveData.speedrunUnlocked ? speedrunBest : "일반 모드 1~10 클리어 후 해금"}
          </span>
        </button>
        <button id="shopMenuBtn">상점</button>
        <button id="inventoryMenuBtn">인벤토리</button>
      </div>
    </div>
  `);

  document.getElementById("normalModeBtn").addEventListener("click", () => {
    unlockAudio();
    gameMode = "normal";
    stagePage = 0;
    renderStageSelect();
  });

  document.getElementById("speedrunModeBtn").addEventListener("click", () => {
    if (!saveData.speedrunUnlocked) return;

    unlockAudio();
    startSpeedrunWithCountdown();
  });

  document.getElementById("shopMenuBtn").addEventListener("click", renderShop);
  document.getElementById("inventoryMenuBtn").addEventListener("click", renderInventory);
}

function renderStageSelect() {
  const pageStart = stagePage === 0 ? 1 : 6;
  const pageEnd = stagePage === 0 ? 5 : 10;

  let html = `
    <div class="menu-box">
      <h1 class="menu-title">일반 모드</h1>
      <p class="menu-subtitle">
        스테이지 위에 마우스를 올리면 별 획득 기준을 확인할 수 있습니다.
      </p>

      <div class="stage-page-wrap">
        <button id="prevPageBtn" class="page-arrow" ${stagePage === 0 ? "disabled" : ""}>◀</button>

        <div class="stage-grid">
  `;

  for (let stage = pageStart; stage <= pageEnd; stage++) {
    const unlocked = stage <= saveData.unlockedStage;
    const record = saveData.stages[stage];

    const bestTime = record ? formatTime(record.bestTime) : "--:--.---";
    const stars = record
      ? "★".repeat(record.stars) + "☆".repeat(3 - record.stars)
      : "☆☆☆";

    html += `
      <button class="stageBtn" data-stage="${stage}" title="${getStarRuleText(stage)}" ${unlocked ? "" : "disabled"}>
        ${unlocked ? `STAGE ${stage}` : "LOCKED"}
        <br>
        ${stars}
        <br>
        ${bestTime}
      </button>
    `;
  }

  html += `
        </div>

        <button id="nextPageBtn" class="page-arrow" ${stagePage === 1 ? "disabled" : ""}>▶</button>
      </div>

      <button id="backMainBtn" class="menu-back">뒤로</button>
    </div>
  `;

  setMenuHTML(html);

  document.getElementById("backMainBtn").addEventListener("click", renderMainMenu);

  document.getElementById("prevPageBtn").addEventListener("click", () => {
    stagePage = 0;
    renderStageSelect();
  });

  document.getElementById("nextPageBtn").addEventListener("click", () => {
    stagePage = 1;
    renderStageSelect();
  });

  document.querySelectorAll(".stageBtn").forEach((button) => {
    button.addEventListener("click", () => {
      const stage = Number(button.dataset.stage);

      if (stage <= saveData.unlockedStage) {
        unlockAudio();
        gameMode = "normal";
        startStage(stage);
      }
    });
  });
}

function renderShop() {
  let shopButtons = "";

  for (const id in SHOP_ITEMS) {
    const item = SHOP_ITEMS[id];
    const owned = hasUpgrade(id);
    const locked = item.require && !hasUpgrade(item.require);
    const enough = getAvailableStars() >= item.cost;

    let status = `${item.cost}★`;

    if (owned) {
      status = "구매 완료";
    } else if (locked) {
      status = "이전 단계 필요";
    } else if (!enough) {
      status = "별 부족";
    }

    shopButtons += `
      <button class="shopItemBtn" data-upgrade="${id}" ${owned || locked || !enough ? "disabled" : ""}>
        ${item.name}
        <br>
        <span style="font-size:13px; font-weight:500;">${item.desc}</span>
        <br>
        ${status}
      </button>
    `;
  }

  setMenuHTML(`
    <div class="menu-box">
      <h1 class="menu-title">상점</h1>
      <p class="menu-subtitle">
        총 획득 별: ${getTotalStars()}개 / 사용한 별: ${getSpentStars()}개 / 사용 가능 별: ${getAvailableStars()}개
      </p>

      <div class="menu-buttons">
        ${shopButtons}
      </div>

      <br>
      <button id="backMainBtn" class="menu-back">뒤로</button>
    </div>
  `);

  document.querySelectorAll(".shopItemBtn").forEach((button) => {
    button.addEventListener("click", () => {
      buyUpgrade(button.dataset.upgrade);
    });
  });

  document.getElementById("backMainBtn").addEventListener("click", renderMainMenu);
}

function renderInventory() {
  setMenuHTML(`
    <div class="menu-box">
      <h1 class="menu-title">인벤토리</h1>
      <p class="menu-subtitle">보유 아이템을 확인하는 공간입니다.</p>

      <p class="inventory-text">
        최대 스태미나: ${getMaxStamina()}<br>
        스태미나 회복량: ${getStaminaRecover().toFixed(2)}<br>
        탈진 시간: ${getTiredTime()}<br>
        출구 근처 알림: ${hasExitSensor() ? "보유" : "미보유"}
      </p>

      <button id="backMainBtn" class="menu-back">뒤로</button>
    </div>
  `);

  document.getElementById("backMainBtn").addEventListener("click", renderMainMenu);
}

function renderClearScreen(stage, time, stars, isNewBest) {
  showMenuScreen();

  setMenuHTML(`
    <div class="menu-box">
      <h1 class="menu-title">STAGE ${stage} CLEAR</h1>
      <p class="menu-subtitle">클리어 타임</p>

      <h2>${formatTime(time)}</h2>
      <h2>${"★".repeat(stars)}${"☆".repeat(3 - stars)}</h2>
      <p class="menu-subtitle">${isNewBest ? "NEW BEST!" : "기록 저장 완료"}</p>

      <div class="menu-buttons">
        <button id="retryStageBtn">다시 도전</button>
        <button id="nextStageBtn">다음 스테이지</button>
        <button id="stageSelectBtn">스테이지 선택</button>
        <button id="mainMenuBtn">메인화면</button>
      </div>
    </div>
  `);

  const nextBtn = document.getElementById("nextStageBtn");

  if (stage >= CONFIG.maxStage) {
    nextBtn.textContent = "마지막 스테이지 클리어";
    nextBtn.disabled = true;
  }

  document.getElementById("retryStageBtn").addEventListener("click", () => {
    unlockAudio();
    gameMode = "normal";
    startStage(stage);
  });

  nextBtn.addEventListener("click", () => {
    if (stage < CONFIG.maxStage) {
      unlockAudio();
      gameMode = "normal";
      startStage(stage + 1);
    }
  });

  document.getElementById("stageSelectBtn").addEventListener("click", () => {
    stagePage = stage <= 5 ? 0 : 1;
    renderStageSelect();
  });

  document.getElementById("mainMenuBtn").addEventListener("click", renderMainMenu);
}

function startCountdown(callback) {
  countdownActive = true;
  countdownStartTime = performance.now();
  countdownCallback = callback;

  startScreen.classList.add("hidden");
  settingScreen.classList.add("hidden");

  gameStarted = true;
  settingOpen = false;

  clearInputState();
  canvas.requestPointerLock();

  if (!loopStarted) {
    loopStarted = true;
    requestAnimationFrame(gameLoop);
  }
}

function updateCountdown() {
  if (!countdownActive) return;

  const elapsed = performance.now() - countdownStartTime;

  if (elapsed >= 3000) {
    countdownActive = false;

    const callback = countdownCallback;
    countdownCallback = null;

    if (callback) {
      callback();
    }
  }
}

function drawCountdown(w, h) {
  if (!countdownActive) return;

  const elapsed = performance.now() - countdownStartTime;
  const left = Math.ceil((3000 - elapsed) / 1000);

  ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = "white";
  ctx.textAlign = "center";
  ctx.font = "bold 96px Arial";

  if (left > 0) {
    ctx.fillText(String(left), w / 2, h / 2);
  } else {
    ctx.fillText("GO", w / 2, h / 2);
  }

  ctx.textAlign = "left";
}

function startSpeedrunWithCountdown() {
  gameMode = "speedrun";
  currentStage = 1;
  mazeSize = 2;

  resetStageState();
  generateMaze(mazeSize);

  startCountdown(() => {
    speedrunStartTime = performance.now();
    stageStartTime = performance.now();
  });
}

function startSpeedrun() {
  gameMode = "speedrun";
  currentStage = 1;
  speedrunStartTime = performance.now();
  startStage(1);
}

function retrySpeedrun() {
  if (gameMode !== "speedrun") return;

  unlockAudio();
  gameMode = "speedrun";
  currentStage = 1;
  mazeSize = 2;

  resetStageState();
  generateMaze(mazeSize);

  startCountdown(() => {
    speedrunStartTime = performance.now();
    stageStartTime = performance.now();
  });
}

function finishSpeedrun() {
  const totalTime = performance.now() - speedrunStartTime;
  const isNewBest = !saveData.bestSpeedrun || totalTime < saveData.bestSpeedrun;

  if (isNewBest) {
    saveData.bestSpeedrun = totalTime;
    saveGame();
  }

  showMenuScreen();

  setMenuHTML(`
    <div class="menu-box">
      <h1 class="menu-title">SPEEDRUN CLEAR</h1>
      <p class="menu-subtitle">1~10 스테이지 연속 클리어</p>

      <h2>${formatTime(totalTime)}</h2>
      <p class="menu-subtitle">${isNewBest ? "NEW BEST!" : `BEST ${formatTime(saveData.bestSpeedrun)}`}</p>

      <div class="menu-buttons">
        <button id="retrySpeedrunBtn">다시 도전</button>
        <button id="mainMenuBtn">메인화면</button>
      </div>
    </div>
  `);

  document.getElementById("retrySpeedrunBtn").addEventListener("click", () => {
    unlockAudio();
    startSpeedrunWithCountdown();
  });

  document.getElementById("mainMenuBtn").addEventListener("click", renderMainMenu);
}

function startStage(stage) {
  unlockAudio();

  currentStage = stage;
  mazeSize = stage + 1;

  startScreen.classList.add("hidden");
  settingScreen.classList.add("hidden");

  gameStarted = true;
  settingOpen = false;

  resetStageState();
  generateMaze(mazeSize);

  stageStartTime = performance.now();

  clearInputState();
  canvas.requestPointerLock();

  if (!loopStarted) {
    loopStarted = true;
    requestAnimationFrame(gameLoop);
  }
}

function startNextSpeedrunStage() {
  const keepW = keys.KeyW;
  const keepA = keys.KeyA;
  const keepS = keys.KeyS;
  const keepD = keys.KeyD;
  const keepSpace = keys.Space;

  currentStage++;
  mazeSize = currentStage + 1;

  resetStageState();
  generateMaze(mazeSize);

  stageStartTime = performance.now();

  keys.KeyW = keepW;
  keys.KeyA = keepA;
  keys.KeyS = keepS;
  keys.KeyD = keepD;
  keys.Space = keepSpace;

  mouse.dx = 0;
}

function resetStageState() {
  stamina = getMaxStamina();
  staminaIdleTimer = 0;
  staminaRecoveryStarted = true;

  tiredTimer = 0;
  tiredShakeTimer = 0;

  canRun = true;
  isRunning = false;
  isDodging = false;

  dodgeTimer = 0;
  dodgeCooldown = 0;

  camBob = 0;
  camFovAdd = 0;
}

function generateMaze(size) {
  mapW = size * 2 + 1;
  mapH = size * 2 + 1;

  level = Array.from({ length: mapH }, () => Array(mapW).fill(1));

  const visited = Array.from({ length: size }, () => Array(size).fill(false));
  const stack = [];

  visited[0][0] = true;
  level[1][1] = 0;

  stack.push({ x: 0, y: 0 });

  const directions = [
    { x: 0, y: -1 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: -1, y: 0 }
  ];

  while (stack.length > 0) {
    const current = stack[stack.length - 1];
    const candidates = [];

    for (const direction of directions) {
      const nx = current.x + direction.x;
      const ny = current.y + direction.y;

      if (nx >= 0 && nx < size && ny >= 0 && ny < size && !visited[ny][nx]) {
        candidates.push({
          x: nx,
          y: ny,
          dx: direction.x,
          dy: direction.y
        });
      }
    }

    if (candidates.length === 0) {
      stack.pop();
      continue;
    }

    const next = candidates[randInt(candidates.length - 1)];

    const currentMapX = current.x * 2 + 1;
    const currentMapY = current.y * 2 + 1;

    const nextMapX = next.x * 2 + 1;
    const nextMapY = next.y * 2 + 1;

    const wallX = currentMapX + next.dx;
    const wallY = currentMapY + next.dy;

    level[wallY][wallX] = 0;
    level[nextMapY][nextMapX] = 0;

    visited[next.y][next.x] = true;
    stack.push({ x: next.x, y: next.y });
  }

  x = 1.5;
  y = 1.5;
  dir = 0;

  const exitX = mapW - 2;
  const exitY = mapH - 2;

  level[exitY][exitX] = 3;

  level[1][1] = 0;
  level[1][2] = 0;
  level[2][1] = 0;
}

function generatePreviewRoom() {
  mapW = 7;
  mapH = 7;

  level = Array.from({ length: mapH }, () => Array(mapW).fill(1));

  for (let yy = 1; yy <= 5; yy++) {
    for (let xx = 1; xx <= 5; xx++) {
      level[yy][xx] = 0;
    }
  }

  level[1][1] = 1;
  level[1][5] = 1;
  level[5][1] = 1;
  level[5][5] = 1;

  level[2][3] = 1;
  level[4][3] = 1;

  x = 3.5;
  y = 3.5;
  dir = 0;

  previewDir = 0;
  camBob = 0;
  camFovAdd = 0;
  previewReady = true;
}

function startPreviewLoop() {
  if (!previewLoopStarted) {
    previewLoopStarted = true;
    requestAnimationFrame(previewLoop);
  }
}

function previewLoop() {
  if (gameStarted) {
    previewLoopStarted = false;
    return;
  }

  previewDir += 0.08;
  dir = previewDir;

  camBob = 0;
  camFovAdd = 0;

  drawMenuPreview();

  requestAnimationFrame(previewLoop);
}

function drawMenuPreview() {
  const w = canvas.width;
  const h = canvas.height;

  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, w, h);

  const centerY = h / 2;
  const currentFov = CONFIG.fov;

  drawBackground(w, h, centerY);
  drawRaycast(w, h, centerY, currentFov);

  ctx.fillStyle = "rgba(0, 0, 0, 0.32)";
  ctx.fillRect(0, 0, w, h);
}

function movePlayer(nx, ny) {
  if (nx >= 0 && nx < mapW && isWalkable(Math.floor(nx), Math.floor(y))) {
    x = nx;
  }

  if (ny >= 0 && ny < mapH && isWalkable(Math.floor(x), Math.floor(ny))) {
    y = ny;
  }
}

function getMovementInput() {
  const fx = cosd(dir);
  const fy = sind(dir);
  const rx = cosd(dir + 90);
  const ry = sind(dir + 90);

  let inputX = 0;
  let inputY = 0;

  if (keys.KeyW) {
    inputX += fx;
    inputY += fy;
  }

  if (keys.KeyS) {
    inputX -= fx;
    inputY -= fy;
  }

  if (keys.KeyA) {
    inputX -= rx;
    inputY -= ry;
  }

  if (keys.KeyD) {
    inputX += rx;
    inputY += ry;
  }

  return {
    inputX,
    inputY,
    moving: inputX !== 0 || inputY !== 0,
    fx,
    fy
  };
}

function triggerTiredState() {
  tiredTimer = getTiredTime();
  tiredShakeTimer = 0;
  staminaRecoveryStarted = false;
  staminaIdleTimer = 0;
  playPantSound();
}

function updateTiredState() {
  if (tiredTimer > 0) {
    tiredTimer--;
    tiredShakeTimer += 0.28;
  } else {
    tiredShakeTimer = 0;
  }
}

function updateStaminaLock() {
  if (stamina <= 0) {
    stamina = 0;

    if (canRun && tiredTimer <= 0) {
      triggerTiredState();
    }

    canRun = false;
  }

  if (!canRun && stamina >= CONFIG.runReadyStamina) {
    canRun = true;
  }
}

function updateSpaceAction(inputX, inputY, moving, fx, fy) {
  const spaceNow = !!keys.Space;
  const spacePressed = spaceNow && !prevSpace;
  const spaceReleased = !spaceNow && prevSpace;

  if (spacePressed) {
    spaceHold = 0;
    spaceStartedRunning = false;
  }

  if (spaceNow) {
    spaceHold++;
  }

  isRunning = false;

  if (
    spaceNow &&
    spaceHold >= CONFIG.runHoldTime &&
    moving &&
    canRun &&
    !isDodging
  ) {
    isRunning = true;
    spaceStartedRunning = true;

    stamina -= CONFIG.runStaminaCost;

    if (stamina <= 0) {
      stamina = 0;
      canRun = false;
      isRunning = false;

      if (tiredTimer <= 0) {
        triggerTiredState();
      }
    }
  }

  if (spaceReleased) {
    tryDodge(inputX, inputY, fx, fy);

    spaceHold = 0;
    spaceStartedRunning = false;
  }

  prevSpace = spaceNow;
}

function tryDodge(inputX, inputY, fx, fy) {
  if (spaceStartedRunning) return;
  if (spaceHold <= 0 || spaceHold >= CONFIG.runHoldTime) return;
  if (isDodging || dodgeCooldown > 0) return;
  if (stamina < CONFIG.dodgeStaminaCost) return;

  let dx = inputX;
  let dy = inputY;

  if (dx === 0 && dy === 0) {
    dx = -fx;
    dy = -fy;
  }

  const len = Math.hypot(dx, dy);

  if (len > 0) {
    dodgeVecX = dx / len;
    dodgeVecY = dy / len;
  }

  stamina = Math.max(0, stamina - CONFIG.dodgeStaminaCost);

  isDodging = true;
  dodgeTimer = CONFIG.dodgeTime;
  dodgeCooldown = CONFIG.dodgeCooldownMax;
}

function updateStaminaRecovery(moving) {
  if (isRunning || isDodging) {
    return;
  }

  if (!staminaRecoveryStarted) {
    if (moving) {
      staminaIdleTimer = 0;
      return;
    }

    staminaIdleTimer++;

    if (staminaIdleTimer < CONFIG.staminaRecoverDelay) {
      return;
    }

    staminaRecoveryStarted = true;
  }

  let recoverAmount = getStaminaRecover();

  if (tiredTimer > 0) {
    recoverAmount *= CONFIG.tiredRecoverRate;
  }

  stamina = Math.min(getMaxStamina(), stamina + recoverAmount);

  if (stamina >= getMaxStamina()) {
    staminaIdleTimer = 0;
    staminaRecoveryStarted = true;
  }
}

function updateDodge() {
  const dodgeProgress = dodgeTimer / CONFIG.dodgeTime;
  let speed = CONFIG.dodgeSpeed * dodgeProgress;

  if (tiredTimer > 0) {
    speed *= CONFIG.tiredSpeedRate;
  }

  movePlayer(
    x + dodgeVecX * speed,
    y + dodgeVecY * speed
  );

  dodgeTimer--;

  if (dodgeTimer <= 0) {
    isDodging = false;
  }
}

function updateNormalMove(inputX, inputY) {
  const len = Math.hypot(inputX, inputY);

  if (len <= 0) return;

  let speed = isRunning ? CONFIG.runSpeed : CONFIG.moveSpeed;

  if (tiredTimer > 0) {
    speed *= CONFIG.tiredSpeedRate;
  }

  movePlayer(
    x + (inputX / len) * speed,
    y + (inputY / len) * speed
  );
}

function clearStage() {
  if (gameMode === "speedrun") {
    if (currentStage >= CONFIG.maxStage) {
      finishSpeedrun();
    } else {
      startNextSpeedrunStage();
    }

    return;
  }

  clearTime = performance.now() - stageStartTime;

  const stars = calculateStars(currentStage, clearTime);
  const oldRecord = saveData.stages[currentStage];

  let isNewBest = false;

  if (!oldRecord || clearTime < oldRecord.bestTime) {
    isNewBest = true;

    saveData.stages[currentStage] = {
      bestTime: clearTime,
      stars
    };
  } else if (stars > oldRecord.stars) {
    saveData.stages[currentStage].stars = stars;
  }

  if (currentStage < CONFIG.maxStage) {
    saveData.unlockedStage = Math.max(saveData.unlockedStage, currentStage + 1);
  }

  if (isAllNormalStagesCleared()) {
    saveData.speedrunUnlocked = true;
  }

  saveGame();

  renderClearScreen(currentStage, clearTime, stars, isNewBest);
}

function checkExit() {
  if (level[Math.floor(y)][Math.floor(x)] !== 3) return;

  clearStage();
}

function getExitDistance() {
  for (let yy = 0; yy < mapH; yy++) {
    for (let xx = 0; xx < mapW; xx++) {
      if (level[yy][xx] === 3) {
        return Math.hypot(xx + 0.5 - x, yy + 0.5 - y);
      }
    }
  }

  return Infinity;
}

function update() {
  if (settingOpen) {
    mouse.dx = 0;
    return;
  }

  if (countdownActive) {
    updateCountdown();
    mouse.dx = 0;
    return;
  }

  dir += mouse.dx * CONFIG.rotSpeed * sensitivity * 180 / Math.PI;
  mouse.dx = 0;

  if (dodgeCooldown > 0) {
    dodgeCooldown--;
  }

  updateTiredState();

  const movement = getMovementInput();

  updateStaminaLock();

  updateSpaceAction(
    movement.inputX,
    movement.inputY,
    movement.moving,
    movement.fx,
    movement.fy
  );

  if (isDodging) {
    updateDodge();
  } else {
    updateNormalMove(movement.inputX, movement.inputY);
  }

  updateStaminaRecovery(movement.moving);
  checkExit();
}

function draw() {
  const w = canvas.width;
  const h = canvas.height;

  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, w, h);

  updateCameraEffect();

  let tiredShake = 0;

  if (tiredTimer > 0) {
    const power = CONFIG.tiredShakePower * (tiredTimer / getTiredTime());
    tiredShake = Math.sin(tiredShakeTimer) * power;
  }

  const centerY = h / 2 + camBob + tiredShake;
  const currentFov = CONFIG.fov + camFovAdd;

  drawBackground(w, h, centerY);
  drawRaycast(w, h, centerY, currentFov);
  drawCrosshair(w, h);
  drawUI(w, h);
  drawCountdown(w, h);
}

function updateCameraEffect() {
  let targetBob = 0;
  let targetFov = 0;

  if (isRunning) {
    targetBob = 8;
    targetFov = 6;
  } else if (isDodging) {
    targetBob = 15;
    targetFov = 8;
  }

  camBob = lerp(camBob, targetBob, 0.12);
  camFovAdd = lerp(camFovAdd, targetFov, 0.12);
}

function drawBackground(w, h, centerY) {
  const ceiling = 22 * brightness;
  const floor = 48 * brightness;

  ctx.fillStyle = `rgb(${ceiling}, ${ceiling}, ${ceiling})`;
  ctx.fillRect(0, 0, w, centerY);

  ctx.fillStyle = `rgb(${floor}, ${floor}, ${floor})`;
  ctx.fillRect(0, centerY, w, h - centerY);
}

function drawRaycast(w, h, centerY, currentFov) {
  const sliceW = w / CONFIG.rayCount;

  for (let i = 0; i < CONFIG.rayCount; i++) {
    const rayAngle = dir - currentFov / 2 + (i / CONFIG.rayCount) * currentFov;
    const hitInfo = castRay(rayAngle);

    drawExitFloor(i, sliceW, h, centerY, rayAngle, hitInfo);
    drawWall(i, sliceW, h, centerY, rayAngle, hitInfo);
  }
}

function castRay(rayAngle) {
  let rayX = x;
  let rayY = y;
  let dist = 0;
  let hit = false;
  let hitType = 0;

  let exitSeen = false;
  let exitStartDist = -1;
  let exitEndDist = -1;

  while (!hit && dist < CONFIG.rayDepth) {
    rayX += cosd(rayAngle) * 0.02;
    rayY += sind(rayAngle) * 0.02;
    dist += 0.02;

    const mapX = Math.floor(rayX);
    const mapY = Math.floor(rayY);

    if (mapX < 0 || mapX >= mapW || mapY < 0 || mapY >= mapH) {
      hit = true;
      hitType = 1;
      continue;
    }

    const tile = level[mapY][mapX];

    if (tile === 3) {
      if (!exitSeen) {
        exitSeen = true;
        exitStartDist = dist;
      }

      exitEndDist = dist;
    }

    if (tile === 1 || tile === 2) {
      hit = true;
      hitType = tile;
    }
  }

  return {
    dist,
    hitType,
    exitSeen,
    exitStartDist,
    exitEndDist
  };
}

function drawExitFloor(i, sliceW, h, centerY, rayAngle, hitInfo) {
  if (!hitInfo.exitSeen) return;
  if (hitInfo.exitStartDist <= 0) return;
  if (hitInfo.exitEndDist <= hitInfo.exitStartDist) return;

  let startCorrected = hitInfo.exitStartDist * cosd(rayAngle - dir);
  let endCorrected = hitInfo.exitEndDist * cosd(rayAngle - dir);

  startCorrected = Math.max(startCorrected, 0.1);
  endCorrected = Math.max(endCorrected, 0.1);

  let yNear = centerY + (h * 0.55) / startCorrected;
  let yFar = centerY + (h * 0.55) / endCorrected;

  yNear = clamp(yNear, centerY, h);
  yFar = clamp(yFar, centerY, h);

  const shade = clamp((255 - startCorrected * 18) * brightness, 90, 255);

  ctx.fillStyle = `rgb(20, ${shade}, 40)`;
  ctx.fillRect(i * sliceW - 0.5, yFar, sliceW + 1, yNear - yFar);
}

function drawWall(i, sliceW, h, centerY, rayAngle, hitInfo) {
  let correctedDist = hitInfo.dist * cosd(rayAngle - dir);
  correctedDist = Math.max(correctedDist, 0.1);

  const wallH = h / correctedDist;
  const wallTop = centerY - wallH / 2;
  const wallBottom = centerY + wallH / 2;

  const shade = clamp((255 - correctedDist * 25) * brightness, 35, 255);

  ctx.fillStyle = `rgb(${shade}, ${shade}, ${shade})`;
  ctx.fillRect(i * sliceW - 0.5, wallTop, sliceW + 1, wallBottom - wallTop);
}

function drawCrosshair(w, h) {
  ctx.strokeStyle = "white";
  ctx.lineWidth = 1;

  ctx.beginPath();
  ctx.moveTo(w / 2 - 8, h / 2);
  ctx.lineTo(w / 2 + 8, h / 2);
  ctx.moveTo(w / 2, h / 2 - 8);
  ctx.lineTo(w / 2, h / 2 + 8);
  ctx.stroke();
}

function drawUI(w, h) {
  const uiX = 30;
  const uiY = h - 50;
  const barW = 260;
  const barH = 18;

  const staminaRate = stamina / getMaxStamina();

  ctx.fillStyle = "white";
  ctx.font = "14px Arial";
  ctx.fillText(`STAGE ${currentStage}`, 30, 35);
  ctx.fillText(`MAZE ${mazeSize} X ${mazeSize}`, 30, 58);

  if (gameMode === "speedrun" && !countdownActive) {
    ctx.fillText(`TOTAL ${formatTime(performance.now() - speedrunStartTime)}`, 30, 81);
    ctx.fillText("R RETRY", 30, 104);
  }

  if (tiredTimer > 0) {
    ctx.fillText("TIRED", 30, gameMode === "speedrun" ? 127 : 81);
  }

  if (hasExitSensor() && getExitDistance() <= 3.2) {
    ctx.fillText("EXIT NEAR", 30, gameMode === "speedrun" ? 150 : 104);
  }

  ctx.fillStyle = "black";
  ctx.fillRect(uiX - 2, uiY - 2, barW + 4, barH + 4);

  ctx.fillStyle = "rgb(20,60,20)";
  ctx.fillRect(uiX, uiY, barW, barH);

  ctx.fillStyle = "lime";
  ctx.fillRect(uiX, uiY, barW * staminaRate, barH);
}

function gameLoop() {
  if (!gameStarted) {
    loopStarted = false;
    return;
  }

  update();

  if (gameStarted) {
    draw();
    requestAnimationFrame(gameLoop);
  } else {
    loopStarted = false;
  }
}

window.addEventListener("resize", () => {
  resizeCanvas();

  if (!gameStarted) {
    generatePreviewRoom();
  }
});

window.addEventListener("keydown", (e) => {
  if (e.code === "Escape" && gameStarted) {
    e.preventDefault();

    if (settingOpen) {
      closeSettings();
    } else {
      openSettings();
    }

    return;
  }

  if (e.code === "KeyR" && gameStarted && gameMode === "speedrun" && !settingOpen) {
    e.preventDefault();
    retrySpeedrun();
    return;
  }

  if (!settingOpen && !countdownActive) {
    keys[e.code] = true;
  }
});

window.addEventListener("keyup", (e) => {
  keys[e.code] = false;
});

window.addEventListener("mousemove", (e) => {
  if (document.pointerLockElement === canvas && !settingOpen && !countdownActive) {
    mouse.dx += e.movementX;
  }
});

document.addEventListener("pointerlockchange", () => {
  if (!gameStarted) return;

  if (document.pointerLockElement !== canvas && !settingOpen) {
    openSettings(false);
  }
});

canvas.addEventListener("click", () => {
  unlockAudio();

  if (gameStarted && !settingOpen && document.pointerLockElement !== canvas) {
    canvas.requestPointerLock();
  }
});

if (sensitivitySlider) {
  sensitivitySlider.addEventListener("input", () => {
    sensitivity = Number(sensitivitySlider.value);
  });
}

if (brightnessSlider) {
  brightnessSlider.addEventListener("input", () => {
    brightness = Number(brightnessSlider.value);
  });
}

if (resumeBtn) {
  resumeBtn.addEventListener("click", closeSettings);
}

resizeCanvas();
loadSave();
generatePreviewRoom();
renderMainMenu();
startPreviewLoop();