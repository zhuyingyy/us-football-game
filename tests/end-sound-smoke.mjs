import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 822 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(process.env.GAME_URL || 'http://localhost:5173/');
  const waitReady = () => page.waitForFunction(() => {
    const s = window.__FIELD_GOAL_GAME__?.scene.getScene('Game');
    return s?.sys.isActive() && s.state === 'AIMING';
  });
  await waitReady();
  // Trusted input unlocks audio without beginning a shot.
  await page.mouse.click(150, 90);
  await page.waitForFunction(() => window.__FIELD_GOAL_GAME__.scene.getScene('Game').effects.audio?.state === 'running');
  const finish = lives => page.evaluate(lives => {
    const s = window.__FIELD_GOAL_GAME__.scene.getScene('Game');
    s.run.lives = lives; s.clock.remainingMs = 0; s.syncClock();
  }, lives);
  const peak = () => page.evaluate(async () => {
    const fx = window.__FIELD_GOAL_GAME__.scene.getScene('Game').effects;
    const analyser = fx.audio.createAnalyser();
    const gains = [...fx.voices].map(v => v.gain);
    gains.forEach(g => g.connect(analyser));
    const data = new Float32Array(analyser.fftSize);
    let peak = 0;
    for (let i = 0; i < 8; i++) {
      await new Promise(resolve => setTimeout(resolve, 25));
      analyser.getFloatTimeDomainData(data);
      peak = Math.max(peak, ...data.map(Math.abs));
    }
    for (const g of gains) { try { g.disconnect(analyser); } catch { /* Cue already ended and disconnected. */ } }
    analyser.disconnect();
    return peak;
  });
  await finish(0);
  assert.ok(await peak() > .01, 'Failure modal must produce audio');
  await page.mouse.click(45, 58);
  await page.waitForTimeout(60);
  assert.ok(await peak() < .001, 'Muting cancels the cue, including its scheduled notes');
  await page.keyboard.press('Space'); await waitReady();
  await finish(3);
  assert.ok(await peak() < .001, 'Timeout is silent while muted');
  await page.mouse.click(45, 58);
  assert.ok(await peak() < .001, 'Unmuting must not replay the completed modal cue');
  await page.keyboard.press('Space'); await waitReady();
  await finish(3);
  assert.ok(await peak() > .01, 'Timeout modal must produce welcome audio');
  await page.keyboard.press('Space'); await waitReady();
  assert.ok(await peak() < .001, 'Replay cancels remaining welcome notes');
  assert.deepEqual(errors, []);
  console.log('PASS: failure and welcome cues produce PCM; mute, unmute and replay handle pending notes correctly.');
} finally { await browser.close(); }
