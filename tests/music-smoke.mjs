// Exercise real browser audio unlock, loop playback, and scene lifecycle.
import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 822 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(process.env.GAME_URL || 'http://localhost:5173/');
  await page.waitForFunction(() => window.__FIELD_GOAL_GAME__?.scene.getScene('Game')?.sys.isActive());
  const read = () => page.evaluate(() => {
    const s = window.__FIELD_GOAL_GAME__.scene.getScene('Game');
    return { playing: s.music.isPlaying, paused: s.music.isPaused, seek: s.music.seek,
      muted: s.muted, kicks: s.kickCount, started: s.clock.started,
      sounds: s.sound.getAll('music').length, context: s.sound.context.state };
  });
  assert.equal((await read()).playing, false);
  await page.mouse.click(195, 650);
  await page.waitForFunction(() => window.__FIELD_GOAL_GAME__.scene.getScene('Game').music.isPlaying);
  assert.equal((await read()).context, 'running');
  // Check actual PCM at the music gain node, not only its isPlaying flag.
  const peak = await page.evaluate(async () => {
    const s = window.__FIELD_GOAL_GAME__.scene.getScene('Game');
    const analyser = s.sound.context.createAnalyser();
    s.music.volumeNode.connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    let peak = 0;
    for (let i = 0; i < 8; i++) {
      await new Promise(resolve => setTimeout(resolve, 40));
      analyser.getFloatTimeDomainData(samples);
      peak = Math.max(peak, ...samples.map(Math.abs));
    }
    s.music.volumeNode.disconnect(analyser); analyser.disconnect();
    return peak;
  });
  assert.ok(peak > .001, `Music must produce audible PCM, got ${peak}`);
  await page.mouse.click(45, 58);
  const muted = await read();
  assert.equal(muted.muted, true); assert.equal(muted.playing, false);
  await page.waitForTimeout(160);
  assert.equal((await read()).seek, muted.seek);
  await page.mouse.click(45, 58);
  assert.equal((await read()).playing, true);
  await page.evaluate(() => window.__FIELD_GOAL_GAME__.events.emit('blur'));
  const paused = await read(); assert.equal(paused.playing, false);
  await page.waitForTimeout(160); assert.equal((await read()).seek, paused.seek);
  await page.evaluate(() => window.__FIELD_GOAL_GAME__.events.emit('focus')); assert.equal((await read()).playing, true);
  await page.evaluate(() => {
    const s = window.__FIELD_GOAL_GAME__.scene.getScene('Game');
    window.__musicLoops = 0;
    s.music.on('looped', () => window.__musicLoops++);
    s.music.setSeek(29.85);
  });
  await page.waitForFunction(() => window.__musicLoops > 0);
  assert.equal((await read()).sounds, 1);
  await page.evaluate(() => window.__FIELD_GOAL_GAME__.scene.getScene('Game').showGameOver());
  await page.keyboard.press('Space');
  assert.equal((await read()).sounds, 1); assert.equal((await read()).playing, true);
  await page.evaluate(() => {
    const s = window.__FIELD_GOAL_GAME__.scene.getScene('Game');
    s.showGameOver(); s.game.events.emit('blur');
  });
  assert.equal((await read()).playing, false);
  await page.evaluate(() => window.__FIELD_GOAL_GAME__.scene.getScene('Game').scene.restart());
  await page.waitForTimeout(250);
  assert.equal((await read()).sounds, 1); assert.equal((await read()).playing, false);
  await page.mouse.click(195, 650);
  assert.equal((await read()).playing, true);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, peak, checks: ['first-input unlock', 'audible PCM', 'mute/resume', 'pause/resume', '30s loop', 'no replay stacking', 'blur on result screen', 'scene cleanup'], errors }, null, 2));
} finally {
  await browser.close();
}
