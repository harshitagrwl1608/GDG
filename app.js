const attempts = [
  { title: "Tilt the soundbar", kicker: "A LITTLE MORE PHYSICS", description: "Hold either end and lift or lower it. The bar tilts and its volume marker runs along the rail; release and the bar levels out while the new volume stays.", narration: "Start over. Hold a corner, tilt the soundbar, and watch its marker run…" },
  { title: "The leaky pump", kicker: "AIR-POWERED AUDIO", description: "Hold the pump to add volume. Let go and the sound slowly leaks away again.", narration: "Still not it. Pump the volume up before it leaks…" },
  { title: "Pi-powered volume", kicker: "MATHEMATICAL AUDIO", description: "Choose an input from 1–100. A π-heavy equation and a fresh random seed turn it into a different volume from 1–100.", narration: "That was too straightforward. Let π and a random seed decide…" },
  { title: "Number maze", kicker: "VOLUME BY MAZE", description: "The numbers are scattered through a maze. Move one cell at a time through open passages; each cell immediately sets the playback volume.", narration: "That grid was too easy. Find your way through the number maze…" },
  { title: "Gather the sound dots", kicker: "DOT-BY-DOT CONTROL", description: "Drag dots into the speaker shape. Each dot you collect adds two volume points; pull one back out to lower it.", narration: "Not that. Gather the dots to make a sound…" },
  { title: "Arrange the volume digits", kicker: "DOT-MATRIX NUMBER ENTRY", description: "Drag dots onto seven-segment slots to build a three-digit volume. The player changes only when the arrangement forms a valid number from 000 to 100.", narration: "Still too simple. Build the volume number out of dots…" },
  { title: "Tilt. Aim. Launch.", kicker: "THE FINAL VOLUME SOLUTION", description: "Grab the speaker icon, drag up or down to tilt it, then release. The volume pointer flies along a projectile arc; where it lands sets the player volume.", narration: "Last idea. Tilt the speaker and let the pointer fly…" }
];

const ui = {
  audio: document.querySelector("#mediaElement"),
  picker: document.querySelector("#filePicker"),
  title: document.querySelector("#trackTitle"),
  subtitle: document.querySelector("#trackSubtitle"),
  status: document.querySelector("#trackStatus"),
  play: document.querySelector("#playButton"),
  glyph: document.querySelector("#playGlyph"),
  playLabel: document.querySelector("#playLabel"),
  seek: document.querySelector("#seekBar"),
  currentTime: document.querySelector("#currentTime"),
  duration: document.querySelector("#duration"),
  volume: document.querySelector("#gainPercent"),
  outputDb: document.querySelector("#outputDb"),
  outputMeterFill: document.querySelector("#outputMeterFill"),
  attemptList: document.querySelector("#attemptList"),
  count: document.querySelector("#attemptCount"),
  kicker: document.querySelector("#attemptKicker"),
  attemptTitle: document.querySelector("#attemptTitle"),
  ideaNumber: document.querySelector("#ideaNumber"),
  description: document.querySelector("#attemptDescription"),
  mechanism: document.querySelector("#mechanism"),
  narration: document.querySelector("#narration"),
  previous: document.querySelector("#previousAttempt"),
  next: document.querySelector("#nextAttempt")
};

let currentAttempt = 0;
let volume = 42;
let audioContext;
let gainNode;
let compressor;
let analyser;
let mediaSource;
let demoBuffer;
let demoSource;
let currentFileUrl;
let playbackMode = "demo";
let isPlaying = false;
let demoOffset = 0;
let demoStartedAt = 0;
let animationFrame;
let pumpTimer;
let leakTimer;
let pumpClickSuppression = 0;
let dotState = [];
let dotOffset = 0;
let draggingDot = null;
let soundbarAngle = 0;
let soundbarDrag = null;
let soundbarPhysicsFrame = null;
let soundbarPhysicsVelocity = 0;
let soundbarPhysicsPosition = 42;
let soundbarPhysicsLastTime = 0;
let mazeCells = [];
let currentMazeCell = 0;
let volumeDotTokens = [];
let draggingVolumeDot = null;
let launchAngle = 45;
let launcherGesture = null;
let launchAnimationFrame = null;

function clamp(value, low, high) { return Math.min(high, Math.max(low, value)); }
function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return "0:00";
  const value = Math.max(0, Math.floor(seconds));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
}

function setVolume(value) {
  volume = Math.round(clamp(Number(value), 0, 100));
  ui.volume.textContent = String(volume);
  if (gainNode && audioContext) gainNode.gain.setTargetAtTime(volume / 100, audioContext.currentTime, 0.035);
  renderActiveMechanism();
}

function renderSoundbar() {
  const bar = document.querySelector("#tiltBar");
  const readout = document.querySelector("#tiltReadout");
  const markerLabel = document.querySelector("#tiltKnob b");
  if (bar) {
    const markerPosition = 24 + volume * 0.65;
    bar.style.setProperty("--tilt", `${soundbarAngle}deg`);
    bar.style.setProperty("--knob", `${markerPosition}%`);
    bar.style.setProperty("--level", `${markerPosition}%`);
    bar.setAttribute("aria-valuenow", String(volume));
  }
  if (markerLabel) markerLabel.textContent = String(volume);
  if (readout) readout.innerHTML = `<strong>${volume}%</strong><i></i> TILT ${Math.round(soundbarAngle)}°`;
}

function updateSoundbarTilt(angle) {
  soundbarAngle = clamp(angle, -18, 18);
  renderSoundbar();
}

function stepSoundbarGravity(timestamp) {
  if (!soundbarDrag || currentAttempt !== 0) {
    soundbarPhysicsFrame = null;
    return;
  }
  const dt = soundbarPhysicsLastTime ? Math.min((timestamp - soundbarPhysicsLastTime) / 1000, 0.05) : 0;
  soundbarPhysicsLastTime = timestamp;
  const gravity = 100 * Math.sin(soundbarAngle * Math.PI / 180);
  soundbarPhysicsVelocity = clamp((soundbarPhysicsVelocity + gravity * dt) * Math.exp(-0.5 * dt), -75, 75);
  soundbarPhysicsPosition += soundbarPhysicsVelocity * dt;
  if (soundbarPhysicsPosition <= 0 || soundbarPhysicsPosition >= 100) {
    soundbarPhysicsPosition = clamp(soundbarPhysicsPosition, 0, 100);
    soundbarPhysicsVelocity = 0;
  }
  setVolume(soundbarPhysicsPosition);
  soundbarPhysicsFrame = requestAnimationFrame(stepSoundbarGravity);
}

function releaseSoundbarTilt() {
  if (!soundbarDrag) return;
  soundbarDrag = null;
  if (soundbarPhysicsFrame !== null) cancelAnimationFrame(soundbarPhysicsFrame);
  soundbarPhysicsFrame = null;
  soundbarPhysicsLastTime = 0;
  soundbarPhysicsPosition = volume;
  soundbarAngle = 0;
  renderSoundbar();
  document.querySelector("#tiltBar")?.classList.remove("is-dragging");
}

