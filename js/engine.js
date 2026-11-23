// Pure deterministic isometric block-stacking engine (browser ESM & Node testable)

export const BASE_SIZE = 3.2;
export const SLAB_H = 0.54;
export const PERFECT_TOL = 0.14;
export const SWING_LIMIT = 4.6;
export const MIN_SLAB = 0.08;

export function createStackState() {
  const base = { x: 0, y: 0, z: 0, w: BASE_SIZE, d: BASE_SIZE, colorIndex: 0 };
  return {
    phase: 'ready', // 'ready' | 'playing' | 'over'
    score: 0,
    best: 0,
    perfectStreak: 0,
    time: 0,
    overLock: 0,
    stack: [base],
    active: null, // { x, y, z, w, d, axis: 'x'|'z', dir: 1|-1, speed, colorIndex }
    debris: [],   // sliced falling overhang pieces
    fxEvents: []  // consumed by 3D renderer
  };
}

function spawnNextSlab(state) {
  const top = state.stack[state.stack.length - 1];
  const level = state.stack.length;
  const axis = level % 2 === 1 ? 'x' : 'z';
  const dir = level % 4 < 2 ? 1 : -1;
  const speed = Math.min(7.9, 4.1 + state.score * 0.12);

  state.active = {
    x: axis === 'x' ? -dir * SWING_LIMIT : top.x,
    y: level * SLAB_H,
    z: axis === 'z' ? -dir * SWING_LIMIT : top.z,
    w: top.w,
    d: top.d,
    axis,
    dir,
    speed,
    colorIndex: level
  };
}

export function startStackRun(state) {
  const prevBest = state.best;
  const fresh = createStackState();
  Object.assign(state, fresh);
  state.best = prevBest;
  state.phase = 'playing';
  spawnNextSlab(state);
  state.fxEvents.push({ type: 'reset' });
}

export function dropSlab(state) {
  const res = {
    started: false,
    restarted: false,
    placed: false,
    perfect: false,
    expanded: false,
    missed: false,
    streak: 0
  };

  if (state.phase === 'ready') {
    startStackRun(state);
    res.started = true;
    return res;
  }

  if (state.phase === 'over') {
    if (state.overLock > 0) return res;
    startStackRun(state);
    res.restarted = true;
    return res;
  }

  const cur = state.active;
  const prev = state.stack[state.stack.length - 1];
  if (!cur || !prev) return res;

  const isX = cur.axis === 'x';
  const delta = isX ? cur.x - prev.x : cur.z - prev.z;
  const absDelta = Math.abs(delta);
  const size = isX ? cur.w : cur.d;

  // Complete miss -> entire active slab tumbles away
  if (absDelta >= size - MIN_SLAB) {
    state.debris.push({
      x: cur.x,
      y: cur.y,
      z: cur.z,
      w: cur.w,
      d: cur.d,
      vx: isX ? Math.sign(delta || cur.dir) * 1.4 : 0,
      vy: 0.4,
      vz: !isX ? Math.sign(delta || cur.dir) * 1.4 : 0,
      rx: !isX ? Math.sign(delta || 1) * 2.2 : 0.4,
      rz: isX ? -Math.sign(delta || 1) * 2.2 : 0.4,
      colorIndex: cur.colorIndex,
      life: 2.6
    });
    state.active = null;
    state.phase = 'over';
    state.overLock = 0.42;
    res.missed = true;
    state.fxEvents.push({ type: 'miss', x: cur.x, y: cur.y, z: cur.z });
    return res;
  }

  // Perfect snap alignment!
  if (absDelta <= PERFECT_TOL) {
    state.perfectStreak += 1;
    let newW = prev.w;
    let newD = prev.d;
    let expanded = false;

    // Reward 5+ consecutive perfect drops by subtly expanding slab back toward BASE_SIZE
    if (state.perfectStreak >= 5 && (newW < BASE_SIZE || newD < BASE_SIZE)) {
      if (isX) newW = Math.min(BASE_SIZE, newW + 0.28);
      else newD = Math.min(BASE_SIZE, newD + 0.28);
      expanded = true;
    }

    const landed = {
      x: prev.x,
      y: cur.y,
      z: prev.z,
      w: newW,
      d: newD,
      colorIndex: cur.colorIndex
    };
    state.stack.push(landed);
    state.score += 1;
    if (state.score > state.best) state.best = state.score;

    res.placed = true;
    res.perfect = true;
    res.expanded = expanded;
    res.streak = state.perfectStreak;
    state.fxEvents.push({ type: 'perfect', slab: landed, streak: state.perfectStreak, expanded });
    spawnNextSlab(state);
    return res;
  }

  // Partial overlap -> cleanly slice overhang off
  state.perfectStreak = 0;
  const overlap = size - absDelta;
  const cutSize = absDelta;
  const sign = Math.sign(delta);

  const landed = {
    x: isX ? prev.x + delta * 0.5 : prev.x,
    y: cur.y,
    z: !isX ? prev.z + delta * 0.5 : prev.z,
    w: isX ? overlap : cur.w,
    d: !isX ? overlap : cur.d,
    colorIndex: cur.colorIndex
  };
  state.stack.push(landed);

  const cutCenterOffset = sign * (overlap * 0.5 + cutSize * 0.5);
  const cutPiece = {
    x: isX ? landed.x + cutCenterOffset : landed.x,
    y: cur.y,
    z: !isX ? landed.z + cutCenterOffset : landed.z,
    w: isX ? cutSize : cur.w,
    d: !isX ? cutSize : cur.d,
    vx: isX ? sign * (1.1 + cutSize * 0.5) : 0,
    vy: 0.25,
    vz: !isX ? sign * (1.1 + cutSize * 0.5) : 0,
    rx: !isX ? sign * 2.8 : 0.2,
    rz: isX ? -sign * 2.8 : 0.2,
    colorIndex: cur.colorIndex,
    life: 2.2
  };
  state.debris.push(cutPiece);

  state.score += 1;
  if (state.score > state.best) state.best = state.score;

  res.placed = true;
  state.fxEvents.push({ type: 'slice', slab: landed, cut: cutPiece });
  spawnNextSlab(state);
  return res;
}

export function stepStack(state, dt) {
  const cdt = Math.min(0.035, Math.max(0.001, dt));
  state.time += cdt;
  if (state.overLock > 0) state.overLock = Math.max(0, state.overLock - cdt);

  if (state.phase === 'playing' && state.active) {
    const a = state.active;
    if (a.axis === 'x') {
      a.x += a.dir * a.speed * cdt;
      if (a.x > SWING_LIMIT) { a.x = SWING_LIMIT; a.dir = -1; }
      else if (a.x < -SWING_LIMIT) { a.x = -SWING_LIMIT; a.dir = 1; }
    } else {
      a.z += a.dir * a.speed * cdt;
      if (a.z > SWING_LIMIT) { a.z = SWING_LIMIT; a.dir = -1; }
      else if (a.z < -SWING_LIMIT) { a.z = -SWING_LIMIT; a.dir = 1; }
    }
  }

  for (let i = state.debris.length - 1; i >= 0; i--) {
    const d = state.debris[i];
    d.vy -= 14.5 * cdt;
    d.x += d.vx * cdt;
    d.y += d.vy * cdt;
    d.z += d.vz * cdt;
    d.life -= cdt;
    if (d.life <= 0) state.debris.splice(i, 1);
  }
}
