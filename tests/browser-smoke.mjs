// Real browser input; state hooks only select reproducible shot timing / deadline boundaries.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 822 }, deviceScaleFactor: 2, hasTouch: true });
const page = await context.newPage();
const errors = [], checks = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
await mkdir('test-results', { recursive: true });
const url = process.env.GAME_URL || 'http://localhost:5173';
const waitState = state => page.waitForFunction(state => {
  const scene = window.__FIELD_GOAL_GAME__?.scene.getScene('Game');
  return scene?.sys.isActive() && scene.state === state;
}, state);
const pagePoint = async (x, y) => {
  const box = await page.locator('canvas').boundingBox();
  return { x: box.x + x / 780 * box.width, y: box.y + y / 1644 * box.height };
};
const tap = async (x, y) => { const point = await pagePoint(x, y); await page.touchscreen.tap(point.x, point.y); };
const snapshot = () => page.evaluate(() => {
  const s = window.__FIELD_GOAL_GAME__.scene.getScene('Game');
  return { state: s.state, run: s.run, round: s.round, result: s.lastResult, best: s.bestScore, count: s.kickCount, paused: s.paused,
    remaining: s.clock.remainingMs, started: s.clock.started, visualTime: s.visualTime, objects: s.children.length, listeners: s.input.listenerCount('pointerdown'),
    hudGoals: s.goalsText.text, hudCoins: s.scoreText.text, hudTime: s.timerText.text, muted: s.muted,
    promptVisible: s.startPrompt.visible };
});
const target = mode => page.evaluate(async mode => {
  const { goalPosition, aimPosition } = await import('/src/config/levels.ts');
  const s = window.__FIELD_GOAL_GAME__.scene.getScene('Game');
  const r = s.round;
  let bestTime = 0, bestLoss = Infinity;
  const desired = (r.perfectRange + r.width / 2) / 2;
  for (let t = 0; t < 20; t += .003) {
    const error = Math.abs(aimPosition(t, r) + r.windOffset - goalPosition(t, r));
    const loss = mode === 'PERFECT' ? error : mode === 'GOOD' ? Math.abs(error - desired) : -error;
    if (loss < bestLoss) { bestLoss = loss; bestTime = t; }
  }
  s.motionTime = bestTime;
  r.centerX = goalPosition(bestTime, r); s.goalVisual.centerX = r.centerX;
  s.aimVisual.x = aimPosition(bestTime, r); s.refreshGoal(); s.drawAim();
}, mode);
const kick = async mode => {
  await waitState('AIMING'); await target(mode);
  await tap(390, 1300);
  await waitState('RESULT');
  const current = await snapshot(); assert.equal(current.result, mode);
  assert.equal(current.hudGoals, String(current.run.goals));
  assert.equal(current.hudCoins, String(current.run.score));
  return current;
};
const restart = async () => { await tap(390, 1135); await waitState('AIMING'); assert.equal((await snapshot()).promptVisible, true); };
const shorten = ms => page.evaluate(ms => {
  const s = window.__FIELD_GOAL_GAME__.scene.getScene('Game');
  s.clock.remainingMs = ms;
  s.clock.lastTime = performance.now();
}, ms);