function renderActiveMechanism() {
  if (currentAttempt === 0) renderSoundbar();
  if (currentAttempt === 1) {
    const balloon = document.querySelector("#pumpBalloon");
    const fill = document.querySelector("#balloonFill");
    const label = document.querySelector("#balloonPercent");
    if (balloon) balloon.style.setProperty("--balloon-scale", String(0.68 + volume / 180));
    if (fill) fill.style.setProperty("--fill", `${volume}%`);
    if (label) label.textContent = `${volume}%`;
  }
  if (currentAttempt === 2) {
    const current = document.querySelector("#piCurrent");
    if (current) current.textContent = `${volume}%`;
  }
  if (currentAttempt === 4) {
    const counter = document.querySelector("#dotCount");
    if (counter) counter.textContent = `${Math.round(volume / 2)} / 50 dots`;
  }
  if (currentAttempt === 5) {
    const current = document.querySelector("#digitPlayerVolume");
    if (current) current.textContent = `${volume}%`;
  }
}

function createMechanism(index) {
  if (index === 0) return `
    <div class="tilt-stage" id="tiltStage">
      <span class="tilt-instruction"><i></i> GRAVITY TILT CONTROL <span>HOLD THE ANGLE · GRAVITY KEEPS IT SLIDING</span></span>
      <div class="tilt-ambient" aria-hidden="true"></div>
      <div class="tilt-shadow" aria-hidden="true"></div>
      <div class="tilt-bar" id="tiltBar" role="slider" tabindex="0" aria-label="Hold a corner and lift or lower it to tilt the soundbar and adjust volume" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${volume}">
        <span class="tilt-grip tilt-grip-left" data-side="left" aria-hidden="true"></span>
        <span class="tilt-speaker" aria-hidden="true"><svg viewBox="0 0 32 32"><path d="M5 12h6l8-6v20l-8-6H5z"/><path d="M23 12c3 2 3 6 0 8M26 8c6 4 6 12 0 16"/></svg></span>
        <span class="tilt-track"><span class="tilt-rail"></span><span class="tilt-knob" id="tiltKnob"><b>${volume}</b></span></span>
        <span class="tilt-grille" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>
        <span class="tilt-grip tilt-grip-right" data-side="right" aria-hidden="true"></span>
      </div>
      <span class="tilt-direction tilt-left">LEFT CORNER</span><span class="tilt-direction tilt-right">RIGHT CORNER</span>
      <span class="tilt-readout" id="tiltReadout">${volume}% <i></i> TILT 0°</span>
    </div>
    <div class="mechanism-hint"><span>STEEPER TILT · FASTER FALL</span><span>RELEASE · BAR LEVELS, VOLUME STAYS</span></div>`;

  if (index === 1) return `
    <div class="pump-stage">
      <div class="pump-copy"><strong>Hold to inflate the sound.</strong>It loses air whenever you're not pumping. Keep an eye on the balloon; it is also your volume control.</div>
      <div class="balloon-wrap"><div class="balloon" id="pumpBalloon" style="--balloon-scale:${0.68 + volume / 180}"><div class="balloon-fill" id="balloonFill" style="--fill:${volume}%"></div><span class="balloon-percent" id="balloonPercent">${volume}%</span></div><button class="pump-button" id="pumpButton" type="button"><span>＋</span> HOLD TO PUMP</button></div>
    </div>
    <div class="mechanism-hint"><span>HOLD THE BUTTON</span><span>AIR LEAKS AT 1.2% / SEC</span></div>`;

  if (index === 2) return `
    <div class="pi-stage" id="piStage">
      <p class="pi-current">Current player volume: <strong id="piCurrent">${volume}%</strong></p>
      <p class="pi-equation-label">THE OFFICIAL π-BASED VOLUME EQUATION</p>
      <code class="pi-equation">V(x,r) = 1 + floor(100 × frac(|sin(π × x × r / 101 + r/√2) + cos(π × (x+r) / 37)| × 43,758.5453))</code>
      <p class="pi-range-note">INPUT x ∈ [1, 100] &nbsp;→&nbsp; OUTPUT V ∈ [1, 100]</p>
      <label class="pi-entry-label" for="piDomain">INPUT DOMAIN · x ∈ [1, 100]</label>
      <input class="pi-domain" id="piDomain" type="range" min="1" max="100" value="42" aria-label="Choose the equation input from one to one hundred">
      <div class="pi-domain-readout"><span>x = <strong id="piDomainValue">42</strong></span><span>random seed r = <strong id="piSeedValue">not drawn yet</strong></span></div>
      <button class="pi-submit" id="piCompute" type="button">CALCULATE VOLUME</button>
      <p class="pi-note">Each calculation draws a new r. Here, floor rounds down and frac keeps the fractional part. The same x can produce a different volume each time.</p>
    </div>`;

  if (index === 3) return `
    <div class="number-stage">
      <div class="number-header"><span>START AT YOUR CURRENT VOLUME · FOLLOW OPEN PASSAGES</span><strong id="numberCurrent">NOW: ${volume}%</strong></div>
      <div class="maze-shell"><div class="number-grid maze-grid" id="numberGrid" role="group" tabindex="0" aria-label="Volume maze. Use arrow keys or the direction buttons to move through open passages."></div></div>
      <div class="maze-controls" role="group" aria-label="Maze directions">
        <button class="maze-move" type="button" data-maze-dir="up" aria-label="Move up">↑</button>
        <button class="maze-move" type="button" data-maze-dir="left" aria-label="Move left">←</button>
        <button class="maze-move" type="button" data-maze-dir="down" aria-label="Move down">↓</button>
        <button class="maze-move" type="button" data-maze-dir="right" aria-label="Move right">→</button>
      </div>
      <p class="maze-message" id="mazeMessage" role="status">Every stop is a volume setting. Follow corridors until you reach the level you want.</p>
    </div>`;

  if (index === 4) return `<div class="dot-stage" id="dotStage"><span class="dot-instruction">DRAG THE DOTS INTO THE SPEAKER SHAPE</span><div class="sound-target" id="soundTarget" aria-label="Drop sound dots here"><svg viewBox="0 0 48 48" aria-hidden="true"><path d="M7 19h9l10-8v26l-10-8H7z"></path><path d="M32 18c5 4 5 8 0 12M36 13c8 7 8 15 0 22"></path></svg><span class="target-count" id="dotCount">${Math.round(volume / 2)} / 50 dots</span></div></div><div class="mechanism-hint"><span>ONE DOT = 2 VOLUME POINTS</span><span>DRAG A DOT BACK OUT TO TURN IT DOWN</span></div>`;

  if (index === 5) return `
    <div class="volume-number-puzzle" id="volumeNumberPuzzle">
      <div class="number-header"><span>PLACE DOTS TO DRAW THREE DIGITS</span><strong>PLAYER: <span id="digitPlayerVolume">${volume}%</span></strong></div>
      <div class="digit-display" id="digitDisplay" aria-label="Three-digit dot-matrix volume display"></div>
      <p class="digit-readout">ASSEMBLED VOLUME <strong id="assembledNumber">—</strong></p>
      <p class="digit-message" id="digitPuzzleMessage" role="status">Drag a dot into or out of a segment. The player follows a valid number.</p>
      <div class="dot-bank-wrap"><span class="dot-bank-label">LOOSE DOTS</span><div class="dot-bank" id="dotBank" aria-label="Loose dots available to place"></div></div>
      <div class="mechanism-hint"><span>ONE DOT FILLS ONE SEGMENT</span><span>THREE DIGITS · 000–100</span></div>
    </div>`;

  if (index === 6) return `
    <div class="catapult-stage" id="catapultStage">
      <div class="catapult-head"><div><strong>Grab the speaker and tilt it.</strong><span>Drag up or down, then release to launch.</span></div><span class="physics-angle" id="physicsAngle">45°</span></div>
      <div class="physics-arena" id="physicsArena" aria-label="Projectile launch line. The pointer's landing position sets volume.">
        <svg class="trajectory-svg" id="trajectorySvg" aria-hidden="true"><path class="trajectory-path" id="trajectoryPath"></path></svg>
        <div class="landing-line" id="landingLine"><span>0</span><span>100</span></div>
        <button class="tilt-launcher" id="tiltLauncher" type="button" aria-label="Drag up or down to tilt the speaker; release to launch the volume pointer">◖))</button>
        <span class="volume-projectile" id="volumeProjectile" aria-hidden="true">↗</span>
      </div>
      <p class="physics-readout" id="physicsReadout" role="status">45° tilt · release to fire</p>
      <div class="mechanism-hint"><span>DRAG THE SPEAKER UP OR DOWN</span><span>LANDING POSITION SETS VOLUME</span></div>
    </div>`;
}

