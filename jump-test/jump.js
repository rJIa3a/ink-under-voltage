'use strict';

const canvas = document.getElementById('jump');
const ctx = canvas.getContext('2d');
const hint = document.getElementById('hint');
const replayButton = document.getElementById('replay');
const W = canvas.width;
const H = canvas.height;
const floor = 368;
const launchTime = .17;
const plantTime = .125;
const gripY = floor - 79;
const flightTime = .73;
const landingTime = .24;
const exitDistance = 68;
const panelWidth = 844;
const gutterWidth = 110;
const roofLeft = panelWidth + gutterWidth;
const panels = [
  { left: 0, right: panelWidth, label: 'ПЕЧАТНЫЙ ЦЕХ', art: 'press' },
  { left: roofLeft, right: roofLeft + panelWidth, label: 'КРЫША', art: 'roof' },
];
const art = {};
for (const name of ['press', 'roof', 'vera-idle', 'vera-walk', 'vault-reach', 'vault-ready', 'vault-dive', 'vault-land', 'vault-plant', 'vault-tuck', 'vault-twist', 'vault-unwind', 'vault-release', 'vault-extend', 'vault-recover']) {
  const image = new Image();
  image.src = '../assets/' + name + '.png';
  art[name] = image;
}

const held = new Set();
const pointers = new Map();
const controls = new Set(['ArrowLeft', 'ArrowRight', 'Space', 'KeyR']);
let jumpQueued = false;
let state;
let lastJump;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = p => p * p * (3 - 2 * p);

function reset() {
  state = { x: 595, y: floor, panel: 0, face: 1, camera: 85, phase: 'ground', t: 0, stride: 0, passes: 0, effects: [] };
  jumpQueued = false;
  lastJump = null;
  replayButton.disabled = true;
  hint.textContent = 'Иди к жёлтой стрелке';
}

function phase(name, message) {
  state.phase = name;
  state.t = 0;
  if (message) hint.textContent = message;
}

function burst(type, x, y, direction) {
  state.effects.push({ type, x, y, direction, age: 0, duration: type === 'land' ? .32 : .25 });
}

function keyDown(key) {
  if (key === 'Space') jumpQueued = true;
  if (key === 'KeyR') reset();
  held.add(key);
}

window.addEventListener('keydown', event => {
  if (!controls.has(event.code) || event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.code === 'Space' && event.target instanceof HTMLButtonElement) return;
  event.preventDefault();
  if (!event.repeat) keyDown(event.code);
});
window.addEventListener('keyup', event => held.delete(event.code));
window.addEventListener('blur', () => {
  held.clear();
  pointers.clear();
  jumpQueued = false;
  document.querySelectorAll('.pressed').forEach(button => button.classList.remove('pressed'));
});
document.getElementById('reset').addEventListener('click', reset);
replayButton.addEventListener('click', () => {
  if (!lastJump || state.phase !== 'ground') return;
  held.clear();
  pointers.clear();
  jumpQueued = false;
  Object.assign(state, lastJump, { effects: [], stride: 0 });
  startVault(lastJump.direction, lastJump.edge);
});
document.querySelectorAll('[data-key]').forEach(button => {
  const key = button.dataset.key;
  button.addEventListener('pointerdown', event => {
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, key);
    button.classList.add('pressed');
    if (key === 'Space') jumpQueued = true;
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    button.addEventListener(type, event => {
      pointers.delete(event.pointerId);
      button.classList.remove('pressed');
    });
  }
});
function down(key) {
  return held.has(key) || Array.from(pointers.values()).includes(key);
}

function cameraAt(panelIndex, x) {
  const panel = panels[panelIndex];
  const direction = panelIndex === 0 ? 1 : -1;
  const edge = direction === 1 ? panel.right : panel.left;
  const base = direction === 1 ? 0 : panel.right - W;
  const peek = clamp(1 - Math.abs(x - edge) / 470, 0, 1) * 205;
  return base + direction * peek;
}

function startVault(direction, edge) {
  const s = state;
  lastJump = { x: s.x, y: s.y, camera: s.camera, panel: s.panel, direction, edge };
  replayButton.disabled = true;
  s.from = s.x;
  s.edge = edge;
  s.takeoff = edge - direction * 56;
  const next = panels[1 - s.panel];
  s.to = (direction === 1 ? next.left : next.right) + direction * 156;
  s.cameraFrom = s.camera;
  s.cameraTo = cameraAt(1 - s.panel, s.to);
  s.face = direction;
  phase('launch', 'Толчок');
}

