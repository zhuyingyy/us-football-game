import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const p = await browser.newPage({ viewport: { width: 390, height: 822 } });
  const errors = []; p.on('pageerror', e => errors.push(e.message));
  await p.goto('http://localhost:5173/');
  await p.waitForFunction(() => window.__FIELD_GOAL_GAME__?.scene.getScene('Game')?.sys.isActive());
  await p.mouse.click(150, 90);
  const sample = () => p.evaluate(() => {
    const s = window.__FIELD_GOAL_GAME__.scene.getScene('Game');
    return { frame: s.ambience.lastFrame, flag: s.ambience.flags[1].texture.canvas.toDataURL(), lights: s.ambience.lights.map(l => l.alpha) };
  });
  const a = await sample(); await p.waitForTimeout(400); const b = await sample();
  assert.notEqual(a.flag, b.flag, 'Flag artwork actually changes');
  assert.notDeepEqual(a.lights, b.lights, 'Crowd lights animate');
  await p.keyboard.press('Escape'); const paused = await sample();
  await p.waitForTimeout(200); assert.deepEqual(await sample(), paused, 'Pause freezes ambience');
  await p.keyboard.press('Escape');
  const result = await p.evaluate(async () => {
    const s = window.__FIELD_GOAL_GAME__.scene.getScene('Game');
    const fx = s.effects;
    const analyser = s.sound.context.createAnalyser();
    fx.cheer.volumeNode.connect(analyser);
    const events = [];
    fx.cheer.on('play', () => events.push(true));
    let peak = 0;
    for (let streak = 1; streak <= 10; streak++) {
      fx.show('PERFECT', 390, 600, streak);
      if (streak === 5) {
        const data = new Float32Array(analyser.fftSize);
        for (let i = 0; i < 6; i++) {
          await new Promise(r => setTimeout(r, 25));
          analyser.getFloatTimeDomainData(data);
          peak = Math.max(peak, ...data.map(Math.abs));
        }
      }
    }
    const plays = events.length;
    fx.setMuted(true); const stopped = !fx.cheer.isPlaying;
    fx.show('PERFECT', 390, 600, 15); const mutedPlays = events.length;
    fx.setMuted(false); const unmutePlays = events.length;
    fx.show('GOOD', 390, 600, 0); fx.show('NO GOOD', 390, 600, 0);
    fx.show('PERFECT', 390, 600, 1); fx.show('PERFECT', 390, 600, 2); fx.show('PERFECT', 390, 600, 3); fx.show('PERFECT', 390, 600, 4);
    const nonComboPlays = events.length;
    fx.show('PERFECT', 390, 600, 5); fx.reset(); const resetStopped = !fx.cheer.isPlaying;
    fx.cheer.volumeNode.disconnect(analyser); analyser.disconnect();
    return { plays, peak, stopped, mutedPlays, unmutePlays, nonComboPlays, resetStopped };
  });
  assert.equal(result.plays, 2, 'Only fifth and tenth goal trigger');
  assert.ok(result.peak > .01, 'Cheer produces audible PCM');
  assert.equal(result.stopped, true); assert.equal(result.resetStopped, true);
  assert.equal(result.mutedPlays, 2); assert.equal(result.unmutePlays, 2); assert.equal(result.nonComboPlays, 2);
  await p.evaluate(() => window.__FIELD_GOAL_GAME__.scene.getScene('Game').scene.restart());
  await p.waitForTimeout(500);
  assert.equal(await p.evaluate(() => window.__FIELD_GOAL_GAME__.scene.getScene('Game').ambience.flags.length), 7);
  await p.emulateMedia({ reducedMotion: 'reduce' }); await p.reload();
  await p.waitForFunction(() => window.__FIELD_GOAL_GAME__?.scene.getScene('Game')?.sys.isActive());
  const reduced = await sample(); await p.waitForTimeout(200); assert.deepEqual(await sample(), reduced);
  assert.deepEqual(errors, []);
  console.log('PASS: animated flags/lights, pause/reduced motion, 5/10 combo PCM, mute/reset, scene restart.');
} finally { await browser.close(); }
