'use strict';

const canvas = document.getElementById('jump');
const ctx = canvas.getContext('2d');
const hint = document.getElementById('hint');
const W = canvas.width;
const H = canvas.height;
const floor = 368;
const handY = 204;
const panels = [
  { left: 0, right: 844, label: 'ПЕЧАТНЫЙ ЦЕХ', art: 'press' },
  { left: 980, right: 1824, label: 'КРЫША', art: 'roof' },
];
const art = {};
for (const name of ['press', 'roof', 'vera-idle', 'vera-walk', 'vault-reach', 'vault-hang', 'vault-pull', 'vault-land']) {
  const image = new Image();
  image.src = '../assets/' + name + '.png';
  art[name] = image;
}

const held = new Set();
const pointers = new Map();
const controls = new Set(['ArrowLeft', 'ArrowRight', 'Space', 'KeyR']);
let jumpQueued = false;
let state;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = p => p * p * (3 - 2 * p);

function reset() {
  state = { x: 595, y: floor, panel: 0, face: 1, camera: 320, phase: 'ground', t: 0, stride: 0, passes: 0 };
  jumpQueued = false;
  hint.textContent = 'Подойди к рамке и прыгни';
}

function phase(name, message) {
  state.phase = name;
  state.t = 0;
  if (message) hint.textContent = message;
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

function update(dt) {
  const s = state;
  const panel = panels[s.panel];
  const dir = s.panel === 0 ? 1 : -1;
  const edge = dir === 1 ? panel.right : panel.left;
  const jump = jumpQueued;
  jumpQueued = false;
  s.t += dt;
  switch (s.phase) {
    case 'ground': {
      const move = Number(down('ArrowRight')) - Number(down('ArrowLeft'));
      if (move) s.face = move;
      s.x = clamp(s.x + move * 248 * dt, panel.left + 37, panel.right - 37);
      s.stride = move ? s.stride + dt * 10 : 0;
      if (jump && Math.abs(s.x - edge) <= 148) {
        s.from = s.x;
        s.edge = edge;
        s.face = dir;
        phase('reach', 'Прыжок к рамке');
      } else if (jump) {
        s.vy = -420;
        phase('hop');
      }
      break;
    }
    case 'hop':
      s.vy += dt * 1300;
      s.y = Math.min(floor, s.y + dt * s.vy);
      if (s.y === floor) phase('ground');
      break;
    case 'reach': {
      const p = clamp(s.t / .38, 0, 1);
      s.x = lerp(s.from, s.edge - dir * 46, ease(p));
      s.y = lerp(floor, handY + 115, ease(p)) - 30 * Math.sin(Math.PI * p);
      if (p === 1) phase('hang', 'Вис на рамке · нажми прыжок ещё раз');
      break;
    }
    case 'hang':
      if (jump) phase('pull', 'Подтягивание');
      break;
    case 'pull':
      if (s.t >= .36) {
        s.from = s.edge - dir * 42;
        s.to = dir === 1 ? panels[1].left + 108 : panels[0].right - 108;
        phase('cross', 'Перелёт');
      }
      break;
    case 'cross': {
      const p = clamp(s.t / .74, 0, 1);
      s.x = lerp(s.from, s.to, p);
      s.y = lerp(handY + 104, floor, p) - 102 * Math.sin(p * Math.PI);
      if (p === 1) {
        s.panel = 1 - s.panel;
        s.passes++;
        phase('land', 'Приземление');
      }
      break;
    }
    case 'land':
      if (s.t >= .28) phase('ground', 'Можно прыгнуть обратно');
      break;
  }
  const cameraTarget = clamp(s.x - W / 2 + dir * 65, 0, panels[1].right - W);
  s.camera += (cameraTarget - s.camera) * (1 - Math.exp(-4.3 * dt));
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

function render() {
  const s = state;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#f0dbac';
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.translate(-Math.round(s.camera), 0);
  panels.forEach(drawPanel);
  for (const x of [panels[0].right, panels[1].left]) {
    ctx.fillStyle = '#271b25';
    ctx.fillRect(x - 9, handY - 6, 18, 12);
    ctx.fillStyle = '#ffce61';
    ctx.fillRect(x - 7, handY - 3, 14, 6);
  }
  if (s.phase !== 'hang' && s.phase !== 'pull' && panels.some(p => s.x > p.left && s.x < p.right)) {
    ctx.fillStyle = '#170f1b88';
    ctx.beginPath();
    ctx.ellipse(s.x, floor + 3, 27, 5, 0, 0, 2 * Math.PI);
    ctx.fill();
  }
  if (s.phase === 'hang' || s.phase === 'pull') {
    const pulling = s.phase === 'pull';
    const p = pulling ? ease(clamp(s.t / .36, 0, 1)) : 0;
    const blend = clamp((p - .36) / .35, 0, 1);
    const sway = Math.sin(s.t * 8) * Math.exp(-3.3 * s.t) * .09;
    if (blend < 1) sprite('vault-hang', s.edge, handY, s.face, 145, .932, .038, sway + p * .24, 1 - blend);
    if (blend > 0) sprite('vault-pull', s.edge, handY, s.face, 132, .947, .204, (1 - p) * .26, blend);
    if (!pulling && s.t < .18) {
      ctx.strokeStyle = '#ffe29a';
      ctx.lineWidth = 2;
      for (const dy of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s.edge + s.face * 7, handY + dy * 6);
        ctx.lineTo(s.edge + s.face * (13 + s.t * 35), handY + dy * (10 + s.t * 32));
        ctx.stroke();
      }
    }
  } else if (s.phase === 'reach' || s.phase === 'hop' || s.phase === 'cross') {
    if (s.phase === 'cross' && s.t < .13) {
      const blend = clamp(s.t / .13, 0, 1);
      const handX = s.x + s.face * 42;
      sprite('vault-pull', handX, s.y - 104, s.face, 132, .947, .204, -.22 * blend, 1 - blend);
      sprite('vault-reach', s.x, s.y, s.face, 125, .61, 1, 0, blend);
    } else {
      sprite('vault-reach', s.x, s.y, s.face, 125, .61, 1);
    }
  } else if (s.phase === 'land') {
    sprite('vault-land', s.x, floor, s.face, 97);
    ctx.strokeStyle = '#f9db9a';
    for (const dir of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(s.x + dir * 19, floor);
      ctx.lineTo(s.x + dir * (37 + s.t * 50), floor - 8 - s.t * 20);
      ctx.stroke();
    }
  } else {
    const walk = s.stride && Math.floor(s.stride) % 2 === 0;
    sprite(walk ? 'vera-walk' : 'vera-idle', s.x, floor, s.face, 125);
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
