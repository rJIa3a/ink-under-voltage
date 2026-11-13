'use strict';

const canvas = document.querySelector('#game');
const ctx = canvas.getContext('2d');
const ui = Object.fromEntries(['health', 'panel', 'screen', 'kicker', 'title', 'message', 'action', 'sound'].map(id => [id, document.getElementById(id)]));
const ground = 406;
const width = canvas.width;
const height = canvas.height;
const panels = [
  { name: '01 / ПЕЧАТНЫЙ ЦЕХ', art: 'press', enemies: [{ x: 510, hp: 3 }, { x: 760, hp: 4 }] },
  { name: '02 / КРЫША ТИПОГРАФИИ', art: 'roof', enemies: [{ x: 440, hp: 3 }, { x: 750, hp: 7, heavy: true }] },
];
const attacks = {
  hit: { duration: .27, windup: .08, reach: 102, damage: 1, push: 245, height: 91, word: 'ХРЯСЬ!', strength: 4 },
  sweep: { duration: .43, windup: .13, reach: 116, damage: 2, push: 335, height: 24, word: 'ШВЫХ!', strength: 6 },
  'air-kick': { duration: .38, windup: .075, reach: 130, damage: 2, push: 460, height: 60, word: 'БАХ!', strength: 9 },
};
const images = new Map();
for (const name of ['press', 'roof', 'vera-sweep', 'vera-air-kick', ...['vera', 'golem'].flatMap(actor => ['idle', 'walk', 'hit'].map(pose => actor + '-' + pose))]) {
  const image = new Image();
  image.src = 'assets/' + name + '.png';
  images.set(name, image);
}

const keys = new Set();
const pressed = new Set();
const controls = new Set(['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD', 'Space', 'KeyX', 'KeyZ', 'KeyC', 'Enter', 'KeyP', 'KeyR']);
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
let audio;
let muted = false;
let state;

function prepareAudio() {
  if (muted || !window.AudioContext) return;
  audio ??= new AudioContext();
  if (audio.state === 'suspended') audio.resume().catch(() => {});
}

function sound(from, to, duration, volume, shape = 'triangle') {
  if (muted || audio?.state !== 'running') return;
  const now = audio.currentTime;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = shape;
  osc.frequency.setValueAtTime(from, now);
  osc.frequency.exponentialRampToValueAtTime(to, now + duration);
  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(.001, now + duration);
  osc.connect(gain).connect(audio.destination);
  osc.start(now);
  osc.stop(now + duration);
}

function actor(x, extra = {}) {
  return { x, y: ground, vy: 0, face: 1, hp: 100, stun: 0, flash: 0, push: 0, stride: 0, walking: false, ...extra };
}

function reset(mode = 'title') {
  state = { mode, panel: 0, hero: actor(115), effects: [], time: 0, shake: 0, freeze: 0, combo: 0, comboTime: 0, attack: 0, buffer: 0, open: false, transition: 0 };
  loadPanel();
  refreshOverlay();
}

function loadPanel() {
  state.enemies = panels[state.panel].enemies.map(config => actor(config.x, { ...config, face: -1, maxHp: config.hp, attack: 0, cooldown: .6, fade: 0 }));
  state.open = false;
  ui.panel.textContent = panels[state.panel].name;
}

function refreshOverlay() {
  const mode = state.mode;
  ui.screen.hidden = mode === 'play';
  document.querySelector('.hud').hidden = mode === 'title';
  ui.health.value = state.hero.hp;
  if (mode === 'play') return;
  const content = {
    title: ['ЭКШЕН-КОМИКС', 'Чернила<br>под током', 'Ночной тираж ожил. Помоги Вере пробиться на крышу типографии и отключить реле.', 'Начать выпуск'],
    pause: ['ПАУЗА', 'Перерыв', 'Выпуск ждёт тебя.', 'Продолжить'],
    win: ['КОНЕЦ ВЫПУСКА', 'Тираж<br>остановлен', 'Реле погасло. Ночной тираж больше не выйдет из-под пресса.', 'Сыграть снова'],
    loss: ['КОНЕЦ ВЫПУСКА', 'Сбой<br>печати', 'Бумажные громилы захватили типографию. Попробуй блокировать удары клавишей C.', 'Попробовать снова'],
  }[mode];
  ui.kicker.textContent = content[0];
  ui.title.innerHTML = content[1];
  ui.message.textContent = content[2];
  ui.action.innerHTML = content[3] + ' <span>↵</span>';
}

