import { TUNING } from '../config/GameTuning.ts';

export type KickResult = 'PERFECT' | 'GOOD' | 'NO GOOD';

export function judgeKick(x: number, center: number = TUNING.goalCenterX, width: number = TUNING.goalWidth, perfectRange: number = TUNING.perfectRange): KickResult {
  const distance = Math.abs(x - center);
  if (distance >= width / 2) return 'NO GOOD';
  return distance < perfectRange ? 'PERFECT' : 'GOOD';
}

export interface FlightOptions { targetY: number; endScale: number; windOffset: number; startX?: number }
const DEFAULT_FLIGHT: FlightOptions = { targetY: TUNING.goalTargetY, endScale: TUNING.ballEndScale, windOffset: 0 };

// Mutates a reusable position object, avoiding per-frame allocations.
export function flightPose(t: number, targetX: number, out: { x: number; y: number; scale: number; rotation: number }, options: FlightOptions = DEFAULT_FLIGHT) {
  t = Math.max(0, Math.min(1, t));
  const startX = options.startX ?? TUNING.ballStartX;
  out.x = startX + (targetX - startX) * t + options.windOffset * t * t;
  out.y = TUNING.ballStartY + (options.targetY - TUNING.ballStartY) * t - TUNING.arcHeight * 4 * t * (1 - t);
  out.scale = TUNING.ballStartScale + (options.endScale - TUNING.ballStartScale) * t * t;
  out.rotation = TUNING.ballSpin * t;
  return out;
}