function setAttempt(index) {
  if (soundbarDrag) releaseSoundbarTilt();
  currentAttempt = clamp(index, 0, attempts.length - 1);
  cancelProjectileFlight();
  launcherGesture = null;
  stopPump();
  if (leakTimer) window.clearInterval(leakTimer);
  leakTimer = null;
  if (currentAttempt === 0) {
    soundbarAngle = 0;
  }
  const item = attempts[currentAttempt];
  ui.count.textContent = `ATTEMPT ${String(currentAttempt + 1).padStart(2, "0")} / 07`;
  ui.kicker.textContent = item.kicker;
  ui.attemptTitle.textContent = item.title;
  ui.ideaNumber.textContent = String(currentAttempt + 1).padStart(2, "0");
  ui.description.textContent = item.description;
  ui.mechanism.innerHTML = createMechanism(currentAttempt);
  if (currentAttempt === 0) renderSoundbar();
  draggingDot = null;
  draggingVolumeDot = null;
  ui.narration.innerHTML = `<span>${currentAttempt === 0 ? "TRY 01" : "OH NO · TRY " + String(currentAttempt + 1).padStart(2, "0")}</span> ${item.narration}`;
  ui.previous.disabled = currentAttempt === 0;
  ui.next.innerHTML = currentAttempt === attempts.length - 1 ? 'That was terrible. Start again <span aria-hidden="true">↻</span>' : 'Oh no. Try the next one <span aria-hidden="true">→</span>';
  ui.attemptList.innerHTML = attempts.map((attempt, i) => `<button class="attempt-link" type="button" data-attempt="${i}" aria-current="${i === currentAttempt ? "step" : "false"}"><span class="attempt-no">${String(i + 1).padStart(2, "0")}</span><strong>${attempt.title}</strong><span class="attempt-arrow" aria-hidden="true">›</span></button>`).join("");
  if (currentAttempt === 1) startLeak();
  if (currentAttempt === 3) buildNumberGrid();
  if (currentAttempt === 4) buildDotStage();
  if (currentAttempt === 5) buildVolumeNumberPuzzle();
  if (currentAttempt === 6) initializeCatapult();
}

function buildNumberGrid() {
  const grid = document.querySelector("#numberGrid");
  const values = Array.from({ length: 101 }, (_, i) => i);
  for (let i = values.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [values[i], values[j]] = [values[j], values[i]];
  }
  const columns = 11;
  mazeCells = values.map((value, index) => ({
    id: index, value, row: Math.floor(index / columns), col: index % columns,
    walls: { up: true, right: true, down: true, left: true }, visited: false
  }));
  const byPosition = new Map(mazeCells.map((cell) => [`${cell.row},${cell.col}`, cell]));
  const directions = [
    { key: "up", dr: -1, dc: 0, opposite: "down" },
    { key: "right", dr: 0, dc: 1, opposite: "left" },
    { key: "down", dr: 1, dc: 0, opposite: "up" },
    { key: "left", dr: 0, dc: -1, opposite: "right" }
  ];
  const stack = [mazeCells[0]];
  mazeCells[0].visited = true;
  while (stack.length) {
    const cell = stack[stack.length - 1];
    const neighbors = directions.map((direction) => ({
      direction,
      cell: byPosition.get(`${cell.row + direction.dr},${cell.col + direction.dc}`)
    })).filter((item) => item.cell && !item.cell.visited);
    if (!neighbors.length) { stack.pop(); continue; }
    const { direction, cell: next } = neighbors[Math.floor(Math.random() * neighbors.length)];
    cell.walls[direction.key] = false;
    next.walls[direction.opposite] = false;
    next.visited = true;
    stack.push(next);
  }
  mazeCells.forEach((cell) => { cell.visited = false; });
  currentMazeCell = mazeCells.findIndex((cell) => cell.value === volume);
  if (currentMazeCell < 0) currentMazeCell = 0;
  mazeCells[currentMazeCell].visited = true;
  renderMaze();
}

function renderMaze() {
  const grid = document.querySelector("#numberGrid");
  if (!grid || !mazeCells.length) return;
  const restoreFocus = grid.contains(document.activeElement);
  const cellAt = new Map(mazeCells.map((cell) => [`${cell.row},${cell.col}`, cell]));
  const cells = [];
  for (let row = 0; row < 10; row += 1) {
    for (let col = 0; col < 11; col += 1) {
      const cell = cellAt.get(`${row},${col}`);
      if (!cell) { cells.push('<span class="maze-block" aria-hidden="true"></span>'); continue; }
      const open = Object.entries(cell.walls).filter(([, wall]) => !wall).map(([direction]) => direction);
      const isCurrent = cell.id === currentMazeCell;
      cells.push(`<button class="maze-cell${cell.visited ? " visited" : ""}${isCurrent ? " current" : ""}" type="button" tabindex="-1" data-cell="${cell.id}" data-wall-up="${cell.walls.up}" data-wall-right="${cell.walls.right}" data-wall-down="${cell.walls.down}" data-wall-left="${cell.walls.left}" aria-pressed="${isCurrent}" aria-label="Volume ${cell.value} percent${open.length ? `; passages ${open.join(", ")}` : "; dead end"}">${cell.value}</button>`);
    }
  }
  grid.innerHTML = cells.join("");
  if (restoreFocus) grid.focus({ preventScroll: true });
  const current = mazeCells[currentMazeCell];
  const output = document.querySelector("#numberCurrent");
  if (output) output.textContent = `NOW: ${current.value}%`;
  document.querySelectorAll(".maze-move").forEach((button) => {
    button.disabled = current.walls[button.dataset.mazeDir];
  });
}

