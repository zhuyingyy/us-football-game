import assert from 'node:assert/strict';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const p = await browser.newPage({ viewport: { width: 390, height: 822 } });
  const errors = []; p.on('pageerror', e => errors.push(e.message));
  await p.goto('http://localhost:5173/');
  const ready = () => p.waitForFunction(() => {
    const scene = window.__FIELD_GOAL_GAME__?.scene.getScene('Game');
    return scene?.sys.isActive() && scene.state === 'AIMING' && scene.effects?.cheer;
  });
  await ready();
  await p.evaluate(() => {
    const s = window.__FIELD_GOAL_GAME__.scene.getScene('Game');
    window.cheerPlays = 0;
    s.effects.cheer.on('play', () => window.cheerPlays++);
  });
  const kick = async mode => {
    await ready();
    await p.evaluate(async mode => {
      const { aimPosition, goalPosition } = await import('/src/config/levels.ts');
      const s = window.__FIELD_GOAL_GAME__.scene.getScene('Game'), r = s.round;
      const desired = (r.perfectRange + r.width / 2) / 2;
      let loss = Infinity, best = 0;
      for (let t = 0; t < 20; t += .003) {
        const e = Math.abs(aimPosition(t, r) + r.windOffset - goalPosition(t, r));
        const candidate = mode === 'GOOD' ? Math.abs(e - desired) : mode === 'PERFECT' ? e : -e;
        if (candidate < loss) { loss = candidate; best = t; }
      }
      s.motionTime = best; r.centerX = goalPosition(best, r); s.goalVisual.centerX = r.centerX;
      s.aimVisual.x = aimPosition(best, r); s.refreshGoal(); s.drawAim();
    }, mode);
    await p.mouse.click(195, 650);
    await p.waitForFunction(() => window.__FIELD_GOAL_GAME__.scene.getScene('Game').state === 'RESULT');
    assert.equal(await p.evaluate(() => window.__FIELD_GOAL_GAME__.scene.getScene('Game').lastResult), mode);
  };
  for (const [i, mode] of ['PERFECT','GOOD','GOOD','GOOD','PERFECT','GOOD','GOOD','GOOD','PERFECT','GOOD'].entries()) {
    await kick(mode);
    assert.equal(await p.evaluate(() => window.cheerPlays), Math.floor((i + 1) / 5));
  }
  const peak = await p.evaluate(async () => {
    const s = window.__FIELD_GOAL_GAME__.scene.getScene('Game');
    const analyser = s.sound.context.createAnalyser(); s.effects.cheer.volumeNode.connect(analyser);
    const data = new Float32Array(analyser.fftSize); let peak = 0;
    for (let i = 0; i < 8; i++) {
      await new Promise(r => setTimeout(r, 25)); analyser.getFloatTimeDomainData(data);
      peak = Math.max(peak, ...data.map(Math.abs));
    }
    s.effects.cheer.volumeNode.disconnect(analyser); analyser.disconnect(); return peak;
  });
  assert.ok(peak > .01, 'Actual tenth-goal playback produces crowd audio');
  await kick('NO GOOD'); await kick('GOOD'); await kick('GOOD');
  assert.equal(await p.evaluate(() => window.cheerPlays), 2, 'Miss resets cheer streak');
  await kick('GOOD'); await kick('GOOD'); await p.mouse.click(45, 58); await kick('GOOD');
  assert.equal(await p.evaluate(() => window.cheerPlays), 2, 'Muted fifth goal stays silent');
  assert.equal(await p.evaluate(() => window.__FIELD_GOAL_GAME__.scene.getScene('Game').effects.cheer.isPlaying), false);
  assert.deepEqual(errors, []);
  console.log('PASS: real mixed goals cheer on 5/10 with audible PCM; miss resets, mute suppresses.');
} finally { await browser.close(); }
