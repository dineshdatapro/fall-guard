import { POSE_EDGES } from "../domain/landmarks.ts";
import type { Landmark } from "../domain/types.ts";

export interface ViewRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function containRect(boxW: number, boxH: number, mediaW: number, mediaH: number): ViewRect {
  if (!mediaW || !mediaH) return { x: 0, y: 0, w: boxW, h: boxH };
  const scale = Math.min(boxW / mediaW, boxH / mediaH);
  const w = mediaW * scale;
  const h = mediaH * scale;
  return { x: (boxW - w) / 2, y: (boxH - h) / 2, w, h };
}

export function drawRoom(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const wall = ctx.createLinearGradient(0, 0, 0, height);
  wall.addColorStop(0, "#314056");
  wall.addColorStop(0.58, "#1d2734");
  wall.addColorStop(1, "#141a22");
  ctx.fillStyle = wall;
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#10161d";
  ctx.beginPath();
  ctx.moveTo(0, height * 0.74);
  ctx.lineTo(width, height * 0.68);
  ctx.lineTo(width, height);
  ctx.lineTo(0, height);
  ctx.fill();

  ctx.strokeStyle = "rgba(215, 255, 246, 0.28)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(width * 0.1, height * 0.8);
  ctx.lineTo(width * 0.9, height * 0.8);
  ctx.stroke();

  ctx.fillStyle = "rgba(215, 255, 246, 0.08)";
  ctx.beginPath();
  ctx.ellipse(width * 0.5, height * 0.84, width * 0.28, height * 0.035, 0, 0, Math.PI * 2);
  ctx.fill();
}

export function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  landmarks: Landmark[],
  view: ViewRect,
): void {
  const point = (index: number) => {
    const landmark = landmarks[index];
    if (!landmark || !Number.isFinite(landmark.x) || !Number.isFinite(landmark.y)) return null;
    if ((landmark.visibility ?? 1) < 0.25) return null;
    return { x: view.x + landmark.x * view.w, y: view.y + landmark.y * view.h };
  };

  const strokeEdges = (color: string, width: number) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const [start, end] of POSE_EDGES) {
      const a = point(start);
      const b = point(end);
      if (!a || !b) continue;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  };

  strokeEdges("rgba(6, 16, 18, 0.65)", 5);
  strokeEdges("#d7fff6", 2.25);

  for (let index = 0; index < landmarks.length; index += 1) {
    const at = point(index);
    if (!at) continue;
    const hip = index === 23 || index === 24;
    ctx.fillStyle = hip ? "#f2c14e" : "#fffaf3";
    ctx.beginPath();
    ctx.arc(at.x, at.y, hip ? 4.5 : 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function prepareCanvas(canvas: HTMLCanvasElement): { ctx: CanvasRenderingContext2D; width: number; height: number } | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, width: rect.width, height: rect.height };
}
