import test from 'node:test';
import assert from 'node:assert/strict';
import { TUNING } from '../src/config/GameTuning.ts';
import { flightPose, judgeKick } from '../src/game/math.ts';
import { createRound, goalPosition, aimPosition } from '../src/config/levels.ts';
import { newRun, recordKick, readBest, saveBest, streakLabel } from '../src/game/RunState.ts';
import { RunClock } from '../src/game/RunClock.ts';

test('strict boundaries: center is perfect, edges are misses, neighboring kicks remain distinguishable', () => {
  assert.equal(judgeKick(390), 'PERFECT');
  for (const sign of [-1, 1]) {
    assert.equal(judgeKick(390 + sign * 35.99), 'PERFECT');
    assert.equal(judgeKick(390 + sign * 36), 'GOOD');
    assert.equal(judgeKick(390 + sign * 119.99), 'GOOD');
    assert.equal(judgeKick(390 + sign * 120), 'NO GOOD');
  }
});

test('flight finishes inside the opening, shrinks into distance and has a visible arc', () => {
  const pose = { x: 0, y: 0, scale: 0, rotation: 0 };
  flightPose(0, 420, pose);
  assert.deepEqual(pose, { x: 390, y: TUNING.ballStartY, scale: 1, rotation: 0 });
  flightPose(.5, 420, pose);
  assert.equal(pose.y, (TUNING.ballStartY + 570) / 2 - TUNING.arcHeight);
  const midwayScale = pose.scale;
  flightPose(1, 420, pose);
  assert.equal(pose.x, 420);
  assert.equal(pose.y, TUNING.goalTargetY);
  assert.ok(pose.y < TUNING.goalCrossbarY && pose.y > TUNING.goalTopY);
  assert.ok(Math.abs(pose.scale - .28) < 1e-9);
  assert.ok(pose.scale < midwayScale && midwayScale < 1);
  assert.equal(pose.rotation, Math.PI * 5);
});

test('Perfect earns three coins, every third consecutive Perfect adds three, Good resets the streak', () => {
  let run = newRun();
  for (let i = 0; i < 5; i++) run = recordKick(run, 'PERFECT', 25);
  assert.equal(run.score, 18);
  assert.equal(run.streak, 5);
  assert.match(streakLabel(3), /3 STREAK/);
  assert.match(streakLabel(run.streak), /ON FIRE/);
  run = recordKick(run, 'GOOD', 30);
  assert.equal(run.score, 19);
  assert.equal(run.streak, 0);
  assert.equal(run.bestStreak, 5);
  assert.equal(run.lives, 3);
  assert.equal(run.longestGoal, 30);
  for (let i = 0; i < 3; i++) run = recordKick(run, 'PERFECT', 35);
  assert.equal(run.score, 31);
  run = recordKick(run, 'NO GOOD', 35);
  run = recordKick(run, 'PERFECT', 35);
  assert.equal(run.score, 34);
});

test('third miss ends the run; later results cannot change its totals', () => {
  let run = recordKick(newRun(), 'PERFECT', 25);
  for (let i = 0; i < 3; i++) run = recordKick(run, 'NO GOOD', 30);
  assert.deepEqual(run, { score: 3, lives: 0, streak: 0, goalStreak: 0, bestStreak: 1, goals: 1, shots: 4, longestGoal: 25 });
  assert.equal(recordKick(run, 'PERFECT', 60), run);
  assert.equal(newRun().score, 0);
  assert.equal(newRun().lives, 3);
});

test('clock waits for the first kick, expires after 30 seconds and cannot restart itself', () => {
  const clock = new RunClock();
  clock.tick(10_000);
  assert.equal(clock.remainingMs, 30_000);
  clock.start(10_000);
  clock.tick(10_500);
  assert.equal(clock.remainingMs, 29_500);
  clock.start(11_000);
  clock.tick(40_000);
  assert.equal(clock.remainingMs, 0);
  clock.tick(99_000); clock.start(99_000);
  assert.equal(clock.remainingMs, 0);
});

test('clock excludes paused time, handles long frames and repeated pause/resume', () => {
  const clock = new RunClock();
  clock.pause(100); clock.resume(200); clock.tick(400);
  assert.equal(clock.started, false);
  clock.start(1000);
  clock.pause(2250);
  assert.equal(clock.remainingMs, 28_750);
  clock.tick(20_000);
  clock.resume(20_000); clock.tick(21_000);
  assert.equal(clock.remainingMs, 27_750);
  clock.pause(21_000); clock.pause(22_000); clock.resume(30_000);
  clock.tick(60_000);
  assert.equal(clock.remainingMs, 0);
});

test('combo bonus is paid on every third Perfect, not on subsequent non-milestone kicks', () => {
  let run = newRun();
  for (let i = 1; i <= 9; i++) {
    const previous = run.score;
    run = recordKick(run, 'PERFECT', 25);
    assert.equal(run.score - previous, i % 3 === 0 ? 6 : 3);
  }
  assert.equal(run.score, 36);
});

test('challenge sequence changes lanes and launch sides, with a double-coin shot every third goal', () => {
  for (const seed of [0, .1, .25, .5, .75, .9, 1]) {
    let previous;
    for (let goals = 0; goals < 60; goals++) {
      const r = createRound(goals, () => seed, previous);
      assert.equal(r.distance, Math.min(25 + goals * 5, 60));
      assert.equal(r.pattern === 'GOLD', goals % 3 === 2);
      assert.equal(r.rewardMultiplier, goals % 3 === 2 ? 2 : 1);
      assert.ok(r.goalScale >= .608 && r.goalScale <= 1);
      if (previous) {
        assert.notEqual(r.lane, previous.lane);
        assert.notEqual(r.startX, previous.startX);
        assert.notEqual(r.pattern, previous.pattern);
        assert.ok(Math.abs(r.centerX - previous.centerX) >= 105);
      }
      assert.equal(judgeKick(aimPosition(0, r) + r.windOffset, r.centerX, r.width, r.perfectRange), 'NO GOOD');
      // Also test scheduling after a shot caught the moving gate away from its anchor.
      r.centerX = goalPosition(goals * .47, r);
      previous = r;
    }
  }
});