function moveMaze(direction, targetId = null) {
  const current = mazeCells[currentMazeCell];
  if (!current) return;
  const deltas = { up: [-1, 0], right: [0, 1], down: [1, 0], left: [0, -1] };
  let next;
  if (targetId !== null) {
    next = mazeCells[Number(targetId)];
    const delta = next ? [next.row - current.row, next.col - current.col] : null;
    direction = Object.keys(deltas).find((key) => deltas[key][0] === delta?.[0] && deltas[key][1] === delta?.[1]);
  }
  const delta = direction && deltas[direction];
  if (!delta || current.walls[direction]) {
    const message = document.querySelector("#mazeMessage");
    if (message) message.textContent = "Dead end. Try an open corridor or a neighboring number.";
    return;
  }
  next = mazeCells.find((cell) => cell.row === current.row + delta[0] && cell.col === current.col + delta[1]);
  if (!next) return;
  currentMazeCell = next.id;
  next.visited = true;
  setVolume(next.value);
  renderMaze();
  const message = document.querySelector("#mazeMessage");
  if (message) message.textContent = `Now at ${next.value}%. Keep following the corridors to reach your desired level.`;
}

const digitSegments = ["a", "b", "c", "d", "e", "f", "g"];
const digitPatterns = {
  "abcdef": "0", "bc": "1", "abdeg": "2", "abcdg": "3", "bcfg": "4",
  "acdfg": "5", "acdefg": "6", "abc": "7", "abcdefg": "8", "abcdfg": "9"
};

function buildVolumeNumberPuzzle() {
  const display = document.querySelector("#digitDisplay");
  const bank = document.querySelector("#dotBank");
  const slots = [];
  for (let digit = 0; digit < 3; digit += 1) {
    slots.push(`<div class="seven-digit" data-digit="${digit}" aria-label="Digit ${digit + 1}">${digitSegments.map((segment) => `<div class="digit-segment" data-segment="${digit}-${segment}" data-digit="${digit}" data-segment-name="${segment}" role="button" tabindex="0" aria-label="Digit ${digit + 1}, segment ${segment}; empty"></div>`).join("")}</div>`);
  }
  display.innerHTML = slots.join("");
  volumeDotTokens = Array.from({ length: 21 }, (_, id) => ({ id, segment: null }));
  const initial = String(volume).padStart(3, "0");
  let tokenIndex = 0;
  [...initial].forEach((digitText, digit) => {
    const litSegments = digitSegments.filter((segment) => digitPatternsKeyFor(digitText).includes(segment));
    litSegments.forEach((segment) => {
      const token = volumeDotTokens[tokenIndex++];
      token.segment = `${digit}-${segment}`;
    });
  });
  bank.innerHTML = "";
  volumeDotTokens.forEach((token) => {
    const node = document.createElement("button");
    node.className = "volume-dot-token";
    node.type = "button";
    node.dataset.volumeDot = String(token.id);
    node.setAttribute("aria-label", `Loose volume dot ${token.id + 1}`);
    if (token.segment) {
      const target = display.querySelector(`[data-segment="${token.segment}"]`);
      const [digit, segment] = token.segment.split("-");
      target.classList.add("occupied");
      target.setAttribute("aria-label", `Digit ${Number(target.dataset.digit) + 1}, segment ${target.dataset.segmentName}; filled`);
      node.setAttribute("aria-label", `Volume dot in digit ${Number(digit) + 1}, segment ${segment}`);
      target.append(node);
    } else bank.append(node);
  });
  evaluateVolumeDigitPuzzle();
}

function digitPatternsKeyFor(value) {
  return Object.keys(digitPatterns).find((pattern) => digitPatterns[pattern] === String(value)) || "";
}

function evaluateVolumeDigitPuzzle() {
  const output = document.querySelector("#assembledNumber");
  const message = document.querySelector("#digitPuzzleMessage");
  if (!output || !message) return;
  const digits = [];
  for (let digit = 0; digit < 3; digit += 1) {
    const pattern = digitSegments.filter((segment) => volumeDotTokens.some((token) => token.segment === `${digit}-${segment}`)).join("");
    const value = digitPatterns[pattern];
    if (value === undefined) {
      output.textContent = "?";
      message.textContent = "That arrangement does not form a digit. The player keeps its last valid volume.";
      return;
    }
    digits.push(value);
  }
  const assembled = digits.join("");
  output.textContent = assembled;
  const value = Number(assembled);
  if (value > 100) {
    message.textContent = "Those are digits, but the volume range stops at 100. The player keeps its last valid volume.";
    return;
  }
  setVolume(value);
  message.textContent = `Valid number: ${assembled} → player volume ${value}%.`;
}

function placeVolumeDot(token, segmentKey = null) {
  const node = document.querySelector(`[data-volume-dot="${token.id}"]`);
  const bank = document.querySelector("#dotBank");
  if (!node || !bank) return;
  const target = segmentKey ? document.querySelector(`[data-segment="${segmentKey}"]`) : null;
  if (target && target.querySelector(".volume-dot-token") && token.segment !== segmentKey) {
    const message = document.querySelector("#digitPuzzleMessage");
    if (message) message.textContent = "That segment is already occupied. Move its dot out first.";
    restoreVolumeDot(token);
    return;
  }
  if (token.segment) {
    const previous = document.querySelector(`[data-segment="${token.segment}"]`);
    if (previous) {
      previous.classList.remove("occupied");
      previous.setAttribute("aria-label", `Digit ${Number(previous.dataset.digit) + 1}, segment ${previous.dataset.segmentName}; empty`);
    }
  }
  token.segment = target ? segmentKey : null;
  node.classList.remove("dragging");
  node.style.left = "";
  node.style.top = "";
  node.style.position = "";
  node.style.pointerEvents = "";
  if (target) {
    target.classList.add("occupied");
    target.setAttribute("aria-label", `Digit ${Number(target.dataset.digit) + 1}, segment ${target.dataset.segmentName}; filled`);
    target.append(node);
  } else bank.append(node);
  node.setAttribute("aria-label", token.segment ? `Volume dot in digit ${Number(token.segment[0]) + 1}, segment ${token.segment.slice(2)}` : `Loose volume dot ${token.id + 1}`);
  evaluateVolumeDigitPuzzle();
}

