'use client';
import { useEffect, useRef, useState } from 'react';

const MAX_WIDTH = 600;

/**
 * Hand-drawn signature (finger or mouse) exported as a PNG data URL, or null when empty.
 * The server accepts PNG only, up to 200 kB, so the canvas is capped at 600 px wide.
 */
export default function SignaturePad({ onChange, height = 160, label = 'Tanda tangan' }: {
  onChange: (dataUrl: string | null) => void; height?: number; label?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  const reset = () => {
    const canvas = canvasRef.current; if (!canvas) return;
    const width = Math.min(MAX_WIDTH, Math.round(canvas.getBoundingClientRect().width) || MAX_WIDTH);
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    setEmpty(true); onChangeRef.current(null);
  };
  useEffect(reset, [height]);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!, rect = canvas.getBoundingClientRect();
    return { x: (e.clientX - rect.left) * (canvas.width / rect.width), y: (e.clientY - rect.top) * (canvas.height / rect.height) };
  };
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const ctx = canvasRef.current!.getContext('2d')!, p = point(e);
    drawing.current = true; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + 0.1, p.y + 0.1); ctx.stroke();
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current!.getContext('2d')!, p = point(e);
    ctx.lineTo(p.x, p.y); ctx.stroke();
  };
  const up = () => {
    if (!drawing.current) return;
    drawing.current = false; setEmpty(false);
    onChangeRef.current(canvasRef.current!.toDataURL('image/png'));
  };

  return (
    <div className="flex flex-col gap-xs">
      <div className="flex items-center justify-between">
        <span className="font-label-sm text-label-sm text-on-surface-variant uppercase">{label}</span>
        <button type="button" onClick={reset} disabled={empty} className="text-[12px] font-bold text-primary disabled:opacity-40">Hapus</button>
      </div>
      <canvas ref={canvasRef} aria-label={`${label}: gambar dengan jari atau mouse`} role="img"
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={up}
        style={{ height, touchAction: 'none' }}
        className="w-full rounded-lg border-2 border-dashed border-outline-variant bg-white cursor-crosshair" />
      {empty && <span className="text-[11px] text-on-surface-variant">Tanda tangani di dalam kotak.</span>}
    </div>
  );
}