function update(dt) {
  const s = state;
  const panel = panels[s.panel];
  const dir = s.panel === 0 ? 1 : -1;
  const edge = dir === 1 ? panel.right : panel.left;
  const jump = jumpQueued;
  jumpQueued = false;
  s.t += dt;
  for (const effect of s.effects) effect.age += dt;
  s.effects = s.effects.filter(effect => effect.age < effect.duration);
  switch (s.phase) {
    case 'ground': {
      const move = Number(down('ArrowRight')) - Number(down('ArrowLeft'));
      if (move) s.face = move;
      if (move || jump) s.landedPose = false;
      s.x = clamp(s.x + move * 248 * dt, panel.left + 37, panel.right - 37);
      s.stride = move ? s.stride + dt * 10 : 0;
      const distance = Math.abs(s.x - edge);
      if ((move === dir && distance <= exitDistance) || (jump && distance <= 126)) {
        startVault(dir, edge);
      } else if (jump) {
        s.vy = -420;
        replayButton.disabled = true;
        phase('hop');
      }
      break;
    }
    case 'hop':
      s.vy += dt * 1300;
      s.y = Math.min(floor, s.y + dt * s.vy);
      if (s.y === floor) {
        phase('ground');
        replayButton.disabled = !lastJump;
      }
      break;
    case 'launch': {
      const p = clamp(s.t / launchTime, 0, 1);
      s.x = lerp(s.from, s.takeoff - dir * 7, p * p);
      if (p === 1) {
        burst('grip', s.edge, gripY, dir);
        phase('plant', 'Упор рукой');
      }
      break;
    }
    case 'plant': {
      const p = clamp(s.t / plantTime, 0, 1);
      s.x = s.takeoff - dir * 7 * (1 - ease(p));
      if (p === 1) phase('cross', 'Перелёт');
      break;
    }
    case 'cross': {
      const p = clamp(s.t / flightTime, 0, 1);
      s.x = lerp(s.takeoff, s.to, p);
      s.y = floor - 126 * 4 * p * (1 - p);
      s.camera = lerp(s.cameraFrom, s.cameraTo, ease(p));
      if (p === 1) {
        s.panel = 1 - s.panel;
        s.stride = 0;
        s.landedPose = true;
        s.passes++;
        burst('land', s.x, floor, dir);
        phase('land', 'Приземление');
      }
      break;
    }
    case 'land':
      if (s.t >= landingTime) {
        phase('ground', 'Иди к стрелке, чтобы прыгнуть обратно');
        replayButton.disabled = false;
      }
      break;
  }
  if (s.phase === 'ground' || s.phase === 'hop') {
    s.camera += (cameraAt(s.panel, s.x) - s.camera) * (1 - Math.exp(-7.5 * dt));
  }
}

function drawPanel(panel) {
  const top = 22;
  const width = panel.right - panel.left;
  const height = 398;
  const image = art[panel.art];
  ctx.fillStyle = '#261a2a';
  ctx.fillRect(panel.left, top, width, height);
  if (image.naturalWidth) {
    const crop = Math.min(image.naturalHeight, image.naturalWidth * height / width);
    ctx.drawImage(image, 0, image.naturalHeight - crop, image.naturalWidth, crop, panel.left, top, width, height);
  }
  ctx.strokeStyle = '#171117';
  ctx.lineWidth = 9;
  ctx.strokeRect(panel.left, top, width, height);
  ctx.fillStyle = '#ffcc57';
  ctx.fillRect(panel.left + 16, top + 12, 172, 28);
  ctx.fillStyle = '#171117';
  ctx.font = '900 16px system-ui';
  ctx.fillText(panel.label, panel.left + 26, top + 32);
}

function sprite(name, x, y, face, height, anchorX = .5, anchorY = 1, tilt = 0, opacity = 1) {
  const img = art[name];
  if (!img.naturalHeight) return;
  const width = img.naturalWidth * height / img.naturalHeight;
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.scale(face, 1);
  ctx.rotate(tilt);
  ctx.globalAlpha = opacity;
  ctx.drawImage(img, Math.round(-width * anchorX), Math.round(-height * anchorY), Math.round(width), height);
  ctx.restore();
}

function drawFlight(s, p) {
  const centerY = s.y - 47;
  if (p < .58) {
    ctx.save();
    ctx.globalAlpha = Math.sin(Math.PI * p / .58) * .75;
    ctx.strokeStyle = '#392935';
    for (let i = 0; i < 3; i++) {
      const tail = s.x - s.face * (49 + i * 8);
      const y = centerY + i * 11;
      ctx.lineWidth = 3 - i * .7;
      ctx.beginPath();
      ctx.moveTo(tail, y);
      ctx.lineTo(tail - s.face * (30 + i * 11), y + 8);
      ctx.stroke();
    }
    ctx.restore();
  }
  if (p < .105) {
    // Carry the contact point into the first release frame, then let the palm travel with Vera.
    const releaseProgress = ease(p / .105);
    const palmX = lerp(s.edge, s.x + s.face * 57, releaseProgress);
    const palmY = lerp(gripY, centerY - 24, releaseProgress);
    sprite('vault-release', palmX, palmY, s.face, 106, .91, .235, lerp(.15, -.06, releaseProgress));
  } else if (p < .195) {
    // Match the leading shoulder across the three push-off cels.
    const extension = (p - .105) / .09;
    sprite('vault-extend', s.x + s.face * lerp(23, 18, extension), centerY - 24, s.face, 89, .70, .36, lerp(-.06, 0, extension));
  } else if (p < .29) {
    sprite('vault-dive', s.x + s.face * 18, centerY - 24, s.face, 80, .61, .27, lerp(0, .07, (p - .195) / .095));
  } else if (p < .46) {
    sprite('vault-tuck', s.x, centerY, s.face, 100, .53, .53);
  } else if (p < .65) {
    sprite('vault-twist', s.x, centerY, s.face, 100, .52, .53);
  } else {
    const recovery = (p - .65) / .35;
    // Shift the sprite's origin from the torso to the forward sole during descent.
    sprite('vault-unwind', s.x, s.y, s.face, 114, lerp(.55, .81, ease(recovery)), .98);
  }
}