function restoreVolumeDot(token) {
  const node = document.querySelector(`[data-volume-dot="${token.id}"]`);
  if (!node) return;
  node.classList.remove("dragging");
  node.style.left = "";
  node.style.top = "";
  node.style.position = "";
  node.style.pointerEvents = "";
  const target = token.segment && document.querySelector(`[data-segment="${token.segment}"]`);
  if (target) target.append(node); else document.querySelector("#dotBank")?.append(node);
}

function dotSlot(index, width, height) {
  const cx = width * 0.67;
  const cy = height * 0.53;
  if (index < 10) {
    const row = index % 5;
    const col = Math.floor(index / 5);
    return { x: cx - 17 + col * 11, y: cy - 17 + row * 9 };
  }
  const p = index - 10;
  const ring = Math.floor(p / 10);
  const step = p % 10;
  const angle = (-56 + step * 12.4) * Math.PI / 180;
  const radius = 19 + ring * 10;
  return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
}

function buildDotStage() {
  const board = document.querySelector("#dotStage");
  const width = board.clientWidth;
  const height = board.clientHeight;
  const capturedCount = clamp(Math.round(volume / 2), 0, 50);
  dotOffset = volume - capturedCount * 2;
  const points = [
    [5, 26], [16, 65], [26, 24], [37, 82], [47, 37], [11, 46], [30, 55], [42, 18],
    [7, 75], [22, 40], [53, 69], [14, 18], [38, 50], [2, 58], [48, 84], [25, 73],
    [4, 36], [33, 26], [51, 46], [18, 86], [44, 59], [9, 57], [29, 14], [40, 74],
    [1, 22], [20, 31], [35, 88], [50, 28], [12, 82], [46, 15], [28, 64], [6, 49],
    [36, 38], [17, 54], [53, 57], [23, 18], [43, 31], [3, 68], [31, 76], [49, 73],
    [10, 32], [39, 65], [19, 70], [52, 39], [27, 48], [8, 88], [34, 17], [15, 39],
    [45, 49], [24, 88]
  ];
  dotState = points.map(([x, y], index) => ({ id: index, captured: index < capturedCount, slot: index < capturedCount ? index : -1, x: 0, y: 0 }));
  dotState.forEach((dot, index) => {
    const position = dot.captured ? dotSlot(dot.slot, width, height) : { x: width * points[index][0] / 100, y: height * points[index][1] / 100 };
    dot.x = position.x;
    dot.y = position.y;
  });
  board.querySelectorAll(".sound-dot").forEach((node) => node.remove());
  dotState.forEach((dot) => {
    const node = document.createElement("button");
    node.className = `sound-dot${dot.captured ? " captured" : ""}`;
    node.type = "button";
    node.dataset.dot = String(dot.id);
    node.setAttribute("aria-label", `${dot.captured ? "Captured sound dot" : "Scattered sound dot"}; drag to adjust volume`);
    node.style.left = `${dot.x}px`;
    node.style.top = `${dot.y}px`;
    board.append(node);
  });
  renderActiveMechanism();
}

function stopPump() {
  if (pumpTimer) window.clearInterval(pumpTimer);
  pumpTimer = null;
  const button = document.querySelector("#pumpButton");
  if (button) button.classList.remove("is-pumping");
}

function startPump() {
  stopPump();
  const button = document.querySelector("#pumpButton");
  if (!button) return;
  pumpClickSuppression = Date.now() + 350;
  button.classList.add("is-pumping");
  setVolume(volume + 1.2);
  pumpTimer = window.setInterval(() => setVolume(volume + 2.4), 100);
}

function startLeak() {
  if (leakTimer) window.clearInterval(leakTimer);
  leakTimer = window.setInterval(() => {
    if (currentAttempt === 1 && volume > 0) setVolume(volume - 1.2);
  }, 1000);
}

function initializeCatapult() {
  launchAngle = Math.asin(clamp(volume / 100, 0, 1)) * 90 / Math.PI;
  const arena = document.querySelector("#physicsArena");
  if (!arena) return;
  const origin = getCatapultOrigin(arena);
  const launcher = document.querySelector("#tiltLauncher");
  const projectile = document.querySelector("#volumeProjectile");
  const svg = document.querySelector("#trajectorySvg");
  if (svg) svg.setAttribute("viewBox", `0 0 ${arena.clientWidth} ${arena.clientHeight}`);
  launcher.style.left = `${origin.x}px`;
  launcher.style.top = `${origin.y}px`;
  launcher.style.transform = `translate(-50%, -50%) rotate(${-launchAngle}deg)`;
  projectile.style.left = `${origin.x}px`;
  projectile.style.top = `${origin.y}px`;
  const path = document.querySelector("#trajectoryPath");
  if (path) path.setAttribute("d", "");
  updateCatapultReadout();
}

function getCatapultOrigin(arena) {
  return { x: arena.clientWidth * 0.08, y: arena.clientHeight - 25 };
}

function updateCatapultReadout(message = null) {
  const launcher = document.querySelector("#tiltLauncher");
  const angle = document.querySelector("#physicsAngle");
  const readout = document.querySelector("#physicsReadout");
  if (launcher) launcher.style.transform = `translate(-50%, -50%) rotate(${-launchAngle}deg)`;
  if (angle) angle.textContent = `${Math.round(launchAngle)}°`;
  if (readout && message === null) readout.textContent = `${Math.round(launchAngle)}° tilt · release to fire`;
  else if (readout) readout.textContent = message;
}

function cancelProjectileFlight() {
  if (launchAnimationFrame) cancelAnimationFrame(launchAnimationFrame);
  launchAnimationFrame = null;
}

function launchProjectile() {
  const arena = document.querySelector("#physicsArena");
  const projectile = document.querySelector("#volumeProjectile");
  const path = document.querySelector("#trajectoryPath");
  if (!arena || !projectile) return;
  cancelProjectileFlight();
  const width = arena.clientWidth;
  const svg = document.querySelector("#trajectorySvg");
  if (svg) svg.setAttribute("viewBox", `0 0 ${arena.clientWidth} ${arena.clientHeight}`);
  const origin = getCatapultOrigin(arena);
  const gravity = 980;
  const maxRange = width * 0.84;
  const speed = Math.sqrt(maxRange * gravity);
  const theta = launchAngle * Math.PI / 180;
  const vx = speed * Math.cos(theta);
  const vy = speed * Math.sin(theta);
  const flightTime = 2 * vy / gravity;
  const predictedRange = (speed * speed * Math.sin(2 * theta)) / gravity;
  const landingX = clamp(origin.x + predictedRange, origin.x, width * 0.94);
  const samples = 24;
  const points = [];
  for (let i = 0; i <= samples; i += 1) {
    const t = flightTime * i / samples;
    const x = origin.x + vx * t;
    const lift = vy * t - 0.5 * gravity * t * t;
    points.push(`${i === 0 ? "M" : "L"}${x.toFixed(1)} ${(origin.y - lift).toFixed(1)}`);
  }
  if (path) path.setAttribute("d", points.join(" "));
  projectile.classList.add("in-flight");
  updateCatapultReadout(`${Math.round(launchAngle)}° · pointer in flight`);
  const startTime = performance.now();
  const tick = (now) => {
    const elapsed = Math.min((now - startTime) / 1000, flightTime);
    const x = origin.x + vx * elapsed;
    const lift = vy * elapsed - 0.5 * gravity * elapsed * elapsed;
    projectile.style.left = `${Math.min(x, landingX)}px`;
    projectile.style.top = `${origin.y - Math.max(0, lift)}px`;
    if (elapsed < flightTime) {
      launchAnimationFrame = requestAnimationFrame(tick);
      return;
    }
    launchAnimationFrame = null;
    projectile.style.left = `${landingX}px`;
    projectile.style.top = `${origin.y}px`;
    projectile.classList.remove("in-flight");
    const landingVolume = Math.round(clamp((landingX - origin.x) / maxRange * 100, 0, 100));
    setVolume(landingVolume);
    updateCatapultReadout(`Landed at ${landingVolume}% volume · tilt ${Math.round(launchAngle)}°`);
  };
  launchAnimationFrame = requestAnimationFrame(tick);
}

