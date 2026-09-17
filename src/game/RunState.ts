import { RUN_RULES } from '../config/levels.ts';
import type { KickResult } from './math.ts';

export interface RunState {
  score: number;
  lives: number;
  streak: number;
  goalStreak: number;
  bestStreak: number;
  goals: number;
  shots: number;
  longestGoal: number;
}

export function newRun(): RunState {
  return { score: 0, lives: RUN_RULES.lives, streak: 0, goalStreak: 0, bestStreak: 0, goals: 0, shots: 0, longestGoal: 0 };
}

export function recordKick(run: RunState, result: KickResult, distance: number, multiplier = 1): RunState {
  if (run.lives <= 0) return run;
  const streak = result === 'PERFECT' ? run.streak + 1 : 0;
  const made = result !== 'NO GOOD';
  return {
    score: run.score + kickReward(result, streak, multiplier),
    lives: run.lives - (made ? 0 : 1),
    streak,
    goalStreak: made ? run.goalStreak + 1 : 0,
    bestStreak: Math.max(run.bestStreak, streak),
    goals: run.goals + Number(made),
    shots: run.shots + 1,
    longestGoal: made ? Math.max(run.longestGoal, distance) : run.longestGoal,
  };
}

export function kickReward(result: KickResult, streak: number, multiplier = 1): number {
  if (result === 'NO GOOD') return 0;
  if (result === 'GOOD') return RUN_RULES.goodPoints * multiplier;
  return RUN_RULES.perfectPoints * multiplier + (streak > 0 && streak % RUN_RULES.comboEvery === 0 ? RUN_RULES.comboBonus : 0);
}

export function streakLabel(streak: number) {
  return streak >= 5 ? `ON FIRE  /  ${streak} STREAK` : streak >= 2 ? `${streak} STREAK` : '';
}

export function readBest(storage: Pick<Storage, 'getItem'>): number {
  try {
    const value = Number(storage.getItem(RUN_RULES.bestStorageKey));
    return Number.isSafeInteger(value) && value >= 0 ? value : 0;
  } catch { return 0; }
}

export function saveBest(storage: Pick<Storage, 'setItem'>, best: number) {
  try { storage.setItem(RUN_RULES.bestStorageKey, String(best)); } catch { /* Keep the session playable when storage is blocked. */ }
}