try {
  await page.goto(url); await waitState('AIMING');
  await page.evaluate(() => {
    const s = window.__FIELD_GOAL_GAME__.scene.getScene('Game');
    window.__endCues = [];
    const play = s.effects.playEndCue.bind(s.effects);
    s.effects.playEndCue = failure => {
      window.__endCues.push({ failure, modalVisible: s.gameOver.visible, state: s.state });
      play(failure);
    };
  });
  const baseline = await snapshot();
  assert.equal(baseline.hudTime, '00:30');
  assert.equal(baseline.promptVisible, true);
  await tap(90, 116);
  assert.equal((await snapshot()).muted, true);
  await tap(90, 116);
  assert.equal((await snapshot()).muted, false);
  await tap(270, 116);
  assert.equal((await snapshot()).count, 0);
  checks.push('Audio toggle and HUD taps never kick or start the clock; goals and coins reflect each result');
  await page.waitForTimeout(700);
  assert.equal((await snapshot()).remaining, 30_000);
  assert.equal((await snapshot()).started, false);
  await page.screenshot({ path: 'outputs/15_variety_ready.png' });
  checks.push('Clock stays at 30s until the first accepted kick');
  let previousLayout = baseline.round;
  for (let i = 1; i <= 3; i++) {
    const s = await kick('PERFECT');
    assert.equal(s.promptVisible, false);
    assert.equal(s.run.score, i === 3 ? 15 : i * 3); assert.equal(s.run.streak, i); assert.equal(s.run.lives, 3);
    if (i === 3) {
      assert.match(await page.evaluate(() => window.__FIELD_GOAL_GAME__.scene.getScene('Game').effects.caption.text), /BONUS \+3/);
    }
    await waitState('AIMING');
    const next = (await snapshot()).round;
    assert.notEqual(next.lane, previousLayout.lane);
    assert.notEqual(next.startX, previousLayout.startX);
    assert.notEqual(next.pattern, previousLayout.pattern);
    assert.equal(await page.evaluate(() => { const s = window.__FIELD_GOAL_GAME__.scene.getScene('Game'); return s.ball.sprite.x; }), next.startX);
    previousLayout = next;
    if (i === 2) { assert.equal(next.pattern, 'GOLD'); await page.screenshot({path:'outputs/17_gold_shot.png'}); }
  }
  checks.push('Perfect gives 3 coins; the third Gold Perfect gives 6 plus the 3-coin combo bonus');
  const good = await kick('GOOD');
  assert.equal(good.run.score, 16); assert.equal(good.run.streak, 0); assert.equal(good.run.bestStreak, 3);
  await waitState('AIMING');
  checks.push('Good gives 1 coin and resets current combo');

  await target('PERFECT');
  const before = (await snapshot()).count;
  { const point = await pagePoint(390, 1300); await page.mouse.click(point.x, point.y, { clickCount: 8, delay: 8 }); }
  const locked = await page.evaluate(() => {
    const s = window.__FIELD_GOAL_GAME__.scene.getScene('Game'); return [s.goal.x, s.lockedAimX, s.finalTargetX, s.lockedRound.wind];
  });
  await page.evaluate(() => window.__FIELD_GOAL_GAME__.events.emit('blur'));
  const frozen = await snapshot();
  await page.waitForTimeout(400);
  assert.equal((await snapshot()).remaining, frozen.remaining);
  assert.equal((await snapshot()).visualTime, frozen.visualTime);
  assert.deepEqual(await page.evaluate(() => {
    const s = window.__FIELD_GOAL_GAME__.scene.getScene('Game'); return [s.goal.x, s.lockedAimX, s.finalTargetX, s.lockedRound.wind];
  }), locked);
  await page.evaluate(() => window.__FIELD_GOAL_GAME__.events.emit('focus')); await waitState('AIMING');
  assert.equal((await snapshot()).count, before + 1);
  assert.equal((await snapshot()).run.score, 19);
  checks.push('Rapid taps count once; pause freezes both the clock and the in-flight shot');
  const start = (await snapshot()).remaining;
  await page.waitForTimeout(1000);
  const elapsed = start - (await snapshot()).remaining;
  assert.ok(elapsed >= 950 && elapsed <= 1200);
  await page.evaluate(() => window.__FIELD_GOAL_GAME__.events.emit('blur'));
  const blurred = await snapshot(); assert.equal(blurred.paused, true);
  await page.waitForTimeout(200); assert.equal((await snapshot()).remaining, blurred.remaining);
  await page.evaluate(() => window.__FIELD_GOAL_GAME__.events.emit('focus'));
  checks.push('Countdown follows elapsed time and window blur pauses it');

  const retryLayout = (await snapshot()).round;
  for (let lives = 2; lives >= 0; lives--) {
    assert.equal((await kick('NO GOOD')).run.lives, lives);
    await waitState(lives ? 'AIMING' : 'GAME_OVER');
    const retry = (await snapshot()).round;
    assert.equal(retry.lane, retryLayout.lane); assert.equal(retry.pattern, retryLayout.pattern); assert.equal(retry.wind, retryLayout.wind);
  }
  assert.equal((await snapshot()).run.score, 19);
  assert.ok((await snapshot()).remaining > 0);
  assert.deepEqual(await page.evaluate(() => window.__endCues), [{ failure: true, modalVisible: true, state: 'GAME_OVER' }]);
  await restart();
  assert.equal((await snapshot()).remaining, 30_000); assert.equal((await snapshot()).started, false);
  assert.equal((await snapshot()).run.score, 0); assert.equal((await snapshot()).best, 19);
  checks.push('Third miss ends early; replay resets time, coins, lives and difficulty but preserves best');

  // Buzzer during flight: accept before zero, finish that one shot, block additional shots.
  await target('PERFECT');
  await tap(390, 1300);
  await shorten(70);
  await page.waitForTimeout(120);
  assert.equal((await snapshot()).state, 'KICKING');
  assert.equal((await snapshot()).remaining, 0);
  await tap(390, 1300);
  await waitState('GAME_OVER');
  assert.equal((await snapshot()).run.score, 3); assert.equal((await snapshot()).run.shots, 1);
  assert.deepEqual(await page.evaluate(() => window.__endCues), [
    { failure: true, modalVisible: true, state: 'GAME_OVER' },
    { failure: false, modalVisible: true, state: 'GAME_OVER' },
  ]);
  await page.evaluate(() => window.__FIELD_GOAL_GAME__.scene.getScene('Game').showGameOver());
  assert.equal(await page.evaluate(() => window.__endCues.length), 2);
  checks.push('Third miss plays failure cue; buzzer-beating completion plays welcome cue once, when the modal appears');
  await page.waitForTimeout(220);
  await page.screenshot({ path: 'outputs/16_variety_timeout.png' });
  checks.push('A buzzer-beating shot is counted exactly once; zero time rejects further kicks');

  await restart();
  await kick('PERFECT'); await waitState('TRANSITION'); await shorten(10);
  await waitState('GAME_OVER'); await page.waitForTimeout(350);
  assert.equal((await snapshot()).state, 'GAME_OVER');
  checks.push('Timeout during transition cancels the transition callback and stays at game over');

  await restart(); await kick('GOOD'); await waitState('AIMING');
  await shorten(0);
  await tap(390, 1300); await waitState('GAME_OVER');
  assert.equal((await snapshot()).run.shots, 1);
  const totals = (await snapshot()).run;
  await page.waitForTimeout(500); assert.deepEqual((await snapshot()).run, totals);
  checks.push('Timeout while aiming cannot accept a last-frame late kick or alter settled totals');

  await restart();
  for (let i = 0; i < 10; i++) { await kick('PERFECT'); await waitState('AIMING'); }
  assert.equal((await snapshot()).run.score, 48);
  assert.equal((await snapshot()).objects, baseline.objects);
  assert.equal((await snapshot()).listeners, baseline.listeners);
  checks.push('Ten fast consecutive rounds keep object/listener counts stable and award repeated combo bonuses');
  await page.reload(); await waitState('AIMING');
  assert.equal((await snapshot()).best, 48);
  assert.equal((await snapshot()).remaining, 30_000);
  await page.evaluate(() => window.__FIELD_GOAL_GAME__.scene.getScene('Game').scene.restart());
  await page.waitForTimeout(200); await waitState('AIMING');
  assert.equal((await snapshot()).listeners, baseline.listeners);
  assert.equal((await snapshot()).objects, baseline.objects);
  checks.push('Timed-mode best persists; full scene restart resets time and has no duplicated listeners');

  for (const viewport of [{ width: 360, height: 640 }, { width: 430, height: 932 }, { width: 1280, height: 800 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport); await page.waitForTimeout(120);
    const box = await page.locator('canvas').boundingBox();
    assert.ok(Math.abs(box.width / box.height - 780 / 1644) < .005);
    assert.ok(box.x >= -1 && box.y >= -1 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1);
  }
  assert.deepEqual(errors, []);
  const report = { passed: true, checks, consoleErrors: errors, objects: baseline.objects };
  await writeFile('test-results/browser-smoke.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  await page.screenshot({ path: 'test-results/failure.png' });
  console.error('Failure state:', await snapshot().catch(() => null));
  throw error;
} finally { await browser.close(); }
