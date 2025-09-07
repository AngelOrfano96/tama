// supabase/functions/_shared/treasure_gen.ts

// --- PRNG e seed helpers (identici tra client e server) ---
export function mulberry32(a: number) {
  return function () {
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash32(a: number, b: number) {
  a = (a ^ 0x9e3779b9) >>> 0;
  a = (a ^ ((a << 6) >>> 0) ^ ((a >>> 2) >>> 0)) >>> 0;
  a = (a + b + 0x7f4a7c15) >>> 0;
  a ^= a << 13;
  a ^= a >>> 17;
  a ^= a << 5;
  return a >>> 0;
}

export function seedForLevel(baseSeed: number, level: number) {
  return hash32(baseSeed >>> 0, level >>> 0);
}

// --- tipi e configurazione mappa ---
export type Device = "mobile" | "desktop";
export type Cell = { rx: number; ry: number; x: number; y: number };
export type LevelSpec = {
  exitRoom: { rx: number; ry: number };
  exitTile: { x: number; y: number };
  coins: Cell[];
  powerups: Cell[];
};

const GRID_POOL_DESKTOP: Array<[number, number]> = [
  [2, 2],
  [3, 2],
  [2, 3],
  [3, 3],
  [4, 3],
  [3, 4],
];
const GRID_POOL_MOBILE: Array<[number, number]> = [
  [2, 2],
  [3, 2],
  [2, 3],
  [3, 3],
];

function pickGridForLevel(level: number, dev: Device, rand: () => number) {
  const pool = dev === "mobile" ? GRID_POOL_MOBILE : GRID_POOL_DESKTOP;
  const band = Math.min(pool.length - 1, Math.floor((level - 1) / 3));
  const j = Math.max(0, band - 1);
  const k = Math.min(pool.length - 1, band + 1);
  const idx = j + Math.floor(rand() * (k - j + 1));
  const [w, h] = pool[idx];
  return { gridW: w, gridH: h };
}

function roomWH(dev: Device) {
  const w = dev === "mobile" ? 7 : 9;
  const h = 8;
  return { roomW: w, roomH: h };
}

function getDoorSpan(dev: Device) {
  return dev === "mobile" ? 2 : 3;
}

function doorIndices(mid: number, span: number, min: number, max: number) {
  const k = Math.floor(span / 2);
  let start: number, end: number;
  if (span % 2) {
    start = mid - k;
    end = mid + k;
  } else {
    start = mid - (k - 1);
    end = mid + k;
  }
  start = Math.max(min, start);
  end = Math.min(max, end);
  const arr: number[] = [];
  for (let i = start; i <= end; i++) arr.push(i);
  return arr;
}

// --- generatore livello deterministico ---
export function generateLevelSpec(
  level: number,
  baseSeed: number,
  dev: Device,
): LevelSpec {
  const rand = mulberry32(seedForLevel(baseSeed, level));
  const { gridW, gridH } = pickGridForLevel(level, dev, rand);
  const { roomW, roomH } = roomWH(dev);
  const span = getDoorSpan(dev);
  const midRow = Math.floor(roomH / 2);
  const midCol = Math.floor(roomW / 2);
  const ys = doorIndices(midRow, span, 1, roomH - 2);
  const xs = doorIndices(midCol, span, 1, roomW - 2);

  // porte: per evitare spawn su “bordi aperti”
  const openings = new Map<
    string,
    { left: number[]; right: number[]; top: number[]; bottom: number[] }
  >();
  const openKey = (rx: number, ry: number) => `${rx},${ry}`;
  for (let ry = 0; ry < gridH; ry++) {
    for (let rx = 0; rx < gridW; rx++) {
      const left: number[] = [];
      const right: number[] = [];
      const top: number[] = [];
      const bottom: number[] = [];
      // NB: gridW per E/O, gridH per N/S
      if (rx < gridW - 1) for (const y of ys) right.push(y);
      if (rx > 0) for (const y of ys) left.push(y);
      if (ry < gridH - 1) for (const x of xs) bottom.push(x);
      if (ry > 0) for (const x of xs) top.push(x);
      openings.set(openKey(rx, ry), { left, right, top, bottom });
    }
  }

  function isOpening(rx: number, ry: number, tx: number, ty: number) {
    const op = openings.get(openKey(rx, ry))!;
    if (tx === 0 && op.left.includes(ty)) return true;
    if (tx === roomW - 1 && op.right.includes(ty)) return true;
    if (ty === 0 && op.top.includes(tx)) return true;
    if (ty === roomH - 1 && op.bottom.includes(tx)) return true;
    return false;
  }

  function isWall(rx: number, ry: number, tx: number, ty: number) {
    const onEdge = tx === 0 || ty === 0 || tx === roomW - 1 || ty === roomH - 1;
    if (!onEdge) return false;
    return !isOpening(rx, ry, tx, ty);
    }

  // stanza di uscita (non centrale)
  let exitRX: number, exitRY: number;
  do {
    exitRX = Math.floor(rand() * gridW);
    exitRY = Math.floor(rand() * gridH);
  } while (exitRX === Math.floor(gridW / 2) && exitRY === Math.floor(gridH / 2));
  const exitTile = { x: roomW - 2, y: roomH - 2 };

  const coins: Cell[] = [];
  const powerups: Cell[] = [];

  for (let ry = 0; ry < gridH; ry++) {
    for (let rx = 0; rx < gridW; rx++) {
      const isExitRoom = rx === exitRX && ry === exitRY;

      // 2..3 monete (1 nella stanza di uscita)
      const nCoins = isExitRoom ? 1 : 2 + Math.floor(rand() * 2);
      const used = new Set<string>();
      const key = (x: number, y: number) => `${x},${y}`;

      let tries = 0;
      while (used.size < nCoins && tries++ < 200) {
        const x = 1 + Math.floor(rand() * (roomW - 2));
        const y = 1 + Math.floor(rand() * (roomH - 2));
        if (isWall(rx, ry, x, y)) continue;
        if (isExitRoom && x === exitTile.x && y === exitTile.y) continue;
        used.add(key(x, y));
      }
      for (const k of used) {
        const [x, y] = k.split(",").map(Number);
        coins.push({ rx, ry, x, y });
      }

      // powerup ~35% (singolo, non su coin, non su uscita)
      if (rand() < 0.35) {
        let px = 0,
          py = 0,
          t = 0;
        while (t++ < 50) {
          px = 1 + Math.floor(rand() * (roomW - 2));
          py = 1 + Math.floor(rand() * (roomH - 2));
          if (isWall(rx, ry, px, py)) continue;
          if (isExitRoom && px === exitTile.x && py === exitTile.y) continue;
          if (used.has(`${px},${py}`)) continue;
          powerups.push({ rx, ry, x: px, y: py });
          break;
        }
      }
    }
  }

  return { exitRoom: { rx: exitRX, ry: exitRY }, exitTile, coins, powerups };
}