test('all challenge types and wind extremes have reachable timing windows and fit the screen', () => {
  for (const seed of [0, .1, .25, .5, .75, .9, 1]) {
    let previous;
    for (let i = 0; i < 40; i++) {
      const r = createRound(i, () => seed, previous);
      let perfect = false, good = false, miss = false, longestGoodWindow = 0, currentWindow = 0;
      for (let t = 0; t < 6; t += .005) {
        const x = goalPosition(t, r), aim = aimPosition(t, r);
        assert.ok(x - 150 * r.goalScale >= 23 && x + 150 * r.goalScale <= 757);
        assert.ok(aim > 0 && aim < 780);
        const result = judgeKick(aim + r.windOffset, x, r.width, r.perfectRange);
        perfect ||= result === 'PERFECT'; good ||= result === 'GOOD'; miss ||= result === 'NO GOOD';
        currentWindow = result === 'NO GOOD' ? 0 : currentWindow + .005;
        longestGoodWindow = Math.max(longestGoodWindow, currentWindow);
      }
      assert.ok(perfect && good && miss, `${r.pattern} level ${i + 1} lacks a reachable outcome`);
      assert.ok(longestGoodWindow >= .18, `${r.pattern} level ${i + 1} window is too short`);
      assert.equal(r.centerX, goalPosition(0, r));
      assert.ok(r.moveRange > 0 && r.moveSpeed > 0, `${r.pattern} must move after relocation`);
      assert.notEqual(goalPosition(.1, r), r.centerX);
      previous = r;
    }
  }
});

test('all goal types move uniformly, reverse immediately and accelerate with progress', () => {
  for (const seed of [0, .5, 1]) {
    for (const goals of [0, 1, 2, 6, 14, 40]) {
      const r = createRound(goals, () => seed);
      const direction = r.phase === 0 ? 1 : -1;
      const edgeTime = r.moveRange / r.moveSpeed;
      const edgeX = r.centerX + direction * r.moveRange;
      const step = .01;
      for (const t of [0, edgeTime / 2, edgeTime - step * 2]) {
        const velocity = (goalPosition(t + step, r) - goalPosition(t, r)) / step;
        assert.ok(Math.abs(velocity - direction * r.moveSpeed) < 1e-7);
      }
      assert.ok(Math.abs(goalPosition(edgeTime, r) - edgeX) < 1e-7);
      const inset = direction * r.moveSpeed * step;
      for (const t of [edgeTime - step, edgeTime + step]) {
        assert.ok(Math.abs(goalPosition(t, r) - (edgeX - inset)) < 1e-7);
      }
      assert.ok(Math.abs(goalPosition(4 * edgeTime, r) - r.centerX) < 1e-7);
      assert.ok(createRound(goals + 3, () => seed).moveSpeed > r.moveSpeed);
    }
  }
});

test('gold doubles shot coins while paying the combo bonus once', () => {
  let run = recordKick(newRun(), 'PERFECT', 25);
  run = recordKick(run, 'PERFECT', 30);
  run = recordKick(run, 'PERFECT', 35, 2);
  assert.equal(run.score, 15); // 3 + 3 + 6 + 3 combo bonus.
  assert.equal(recordKick(run, 'GOOD', 35, 2).score, 17);
  assert.equal(recordKick(run, 'NO GOOD', 35, 2).score, 15);
});

test('the locked aim and wind reproduce the exact judged landing position at all distances', () => {
  for (let i = 0; i < 30; i++) {
    const r = createRound(i, () => .8);
    const aim = aimPosition(.7, r);
    const pose = { x: 0, y: 0, scale: 0, rotation: 0 };
    flightPose(0, aim, pose, r); assert.equal(pose.x, r.startX);
    flightPose(1, aim, pose, r); assert.ok(Math.abs(pose.x - aim - r.windOffset) < 1e-9);
    assert.equal(pose.y, r.targetY);
    assert.ok(pose.y > r.topY && pose.y < r.crossbarY);
    assert.ok(Math.abs(r.width / 2 - 120 * r.goalScale) < 1e-9);
  }
});

test('best-score persistence tolerates missing, corrupt and denied storage', () => {
  for (const value of [null, 'bad', '-3', 'Infinity', '1.3']) assert.equal(readBest({ getItem: () => value }), 0);
  assert.equal(readBest({ getItem: () => '42' }), 42);
  assert.equal(readBest({ getItem: () => { throw new Error('blocked'); } }), 0);
  assert.doesNotThrow(() => saveBest({ setItem: () => { throw new Error('quota'); } }, 12));
  let saved = '';
  saveBest({ setItem: (_key, value) => { saved = value; } }, 12);
  assert.equal(saved, '12');
});

test('mixed Good and Perfect goals keep the cheer streak without granting Perfect bonuses', () => {
  let run = newRun();
  for (const result of ['PERFECT', 'GOOD', 'GOOD', 'PERFECT', 'GOOD', 'GOOD']) {
    run = recordKick(run, result, 25);
  }
  assert.equal(run.goalStreak, 6);
  assert.equal(run.streak, 0);
  assert.equal(run.score, 10);
  run = recordKick(run, 'NO GOOD', 25);
  assert.equal(run.goalStreak, 0);
  run = recordKick(run, 'GOOD', 25);
  assert.equal(run.goalStreak, 1);
  assert.equal(newRun().goalStreak, 0);
});