function activate() {
  prepareAudio();
  if (state.mode === 'pause') {
    state.mode = 'play';
    refreshOverlay();
  } else if (state.mode !== 'play') reset('play');
  ui.action.blur();
}

function keyDown(code) {
  if (!keys.has(code)) pressed.add(code);
  keys.add(code);
}

window.addEventListener('keydown', event => {
  if (!controls.has(event.code) || event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.code === 'Enter' && event.target instanceof HTMLButtonElement) return;
  event.preventDefault();
  if (event.repeat) return;
  prepareAudio();
  if (event.code === 'Enter') activate();
  if (event.code === 'KeyR') reset('play');
  if (event.code === 'KeyP' && ['play', 'pause'].includes(state.mode)) {
    state.mode = state.mode === 'play' ? 'pause' : 'play';
    refreshOverlay();
  }
  keyDown(event.code);
});
window.addEventListener('keyup', event => keys.delete(event.code));
window.addEventListener('blur', () => {
  keys.clear();
  pressed.clear();
  if (state.mode === 'play') {
    state.mode = 'pause';
    refreshOverlay();
  }
});
ui.action.addEventListener('click', activate);
ui.sound.addEventListener('click', () => {
  muted = !muted;
  ui.sound.textContent = muted ? 'Звук выключен' : 'Звук включён';
  ui.sound.setAttribute('aria-pressed', String(!muted));
  prepareAudio();
});
document.querySelectorAll('[data-key]').forEach(button => {
  const code = button.dataset.key;
  button.addEventListener('pointerdown', event => {
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    prepareAudio();
    keyDown(code);
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    button.addEventListener(type, () => keys.delete(code));
  }
});

function impact(x, y, word, color, strength) {
  state.shake = strength;
  state.freeze = strength >= 5 ? .048 : .025;
  state.effects.push({ x, y, word, color, life: .58 });
  sound(170 + strength * 12, 48, .16, .12, 'sawtooth');
}

function updateActor(unit, dt) {
  unit.stun = Math.max(0, unit.stun - dt);
  unit.flash = Math.max(0, unit.flash - dt);
  unit.x = clamp(unit.x + unit.push * dt, 44, 920);
  unit.push *= Math.exp(-11 * dt);
  if (unit.walking) unit.stride += dt * 11;
}

function advance(dt) {
  if (state.mode !== 'play') return;
  const hero = state.hero;
  if (pressed.has('KeyX') || pressed.has('KeyZ')) {
    state.buffer = .19;
    state.kickQueued = pressed.has('KeyZ');
  }
  if (pressed.has('Space')) hero.jumpBuffer = .12;
  state.time += dt;
  if (state.freeze > 0) {
    state.freeze -= dt;
    return;
  }
  state.shake = Math.max(0, state.shake - 32 * dt);
  for (const effect of state.effects) effect.life -= dt;
  state.effects = state.effects.filter(effect => effect.life > 0);

  if (state.transition > 0) {
    state.transition = Math.min(1, state.transition + dt * 1.38);
    if (state.transition >= 1) {
      state.panel++;
      hero.x = 105;
      hero.y = ground;
      hero.vy = 0;
      hero.push = 0;
      hero.hp = Math.min(100, hero.hp + 18);
      ui.health.value = hero.hp;
      state.transition = 0;
      loadPanel();
    }
    return;
  }

  updateActor(hero, dt);
  state.comboTime -= dt;
  state.buffer -= dt;
  const direction = Number(keys.has('ArrowRight') || keys.has('KeyD')) - Number(keys.has('ArrowLeft') || keys.has('KeyA'));
  hero.guard = keys.has('KeyC') && state.attack <= 0 && hero.y === ground && hero.stun <= 0;
  hero.walking = direction !== 0 && state.attack <= .12 && hero.stun <= 0 && !hero.guard;
  if (hero.walking) {
    hero.face = direction;
    hero.x = clamp(hero.x + direction * (state.attack > 0 ? 155 : 247) * dt, 44, 920);
  }
  hero.jumpBuffer = Math.max(0, (hero.jumpBuffer || 0) - dt);
  if (hero.jumpBuffer > 0 && state.attack <= 0 && hero.y === ground && hero.stun <= 0 && !hero.guard) {
    hero.jumpBuffer = 0;
    if (state.open && hero.x >= 847) {
      if (state.panel + 1 === panels.length) {
        state.mode = 'win';
        refreshOverlay();
        sound(280, 700, .32, .1);
      } else {
        state.transition = .001;
        state.attack = 0;
        sound(160, 470, .3, .09);
      }
      return;
    }
    hero.vy = -530;
    sound(145, 255, .11, .04);
  }
  if (hero.y < ground || hero.vy < 0) {
    hero.vy += 1420 * dt;
    hero.y = Math.min(ground, hero.y + hero.vy * dt);
    if (hero.y === ground) hero.vy = 0;
  }

  if (state.attack <= 0 && hero.stun <= 0 && !hero.guard && (state.buffer > 0 || keys.has('KeyX'))) {
    const kick = state.buffer > 0 && state.kickQueued;
    state.combo = kick ? 0 : state.comboTime > 0 ? state.combo % 3 + 1 : 1;
    state.comboTime = kick ? 0 : .57;
    state.attackPose = kick && hero.y < ground ? 'air-kick' : kick || state.combo === 3 ? 'sweep' : 'hit';
    state.attack = attacks[state.attackPose].duration;
    state.attackHit = false;
    state.buffer = 0;
    sound(kick ? 165 : 125, 72, .09, .025, 'square');
  }
  if (state.attack > 0) {
    const move = attacks[state.attackPose];
    if (state.attackPose === 'air-kick' && hero.y < ground) {
      hero.x = clamp(hero.x + hero.face * 150 * dt, 44, 920);
    }
    state.attack -= dt;
    if (!state.attackHit && state.attack <= move.duration - move.windup) {
      state.attackHit = true;
      const impactY = hero.y - move.height;
      for (const enemy of state.enemies) {
        const distance = (enemy.x - hero.x) * hero.face;
        const top = enemy.y - (enemy.heavy ? 161 : 130);
        if (enemy.hp <= 0 || distance < -14 || distance > move.reach || impactY < top || impactY > enemy.y) continue;
        enemy.hp = Math.max(0, enemy.hp - move.damage);
        enemy.flash = .14;
        enemy.stun = state.attackPose === 'sweep' ? .49 : .29;
        enemy.attack = 0;
        enemy.cooldown = .47;
        enemy.push = hero.face * move.push;
        impact(enemy.x, impactY, move.word, '#ffd367', move.strength);
      }
    }
  }

  for (const enemy of state.enemies) {
    updateActor(enemy, dt);
    enemy.walking = false;
    if (enemy.hp <= 0) {
      enemy.fade += dt;
      continue;
    }
    if (enemy.stun > 0) continue;
    const distance = hero.x - enemy.x;
    if (enemy.attack > 0) {
      enemy.attack -= dt;
      if (!enemy.struck && enemy.attack <= .20) {
        enemy.struck = true;
        if (hero.y > ground - 63 && distance * enemy.face > -12 && Math.abs(distance) < 95 && hero.flash <= 0) {
          const blocked = hero.guard && hero.face === -enemy.face;
          hero.hp = Math.max(0, hero.hp - (blocked ? 0 : enemy.heavy ? 24 : 15));
          hero.flash = blocked ? .2 : .62;
          hero.stun = blocked ? .10 : .3;
          hero.push = enemy.face * (blocked ? 90 : 410);
          state.attack = 0;
          ui.health.value = hero.hp;
          impact(hero.x, hero.y - 92, blocked ? 'КЛАНГ!' : 'УФ!', blocked ? '#9df0e4' : '#ff9a85', blocked ? 3 : 7);
          if (hero.hp === 0) {
            state.mode = 'loss';
            refreshOverlay();
            return;
          }
        }
      }
      continue;
    }
    enemy.face = distance < 0 ? -1 : 1;
    enemy.cooldown -= dt;
    if (Math.abs(distance) > 78 && Math.abs(distance) < 440) {
      const blockedByAlly = state.enemies.some(other => other !== enemy && other.hp > 0 && Math.abs(other.x - enemy.x) < 65 && (other.x - enemy.x) * enemy.face > 0);
      if (!blockedByAlly) {
        enemy.walking = true;
        enemy.x += enemy.face * (enemy.heavy ? 98 : 126) * dt;
      }
    } else if (Math.abs(distance) <= 78 && enemy.cooldown <= 0 && hero.y > ground - 80) {
      enemy.attack = enemy.heavy ? .66 : .51;
      enemy.struck = false;
      enemy.cooldown = enemy.heavy ? .36 : .55;
    }
  }
  if (!state.open && state.enemies.every(enemy => enemy.hp <= 0)) {
    state.open = true;
    sound(260, 520, .28, .08);
  }
}
function backdrop(panel, x) {
  ctx.fillStyle = '#261925';
  ctx.fillRect(x, 0, width, height);
  const image = images.get(panel.art);
  if (image.naturalWidth) {
    const cropHeight = image.naturalWidth / 2;
    const cropTop = Math.max(0, (image.naturalHeight - cropHeight) * .95);
    ctx.drawImage(image, 0, cropTop, image.naturalWidth, Math.min(cropHeight, image.naturalHeight), x, 0, width, height);
  }
  const wash = ctx.createLinearGradient(0, 0, 0, height);
  wash.addColorStop(0, '#120e1d66');
  wash.addColorStop(.3, '#150e2300');
  wash.addColorStop(.83, '#140b1a22');
  wash.addColorStop(1, '#1109179c');
  ctx.fillStyle = wash;
  ctx.fillRect(x, 0, width, height);
  ctx.strokeStyle = '#170f16';
  ctx.lineWidth = 7;
  ctx.strokeRect(x + 3, 3, width - 6, height - 6);
}

function drawActor(unit, enemy = false) {
  const offset = enemy ? 0 : state.transition;
  const x = unit.x + (offset ? (width + 34 + 105 - unit.x) * offset : 0);
  const y = unit.y - (offset ? 120 * Math.sin(offset * Math.PI) : 0);
  const size = enemy ? unit.heavy ? 161 : 130 : 125;
  const punching = enemy ? unit.attack > 0 && unit.attack <= .26 : state.attack > 0 && state.attackHit;
  const pose = punching ? (enemy ? 'hit' : state.attackPose) : unit.walking && Math.floor(unit.stride) % 2 === 0 ? 'walk' : 'idle';
  const image = images.get((enemy ? 'golem' : 'vera') + '-' + pose);
  ctx.save();
  ctx.globalAlpha = enemy && unit.hp <= 0 ? Math.max(0, 1 - unit.fade * 2.1) : 1;
  ctx.fillStyle = '#0e0b14a8';
  ctx.beginPath();
  ctx.ellipse(x, ground + 3, size * .30, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  if (unit.guard) {
    ctx.strokeStyle = '#9deee0';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(x, y - 67, 43, unit.face > 0 ? -1.22 : 1.91, unit.face > 0 ? 1.22 : 4.37);
    ctx.stroke();
  }
  ctx.translate(Math.round(x), Math.round(y));
  ctx.scale(unit.face, 1);
  if (unit.flash > 0 && Math.floor(unit.flash * 24) % 2 === 0) ctx.filter = 'brightness(1.7)';
  if (image.naturalWidth) {
    const spriteWidth = Math.round(image.naturalWidth * size / image.naturalHeight);
    const anchor = pose === 'sweep' ? .34 : pose === 'air-kick' ? .40 : pose === 'hit' ? enemy ? .42 : .34 : pose === 'walk' ? .48 : .5;
    const poseHeight = pose === 'sweep' ? 76 : pose === 'air-kick' ? 100 : size;
    const poseWidth = Math.round(spriteWidth * poseHeight / size);
    const footLift = pose === 'air-kick' ? 12 : 0;
    ctx.drawImage(image, Math.round(-poseWidth * anchor), -poseHeight - footLift, poseWidth, poseHeight);
  }
  ctx.restore();
  if (enemy && unit.hp > 0) {
    ctx.fillStyle = '#19111b';
    ctx.fillRect(x - 25, y - size - 15, 50, 6);
    ctx.fillStyle = unit.attack > .26 ? '#f4ac5e' : '#ed6c72';
    ctx.fillRect(x - 24, y - size - 14, 48 * unit.hp / unit.maxHp, 4);
    if (unit.attack > .26) {
      ctx.font = '900 24px system-ui';
      ctx.textAlign = 'center';
      ctx.strokeStyle = '#170f16';
      ctx.lineWidth = 4;
      ctx.strokeText('!', x, y - size - 22);
      ctx.fillText('!', x, y - size - 22);
    }
  }
}

function exitSign() {
  const x = 858;
  const y = 154;
  const open = state.open;
  ctx.save();
  ctx.translate(x, y + (open ? 3 * Math.sin(state.time * 7) : 0));
  ctx.rotate(-.07);
  ctx.fillStyle = open ? '#ffce59' : '#413241';
  ctx.strokeStyle = '#160f15';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-70, -16);
  ctx.lineTo(26, -16);
  ctx.lineTo(26, -27);
  ctx.lineTo(62, 0);
  ctx.lineTo(26, 27);
  ctx.lineTo(26, 16);
  ctx.lineTo(-70, 16);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = open ? '#1d1420' : '#f2d7bd';
  ctx.font = '900 15px system-ui';
  ctx.textAlign = 'center';
  ctx.fillText(open ? state.panel === 0 ? 'ПРОБЕЛ' : 'РЕЛЕ · ␣' : 'ЗАКРЫТО', -12, 6);
  ctx.restore();
}

function render() {
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#f0dbac';
  ctx.fillRect(0, 0, width, height);
  ctx.save();
  if (state.transition) {
    const p = state.transition;
    ctx.translate(-Math.round((width + 34) * (p * p * (3 - 2 * p))), 0);
    backdrop(panels[state.panel + 1], width + 34);
  } else if (state.shake) {
    ctx.translate(Math.round(Math.sin(state.time * 148) * state.shake), 0);
  }
  backdrop(panels[state.panel], 0);
  if (state.mode !== 'title') {
    if (!state.transition && state.mode !== 'win') exitSign();
    for (const enemy of state.enemies) drawActor(enemy, true);
    drawActor(state.hero);
    for (const effect of state.effects) {
      const elapsed = .58 - effect.life;
      ctx.save();
      ctx.globalAlpha = Math.min(1, effect.life * 5);
      ctx.translate(effect.x, effect.y - 32 - elapsed * 82);
      ctx.rotate(-.12);
      ctx.font = 'italic 950 37px system-ui';
      ctx.textAlign = 'center';
      ctx.strokeStyle = '#1e131a';
      ctx.lineWidth = 7;
      ctx.lineJoin = 'round';
      ctx.strokeText(effect.word, 0, 0);
      ctx.fillStyle = effect.color;
      ctx.fillText(effect.word, 0, 0);
      ctx.restore();
    }
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
    advance(1 / 120);
    pressed.clear();
    remainder -= 1 / 120;
  }
  render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);