function handleMechanismInput(event) {
  if (event.target.id === "piDomain") document.querySelector("#piDomainValue").textContent = event.target.value;
}

function handleMechanismClick(event) {
  const button = event.target.closest("button");
  const segment = event.target.closest(".digit-segment");
  const tokenNode = event.target.closest(".volume-dot-token");
  if (currentAttempt === 5 && tokenNode && event.detail === 0) {
    const token = volumeDotTokens[Number(tokenNode.dataset.volumeDot)];
    placeVolumeDot(token, token.segment ? null : findEmptyDigitSegment());
    return;
  }
  if (currentAttempt === 5 && segment && event.detail === 0) {
    const key = segment.dataset.segment;
    const token = volumeDotTokens.find((item) => item.segment === key);
    if (token) placeVolumeDot(token, null);
    else {
      const looseToken = volumeDotTokens.find((item) => !item.segment);
      if (looseToken) placeVolumeDot(looseToken, key);
    }
    return;
  }
  if (!button) return;
  if (button.classList.contains("sound-dot") && event.detail === 0 && currentAttempt === 4) {
    const dot = dotState[Number(button.dataset.dot)];
    if (dot.captured) {
      dot.captured = false;
      dot.slot = -1;
      const board = document.querySelector("#dotStage");
      dot.x = board.clientWidth * (0.12 + (dot.id % 5) * 0.085);
      dot.y = board.clientHeight * (0.16 + ((dot.id * 17) % 70) / 100);
      button.style.left = `${dot.x}px`;
      button.style.top = `${dot.y}px`;
      button.classList.remove("captured");
      button.setAttribute("aria-label", "Scattered sound dot; activate to gather into the speaker");
    } else {
      let slot = dotState.findIndex((item) => !item.captured || item === dot);
      if (slot < 0) return;
      while (dotState.some((item) => item !== dot && item.captured && item.slot === slot)) slot = (slot + 1) % 50;
      dot.captured = true;
      dot.slot = slot;
      const board = document.querySelector("#dotStage");
      const position = dotSlot(slot, board.clientWidth, board.clientHeight);
      dot.x = position.x;
      dot.y = position.y;
      button.style.left = `${position.x}px`;
      button.style.top = `${position.y}px`;
      button.classList.add("captured");
      button.setAttribute("aria-label", "Captured sound dot; activate to release from the speaker");
    }
    setVolume(dotState.filter((item) => item.captured).length * 2 + dotOffset);
    return;
  }
  if (button.id === "pumpButton") {
    if (Date.now() > pumpClickSuppression) setVolume(volume + 3);
  }
  if (button.id === "piCompute") {
    const x = Number(document.querySelector("#piDomain").value);
    const seed = 1 + Math.floor(Math.random() * 9999);
    const mixedSignal = Math.sin(Math.PI * x * seed / 101 + seed / Math.sqrt(2)) + Math.cos(Math.PI * (x + seed) / 37);
    const raw = Math.abs(mixedSignal * 43758.5453);
    const fractionalPart = raw - Math.floor(raw);
    const result = 1 + Math.floor(100 * fractionalPart);
    document.querySelector("#piSeedValue").textContent = String(seed);
    setVolume(result);
  }
  if (button.classList.contains("maze-cell")) {
    moveMaze(null, button.dataset.cell);
    return;
  }
  if (button.classList.contains("maze-move")) { moveMaze(button.dataset.mazeDir); return; }
  if (button.id === "tiltLauncher" && event.detail === 0) { launchProjectile(); return; }
}

function findEmptyDigitSegment() {
  const segment = [...document.querySelectorAll(".digit-segment")].find((item) => !item.querySelector(".volume-dot-token"));
  return segment?.dataset.segment || null;
}

function updateDotFromPointer(event) {
  if (!draggingDot) return;
  const board = document.querySelector("#dotStage");
  const rect = board.getBoundingClientRect();
  const x = clamp(event.clientX - rect.left, 5, rect.width - 5);
  const y = clamp(event.clientY - rect.top, 5, rect.height - 5);
  draggingDot.x = x;
  draggingDot.y = y;
  const node = board.querySelector(`[data-dot="${draggingDot.id}"]`);
  node.style.left = `${x}px`;
  node.style.top = `${y}px`;
}

function finishDotDrag() {
  if (!draggingDot) return;
  const board = document.querySelector("#dotStage");
  const node = board?.querySelector(`[data-dot="${draggingDot.id}"]`);
  if (!board || !node) { draggingDot = null; return; }
  const rect = board.getBoundingClientRect();
  const cx = rect.width * 0.67;
  const cy = rect.height * 0.53;
  const distance = Math.hypot(draggingDot.x - cx, draggingDot.y - cy);
  if (distance <= 58) {
    let slot = draggingDot.slot;
    if (slot < 0 || dotState.some((dot) => dot !== draggingDot && dot.captured && dot.slot === slot)) {
      slot = dotState.findIndex((dot) => !dot.captured || dot === draggingDot);
      if (slot < 0) slot = 49;
      while (dotState.some((dot) => dot !== draggingDot && dot.captured && dot.slot === slot)) slot = (slot + 1) % 50;
    }
    draggingDot.captured = true;
    draggingDot.slot = slot;
    const position = dotSlot(slot, rect.width, rect.height);
    draggingDot.x = position.x;
    draggingDot.y = position.y;
    node.style.left = `${position.x}px`;
    node.style.top = `${position.y}px`;
    node.classList.add("captured");
    node.setAttribute("aria-label", "Captured sound dot; drag out of the speaker to lower volume");
  } else {
    draggingDot.captured = false;
    draggingDot.slot = -1;
    node.classList.remove("captured");
    node.setAttribute("aria-label", "Scattered sound dot; drag into the speaker to raise volume");
  }
  node.classList.remove("dragging");
  setVolume(dotState.filter((dot) => dot.captured).length * 2 + dotOffset);
  draggingDot = null;
}

