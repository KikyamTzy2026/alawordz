"use client";
import { useMemo, useRef, useState } from "react";
import type { ClaimView } from "@/lib/types";
import type { Cell } from "@/hooks/useRoom";

export interface LiveSel { color: string; a: Cell; b: Cell }
interface Props {
  grid: string[];
  claims: (ClaimView & { color: string })[];
  myColor: string;
  canPlay: boolean;
  others: LiveSel[];
  flash: { a: Cell; b: Cell; key: number } | null;
  onSelect: (a: Cell, b: Cell) => void;
  onLive: (a: Cell | null, b: Cell | null) => void;
}

function Cap({ a, b, color, o, cls }: { a: Cell; b: Cell; color: string; o: number; cls?: string }) {
  if (a[0] === b[0] && a[1] === b[1])
    return <circle className={cls} cx={a[1] + 0.5} cy={a[0] + 0.5} r={0.39} fill={color} fillOpacity={o} />;
  return (
    <line
      className={cls}
      x1={a[1] + 0.5} y1={a[0] + 0.5} x2={b[1] + 0.5} y2={b[0] + 0.5}
      stroke={color} strokeOpacity={o} strokeWidth={0.78} strokeLinecap="round"
    />
  );
}

export default function Board({ grid, claims, myColor, canPlay, others, flash, onSelect, onLive }: Props) {
  const N = grid.length;
  const letters = useMemo(() => grid.map((r) => Array.from(r)), [grid]);
  const ref = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<{ a: Cell; b: Cell } | null>(null);

  const claimedCells = useMemo(() => {
    const s = new Set<string>();
    for (const c of claims) {
      const n = Math.max(Math.abs(c.b[0] - c.a[0]), Math.abs(c.b[1] - c.a[1]));
      const dr = Math.sign(c.b[0] - c.a[0]), dc = Math.sign(c.b[1] - c.a[1]);
      for (let i = 0; i <= n; i++) s.add(`${c.a[0] + dr * i},${c.a[1] + dc * i}`);
    }
    return s;
  }, [claims]);

  const clamp = (v: number) => Math.max(0, Math.min(N - 1, v));
  const point = (e: React.PointerEvent) => {
    const rect = ref.current!.getBoundingClientRect();
    return [((e.clientX - rect.left) / rect.width) * N, ((e.clientY - rect.top) / rect.height) * N] as const;
  };
  // Snap the pointer to the nearest of the 8 straight directions from the start cell
  const snap = (a: Cell, x: number, y: number): Cell => {
    const dx = x - (a[1] + 0.5), dy = y - (a[0] + 0.5);
    if (Math.hypot(dx, dy) < 0.5) return a;
    const k = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
    const sx = Math.round(Math.cos((k * Math.PI) / 4)), sy = Math.round(Math.sin((k * Math.PI) / 4));
    let steps = Math.round((dx * sx + dy * sy) / (sx * sx + sy * sy));
    while (steps > 0) {
      const r = a[0] + sy * steps, c = a[1] + sx * steps;
      if (r >= 0 && r < N && c >= 0 && c < N) break;
      steps--;
    }
    steps = Math.max(steps, 0);
    return [a[0] + sy * steps, a[1] + sx * steps];
  };

  const down = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!canPlay) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const [x, y] = point(e);
    const a: Cell = [clamp(Math.floor(y)), clamp(Math.floor(x))];
    setDrag({ a, b: a });
    onLive(a, a);
  };
  const move = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!drag) return;
    const [x, y] = point(e);
    const b = snap(drag.a, x, y);
    if (b[0] !== drag.b[0] || b[1] !== drag.b[1]) {
      setDrag({ a: drag.a, b });
      onLive(drag.a, b);
    }
  };
  const up = () => {
    if (!drag) return;
    const d = drag;
    setDrag(null);
    onLive(null, null);
    if (d.a[0] !== d.b[0] || d.a[1] !== d.b[1]) onSelect(d.a, d.b);
  };

  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${N} ${N}`}
      className="block h-full w-full select-none"
      style={{ touchAction: "none", cursor: canPlay ? "crosshair" : "default" }}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
    >
      {claims.map((c) => <Cap key={c.word} a={c.a} b={c.b} color={c.color} o={0.45} />)}
      {others.map((o, i) => <Cap key={`o${i}`} a={o.a} b={o.b} color={o.color} o={0.3} />)}
      {flash && <Cap key={flash.key} a={flash.a} b={flash.b} color="#ef4444" o={0.8} cls="flash-bad" />}
      {drag && <Cap a={drag.a} b={drag.b} color={myColor} o={0.55} />}
      {letters.map((row, r) =>
        row.map((ch, c) => {
          const hit = claimedCells.has(`${r},${c}`);
          return (
            <text
              key={r * N + c} x={c + 0.5} y={r + 0.5} dy="0.35em" textAnchor="middle"
              fontSize={0.58} fontWeight={hit ? 800 : 600} fill={hit ? "#ffffff" : "#cbd5e1"}
              style={{ pointerEvents: "none" }}
            >
              {ch}
            </text>
          );
        })
      )}
    </svg>
  );
}