function drawEffects(effects) {
  for (const { type, x, y, direction, age, duration } of effects) {
    const p = age / duration;
    const travel = ease(p);
    ctx.save();
    ctx.globalAlpha = (1 - p) ** 1.4;
    if (type === 'grip') {
      ctx.fillStyle = '#fff2b5';
      ctx.fillRect(x - 3, y - 17, 6, 34);
      for (let i = 0; i < 6; i++) {
        const angle = (i - 2.5) * .55;
        const dx = direction * Math.cos(angle);
        const dy = Math.sin(angle);
        const distance = 8 + travel * (19 + i * 3);
        ctx.strokeStyle = i % 2 ? '#ffba50' : '#fff2b5';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x + dx * distance, y + dy * distance);
        ctx.lineTo(x + dx * (distance + 12), y + dy * (distance + 12));
        ctx.stroke();
      }
    } else {
      for (let i = 0; i < 10; i++) {
        const side = i % 2 ? 1 : -1;
        const dx = side * (18 + (18 + i * 4) * travel);
        const dy = 4 + (10 + i * 2) * Math.sin(p * Math.PI * .9);
        ctx.fillStyle = i % 3 === 0 ? '#382737' : '#f4cd81';
        ctx.fillRect(x + dx, y - dy, 8 - p * 5, 3);
      }
    }
    ctx.restore();
  }
}

function render() {
  const s = state;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#f0dbac';
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.translate(-Math.round(s.camera), 0);
  panels.forEach(drawPanel);
  if (s.phase === 'ground' || s.phase === 'hop') {
    const panel = panels[s.panel];
    const dir = s.panel === 0 ? 1 : -1;
    const edge = dir === 1 ? panel.right : panel.left;
    ctx.save();
    ctx.translate(edge - dir * (77 - 5 * Math.sin(s.t * 12)), floor - 156);
    ctx.scale(dir, 1);
    ctx.fillStyle = Math.sin(s.t * 13) < 0 ? '#ffbc42' : '#fff09e';
    ctx.strokeStyle = '#171117';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-31, -8);
    ctx.lineTo(1, -8);
    ctx.lineTo(1, -19);
    ctx.lineTo(29, 0);
    ctx.lineTo(1, 19);
    ctx.lineTo(1, 8);
    ctx.lineTo(-31, 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  if (panels.some(p => s.x > p.left && s.x < p.right)) {
    ctx.fillStyle = '#170f1b88';
    ctx.beginPath();
    ctx.ellipse(s.x, floor + 3, 27, 5, 0, 0, 2 * Math.PI);
    ctx.fill();
  }
  drawEffects(s.effects);
  if (s.phase === 'launch') {
    sprite('vault-ready', s.x, floor, s.face, 94);
  } else if (s.phase === 'plant') {
    const p = clamp(s.t / plantTime, 0, 1);
    sprite('vault-plant', s.edge, gripY, s.face, 92, .982, .222, lerp(-.11, .15, ease(p)));
  } else if (s.phase === 'hop') {
    sprite('vault-reach', s.x, s.y, s.face, 125, .61);
  } else if (s.phase === 'cross') {
    const p = s.t / flightTime;
    drawFlight(s, p);
  } else if (s.phase === 'land') {
    if (s.t < .125) sprite('vault-land', s.x, floor, s.face, 97, .54, .985);
    else sprite('vault-recover', s.x, floor, s.face, 113, .70, .965);
  } else {
    const walk = s.stride && Math.floor(s.stride) % 2 === 0;
    sprite(walk ? 'vera-walk' : 'vera-idle', s.x, floor, s.face, 125, s.landedPose ? .77 : .5);
  }
  ctx.restore();
}

reset();
let last = performance.now();
let remainder = 0;
function frame(now) {
  remainder += clamp((now - last) / 1000, 0, .05);
  last = now;
  while (remainder >= 1 / 120) {
    update(1 / 120);
    remainder -= 1 / 120;
  }
  render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