function updateVolumeDotFromPointer(event) {
  if (!draggingVolumeDot) return;
  const node = document.querySelector(`[data-volume-dot="${draggingVolumeDot.id}"]`);
  if (!node) return;
  node.style.left = `${event.clientX}px`;
  node.style.top = `${event.clientY}px`;
}

function finishVolumeDotDrag(event) {
  if (!draggingVolumeDot) return;
  const token = draggingVolumeDot;
  const target = document.elementFromPoint(event.clientX, event.clientY)?.closest(".digit-segment");
  draggingVolumeDot = null;
  placeVolumeDot(token, target?.dataset.segment || null);
}

function buildAudioGraph() {
  if (audioContext) return;
  const Context = window.AudioContext || window.webkitAudioContext;
  if (!Context) throw new Error("This browser does not support Web Audio.");
  audioContext = new Context();
  gainNode = audioContext.createGain();
  compressor = audioContext.createDynamicsCompressor();
  analyser = audioContext.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0.8;
  compressor.threshold.value = -8;
  compressor.knee.value = 8;
  compressor.ratio.value = 10;
  gainNode.connect(compressor);
  compressor.connect(analyser);
  analyser.connect(audioContext.destination);
  mediaSource = audioContext.createMediaElementSource(ui.audio);
  mediaSource.connect(gainNode);
  gainNode.gain.value = volume / 100;
}

function buildDemoBuffer() {
  if (demoBuffer) return Promise.resolve(demoBuffer);
  const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!Offline) return Promise.reject(new Error("The original demo loop is unavailable in this browser."));
  const sampleRate = 22050;
  const duration = 12;
  const offline = new Offline(2, sampleRate * duration, sampleRate);
  const chords = [[261.63,329.63,392],[220,261.63,329.63],[174.61,220,261.63],[196,246.94,293.66]];
  chords.forEach((chord, bar) => chord.forEach((frequency, voice) => {
    const osc = offline.createOscillator();
    const env = offline.createGain();
    const start = bar * 3;
    osc.type = voice === 0 ? "sine" : "triangle";
    osc.frequency.value = frequency;
    env.gain.setValueAtTime(0.0001, start);
    env.gain.exponentialRampToValueAtTime(0.035 / (voice + 1), start + 0.35);
    env.gain.setValueAtTime(0.028 / (voice + 1), start + 2.55);
    env.gain.exponentialRampToValueAtTime(0.0001, start + 2.95);
    osc.connect(env); env.connect(offline.destination); osc.start(start); osc.stop(start + 3);
  }));
  const notes = [523.25,493.88,440,392,440,392,329.63,392];
  notes.forEach((frequency,index) => {
    const osc = offline.createOscillator(); const env = offline.createGain(); const start = index * 1.42 + 0.2;
    osc.type = "sine"; osc.frequency.value = frequency;
    env.gain.setValueAtTime(0.0001,start); env.gain.exponentialRampToValueAtTime(0.026,start+0.035); env.gain.exponentialRampToValueAtTime(0.0001,start+0.65);
    osc.connect(env); env.connect(offline.destination); osc.start(start); osc.stop(start+0.7);
  });
  return offline.startRendering().then((buffer) => { demoBuffer = buffer; return buffer; });
}

function setPlaying(playing) {
  isPlaying = playing;
  ui.play.setAttribute("aria-label", playing ? "Pause track" : "Play track");
  ui.glyph.textContent = playing ? "Ⅱ" : "▶";
  ui.playLabel.textContent = playing ? "Pause the track" : "Play the track";
  ui.status.classList.toggle("is-playing", playing);
  ui.status.innerHTML = `<i></i> ${playing ? "PLAYING" : "READY"}`;
  if (playing) startMeter(); else stopMeter();
}

async function startDemo() {
  buildAudioGraph();
  await audioContext.resume();
  if (demoSource) { try { demoSource.stop(); } catch (_) {} }
  const buffer = await buildDemoBuffer();
  demoSource = audioContext.createBufferSource();
  demoSource.buffer = buffer;
  demoSource.loop = true;
  demoSource.connect(gainNode);
  demoStartedAt = audioContext.currentTime;
  demoSource.start(0, demoOffset % buffer.duration);
  playbackMode = "demo";
  ui.title.textContent = "Chacha's Midnight Rehearsal";
  ui.subtitle.textContent = "Original demo loop · The House Orchestra";
  ui.duration.textContent = "0:12";
  setPlaying(true);
}

async function togglePlayback() {
  try {
    if (isPlaying) {
      if (playbackMode === "file") ui.audio.pause();
      else if (demoSource && audioContext) {
        demoOffset = (demoOffset + audioContext.currentTime - demoStartedAt) % demoBuffer.duration;
        try { demoSource.stop(); } catch (_) {}
        demoSource = null;
      }
      setPlaying(false);
      return;
    }
    buildAudioGraph();
    await audioContext.resume();
    if (playbackMode === "file" && ui.audio.src) await ui.audio.play();
    else await startDemo();
    setPlaying(true);
  } catch (error) {
    setPlaying(false);
    ui.subtitle.textContent = "Playback could not start. Try a different local audio file.";
  }
}

function startMeter() {
  if (!analyser) return;
  if (animationFrame) cancelAnimationFrame(animationFrame);
  const timeData = new Float32Array(analyser.fftSize);
  const tick = () => {
    analyser.getFloatTimeDomainData(timeData);
    let sum = 0;
    for (let i = 0; i < timeData.length; i += 1) sum += timeData[i] * timeData[i];
    const rms = Math.sqrt(sum / timeData.length);
    const db = rms > 0.00001 ? Math.max(-60, 20 * Math.log10(rms)) : -60;
    const shownDb = db <= -59.5 ? "−60" : String(Math.round(db));
    ui.outputDb.textContent = `${shownDb} dBFS`;
    ui.outputMeterFill.style.width = `${clamp((db + 60) / 60 * 100, 0, 100)}%`;
    if (playbackMode === "demo" && demoBuffer && isPlaying) {
      const elapsed = (demoOffset + audioContext.currentTime - demoStartedAt) % demoBuffer.duration;
      ui.currentTime.textContent = formatTime(elapsed);
      ui.seek.value = String((elapsed / demoBuffer.duration) * 100);
    }
    animationFrame = requestAnimationFrame(tick);
  };
  tick();
}

function stopMeter() {
  if (animationFrame) cancelAnimationFrame(animationFrame);
  animationFrame = null;
  ui.outputDb.textContent = "−60 dBFS";
  ui.outputMeterFill.style.width = "0%";
}

