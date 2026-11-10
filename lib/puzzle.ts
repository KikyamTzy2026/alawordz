import { getPool, isFilipino } from "./words";

const DIRS: [number, number][] = [
  [0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, -1], [1, -1], [-1, 1],
];
const rnd = (n: number) => Math.floor(Math.random() * n);
const rev = (s: string) => Array.from(s).reverse().join("");
function shuffle<T>(a: T[]): T[] {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = rnd(i + 1);
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

const FILL_EN = "AAAABCCDDEEEEFGHIIIJKLLMNNOOOPQRRSSTTUUVWXYZ";
const FILL_FIL = "AAAAAABBDEEGGIIIIKKLLMMNNNNOOOPPRSSTTUUUWY";

function attempt(pool: string[], size: number, target: number, fil: boolean) {
  const maxLen = Math.min(14, size - 2);
  const cand: string[] = [];
  for (const w of shuffle(pool)) {
    if (w.length < 3 || w.length > maxLen) continue;
    const r = rev(w);
    // avoid words that contain (or are contained in) another selected word, in either direction
    if (cand.some((c) => c.includes(w) || w.includes(c) || c.includes(r) || r.includes(c))) continue;
    cand.push(w);
    if (cand.length >= target + 10) break;
  }
  cand.sort((a, b) => b.length - a.length);

  const g: string[][] = Array.from({ length: size }, () => Array<string>(size).fill(""));
  const placed: string[] = [];
  for (const w of cand) {
    if (placed.length >= target) break;
    const L = Array.from(w);
    for (let t = 0; t < 300; t++) {
      const [dr, dc] = DIRS[rnd(8)];
      const r0 = rnd(size);
      const c0 = rnd(size);
      const r1 = r0 + dr * (L.length - 1);
      const c1 = c0 + dc * (L.length - 1);
      if (r1 < 0 || r1 >= size || c1 < 0 || c1 >= size) continue;
      let fits = true;
      for (let i = 0; i < L.length; i++) {
        const v = g[r0 + dr * i][c0 + dc * i];
        if (v !== "" && v !== L[i]) { fits = false; break; }
      }
      if (!fits) continue;
      for (let i = 0; i < L.length; i++) g[r0 + dr * i][c0 + dc * i] = L[i];
      placed.push(w);
      break;
    }
  }
  const fill = fil ? FILL_FIL : FILL_EN;
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++) if (g[r][c] === "") g[r][c] = fill[rnd(fill.length)];
  return { grid: g.map((row) => row.join("")), words: placed };
}

export function buildPuzzle(categoryId: string, size: number) {
  const target = size >= 20 ? 30 + rnd(6) : 25 + rnd(6); // 18x18: 25-30 words, 20x20: 30-35 words
  const pool = getPool(categoryId);
  const fil = isFilipino(categoryId);
  let best = attempt(pool, size, target, fil);
  for (let i = 0; i < 6 && best.words.length < Math.min(25, target); i++) {
    const next = attempt(pool, size, target, fil);
    if (next.words.length > best.words.length) best = next;
  }
  best.words.sort((a, b) => a.localeCompare(b, "fil"));
  return best;
}