function loadTrack(file) {
  if (!file) return;
  if (currentFileUrl) URL.revokeObjectURL(currentFileUrl);
  if (demoSource) { try { demoSource.stop(); } catch (_) {} demoSource = null; }
  ui.audio.pause();
  currentFileUrl = URL.createObjectURL(file);
  ui.audio.src = currentFileUrl;
  playbackMode = "file";
  demoOffset = 0;
  ui.title.textContent = file.name.replace(/\.[^.]+$/, "");
  ui.subtitle.textContent = "Your local audio file · volume is controlled in this player";
  ui.currentTime.textContent = "0:00";
  ui.duration.textContent = "0:00";
  ui.seek.value = "0";
  setPlaying(false);
}

function seekTo(value) {
  const fraction = Number(value) / 100;
  if (playbackMode === "file" && Number.isFinite(ui.audio.duration) && ui.audio.duration > 0) ui.audio.currentTime = ui.audio.duration * fraction;
  else if (demoBuffer) {
    demoOffset = demoBuffer.duration * fraction;
    if (isPlaying) startDemo();
    else ui.currentTime.textContent = formatTime(demoOffset);
  }
}

ui.attemptList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-attempt]");
  if (button) setAttempt(Number(button.dataset.attempt));
});
ui.previous.addEventListener("click", () => setAttempt(currentAttempt - 1));
ui.next.addEventListener("click", () => setAttempt(currentAttempt === attempts.length - 1 ? 0 : currentAttempt + 1));
ui.mechanism.addEventListener("input", handleMechanismInput);
ui.mechanism.addEventListener("click", handleMechanismClick);
ui.mechanism.addEventListener("keydown", (event) => {
  if (currentAttempt === 3 && event.target.closest("#numberGrid")) {
    const direction = { ArrowUp: "up", ArrowRight: "right", ArrowDown: "down", ArrowLeft: "left" }[event.key];
    if (direction) { event.preventDefault(); moveMaze(direction); }
  }
  if (currentAttempt === 5 && event.target.classList.contains("digit-segment") && ["Enter", " "].includes(event.key)) {
    event.preventDefault();
    event.target.click();
  }
  if (currentAttempt === 6 && event.target.id === "tiltLauncher" && ["ArrowUp", "ArrowDown"].includes(event.key)) {
    event.preventDefault();
    launchAngle = clamp(launchAngle + (event.key === "ArrowUp" ? 5 : -5), 0, 65);
    updateCatapultReadout();
  }
  if (currentAttempt === 0 && event.target.id === "tiltBar" && ["ArrowLeft", "ArrowRight"].includes(event.key)) {
    event.preventDefault();
    updateSoundbarTilt(soundbarAngle + (event.key === "ArrowRight" ? 1 : -1));
  }
});
ui.mechanism.addEventListener("pointerdown", (event) => {
  const button = event.target.closest("#pumpButton");
  if (button) { event.preventDefault(); button.setPointerCapture(event.pointerId); startPump(); return; }
  const soundbar = event.target.closest("#tiltBar");
  const soundbarGrip = event.target.closest(".tilt-grip");
  if (soundbar && soundbarGrip && currentAttempt === 0) {
    soundbarDrag = { startY: event.clientY, startAngle: soundbarAngle, side: soundbarGrip.dataset.side };
    soundbarPhysicsPosition = volume;
    soundbarPhysicsVelocity = 0;
    soundbarPhysicsLastTime = 0;
    soundbar.classList.add("is-dragging");
    soundbarGrip.setPointerCapture(event.pointerId);
    event.preventDefault();
    soundbarPhysicsFrame = requestAnimationFrame(stepSoundbarGravity);
    return;
  }
  const launcher = event.target.closest("#tiltLauncher");
  if (launcher && currentAttempt === 6) {
    launcherGesture = { startY: event.clientY, startAngle: launchAngle };
    launcher.setPointerCapture(event.pointerId);
    event.preventDefault();
    return;
  }
  const volumeDot = event.target.closest(".volume-dot-token");
  if (volumeDot && currentAttempt === 5) {
    draggingVolumeDot = volumeDotTokens[Number(volumeDot.dataset.volumeDot)];
    volumeDot.classList.add("dragging");
    volumeDot.style.position = "fixed";
    volumeDot.style.left = `${event.clientX}px`;
    volumeDot.style.top = `${event.clientY}px`;
    volumeDot.style.pointerEvents = "none";
    volumeDot.setPointerCapture(event.pointerId);
    event.preventDefault();
    return;
  }
  const dot = event.target.closest(".sound-dot");
  if (!dot || currentAttempt !== 5) return;
  draggingDot = dotState[Number(dot.dataset.dot)];
  dot.classList.add("dragging");
  dot.setPointerCapture(event.pointerId);
  event.preventDefault();
});
ui.mechanism.addEventListener("pointermove", (event) => {
  if (soundbarDrag) {
    const lift = event.clientY - soundbarDrag.startY;
    const direction = soundbarDrag.side === "left" ? -1 : 1;
    updateSoundbarTilt(soundbarDrag.startAngle + lift * direction * 0.55);
  }
  if (launcherGesture) {
    launchAngle = clamp(launcherGesture.startAngle - (event.clientY - launcherGesture.startY) * 0.8, 0, 65);
    updateCatapultReadout();
  }
  if (draggingVolumeDot) updateVolumeDotFromPointer(event);
  if (draggingDot) updateDotFromPointer(event);
});
ui.mechanism.addEventListener("pointerup", (event) => {
  if (soundbarDrag) releaseSoundbarTilt();
  if (launcherGesture) { launcherGesture = null; launchProjectile(); }
  if (draggingVolumeDot) finishVolumeDotDrag(event);
  if (draggingDot) finishDotDrag();
  if (event.target.closest("#pumpButton")) stopPump();
});
ui.mechanism.addEventListener("pointercancel", (event) => { if (soundbarDrag) releaseSoundbarTilt(); launcherGesture = null; if (draggingVolumeDot) finishVolumeDotDrag(event); if (draggingDot) finishDotDrag(); stopPump(); });
ui.mechanism.addEventListener("lostpointercapture", stopPump);
ui.play.addEventListener("click", togglePlayback);
document.querySelector("#loadTrackButton").addEventListener("click", () => ui.picker.click());
ui.picker.addEventListener("change", (event) => loadTrack(event.target.files[0]));
ui.seek.addEventListener("input", (event) => seekTo(event.target.value));
ui.audio.addEventListener("loadedmetadata", () => { ui.duration.textContent = formatTime(ui.audio.duration); ui.seek.value = "0"; });
ui.audio.addEventListener("timeupdate", () => {
  if (playbackMode !== "file") return;
  ui.currentTime.textContent = formatTime(ui.audio.currentTime);
  if (Number.isFinite(ui.audio.duration) && ui.audio.duration > 0) ui.seek.value = String((ui.audio.currentTime / ui.audio.duration) * 100);
});
ui.audio.addEventListener("play", () => setPlaying(true));
ui.audio.addEventListener("pause", () => { if (playbackMode === "file" && isPlaying) setPlaying(false); });
ui.audio.addEventListener("ended", () => setPlaying(false));

setAttempt(0);
setVolume(volume);
