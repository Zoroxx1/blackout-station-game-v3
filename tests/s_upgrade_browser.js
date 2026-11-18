// Real-browser Playwright verification & screenshot suite for Prompts 1 to 5
const E = (page, f, a) => page.evaluate(f, a);
const log = (m) => console.log('LOG:' + m);

export default async function (page, { shot }) {
  // 1. Title screen with Difficulty picker, Seed field, HRTF Audio Test, and Monster Sandbox
  await shot('01_title_screen');
  const titleInfo = await E(page, () => ({
    diffs: [...document.querySelectorAll('#diff-in option')].map((o) => o.value),
    desc: document.querySelector('#diff-desc')?.textContent,
  }));
  log('title difficulties: ' + JSON.stringify(titleInfo));

  // 2. HRTF 8-Bearing Localization Test Page (Prompt 4)
  await E(page, () => document.querySelector('[data-act="audiotest"]').click());
  await page.waitForTimeout(300);
  await E(page, () => document.querySelector('[data-act="hrtf-play"]').click());
  await page.waitForTimeout(300);
  await E(page, () => document.querySelector('[data-act="hrtf-guess"][data-idx="0"]').click());
  await page.waitForTimeout(200);
  await shot('02_hrtf_audio_test');
  log('hrtf score: ' + await E(page, () => document.querySelector('#hrtf-score')?.textContent));
  await E(page, () => document.querySelector('[data-act="back"]').click());
  await page.waitForTimeout(200);

  // 3. Monster Sandbox: 4 angles & animation clips (Prompt 3)
  await E(page, () => document.querySelector('[data-act="sandbox"]').click());
  await page.waitForTimeout(400);
  for (const clip of ['idle_weep', 'roam_walk', 'distress_crouch', 'rage_run', 'kill_grab']) {
    await E(page, (c) => window.__bs.setSandboxClip(c), clip);
    await page.waitForTimeout(250);
    await shot(`03_monster_clip_${clip}`);
  }
  for (let a = 1; a <= 4; a++) {
    await E(page, () => window.__bs.rotateSandboxMonster());
    await page.waitForTimeout(200);
    await shot(`04_monster_angle_${a}`);
  }
  await E(page, () => document.querySelector('[data-act="quit"]').click());
  await page.waitForTimeout(300);

  // 4. Start Run on Halcyon Deep & verify Wall Edge Ledger, F3/F4 Debug Overlays, 30 Doorways (Prompt 1)
  await E(page, () => window.__bs.startRun('HALCYON1'));
  await page.waitForFunction(() => window.__bs.state === 'playing', null, { timeout: 60000 });
  await page.waitForTimeout(400);

  // Calm monster for world tour
  await E(page, () => {
    const g = window.__bs;
    g.ai.x = 4; g.ai.z = 4; g.ai.state = 'ROAM'; g.ai.wanderWait = 9999;
  });

  // Verify 0 missing wall edges in Wall Edge Ledger and check 30 doorway camera views
  const doorwayCheck = await E(page, () => {
    const g = window.__bs, W = g.world, L = g.level;
    const missing = W.missingWallEdges.length;
    let viewsChecked = 0, allVisibleOk = true;
    const doors = W.doors;
    for (let i = 0; i < Math.min(30, doors.length); i++) {
      const d = doors[i];
      for (const dist of [1.2, 2.4, 3.6]) {
        for (const ang of [-0.35, 0.35]) {
          const ox = d.axis === 'x' ? -dist : Math.sin(ang) * 0.8;
          const oz = d.axis === 'x' ? Math.sin(ang) * 0.8 : -dist;
          g.player.pos.x = d.pos.x + ox;
          g.player.pos.z = d.pos.z + oz;
          g.player.yaw = Math.atan2(-(d.pos.x - g.player.pos.x), -(d.pos.z - g.player.pos.z)) + ang * 0.3;
          W.updateVisibility(g.player.pos.x, g.player.pos.z);
          if (!d.g.visible || !W.visible.has(d.link.a) || !W.visible.has(d.link.b)) {
            allVisibleOk = false;
          }
          viewsChecked++;
        }
      }
    }
    return { missing, doorsTotal: doors.length, viewsChecked, allVisibleOk };
  });
  log('doorway verification (30 doorways x 3 distances x 2 angles): ' + JSON.stringify(doorwayCheck));
  await shot('05_doorway_closeup');

  // Toggle F3 and F4 debug overlays
  await E(page, () => {
    const g = window.__bs;
    g.showDebug = true; g.world.setDebugVisible(true);
    g.showAudioDebug = true;
    g.simulate(0.2);
  });
  await page.waitForTimeout(250);
  await shot('06_f3_f4_debug_overlays');
  log('F3 debug text:\n' + await E(page, () => window.__bs.ui.$('#dbg').textContent));
  log('F4 AI/audio text:\n' + await E(page, () => window.__bs.ui.$('#adbg').textContent));
  await E(page, () => {
    const g = window.__bs;
    g.showDebug = false; g.world.setDebugVisible(false); g.ui.debug(null);
    g.showAudioDebug = false; g.ui.adebug(null);
  });

  // 5. Tour Key Oil Rig Rooms, Escape Gate, Vestibule & Stormy Helideck (Prompt 2)
  const roomTour = ['control_room', 'engine_room', 'moon_pool', 'medical_bay', 'radio_room', 'cold_storage', 'escape_vestibule', 'helideck'];
  for (const rt of roomTour) {
    await E(page, (roomType) => {
      const g = window.__bs, r = g.level.rooms.find((x) => x.roomType === roomType);
      if (!r) return;
      g.player.pos.x = (r.x0 + 3.5) * 2;
      g.player.pos.z = (r.y0 + 3.5) * 2;
      g.player.yaw = 0.6;
      g.simulate(0.2);
    }, rt);
    await page.waitForTimeout(250);
    await shot(`07_room_${rt}`);
  }

  // Screenshot the Unique Helideck Escape Gate
  await E(page, () => {
    const g = window.__bs, d = g.world.doors.find((x) => x.isEscapeGate);
    if (!d) return;
    const ox = d.axis === 'x' ? -2.4 : 0, oz = d.axis === 'x' ? 0 : -2.4;
    g.player.pos.x = d.pos.x + ox;
    g.player.pos.z = d.pos.z + oz;
    g.player.yaw = Math.atan2(-(d.pos.x - g.player.pos.x), -(d.pos.z - g.player.pos.z));
    g.simulate(0.2);
  });
  await page.waitForTimeout(250);
  await shot('08_escape_gate');

  // 6. Test Supply Chest, Food Eating & Right-Hand Item Labels (Prompt 2 Section 7 & 8)
  const foodResult = await E(page, () => {
    const g = window.__bs, R = g.run;
    R.health = 70;
    R.foodList = ['soup', 'stew', 'ration'];
    R.item = 'food';
    g.hands.setFoodType('soup');
    g.hands.setItem('food');
    g.input.keys.add('Space');
    g.simulate(1.6);
    g.input.keys.delete('Space');
    return { healthAfterSoup: R.health, remainingFood: R.foodList };
  });
  log('food eating test (+15 soup): ' + JSON.stringify(foodResult));

  // 7. Test Crew Rescues, Bix Patch Panel Puzzle & Platform Journal (Key J) (Prompt 5)
  await E(page, () => {
    const g = window.__bs, co = g.world.crewObjects.bix;
    g.player.pos.x = co.pos.x; g.player.pos.z = co.pos.z;
    g.interactCrew(co);
  });
  await page.waitForTimeout(250);
  await shot('09_crew_choice_modal');
  // Choose [1] HELP BIX to open patch panel puzzle
  await E(page, () => document.querySelector('[data-act="crew-decide"][data-choice="0"]').click());
  await page.waitForTimeout(250);
  await shot('10_bix_patch_puzzle');
  await E(page, () => window.__bs.closeModal());

  // Collect 3 logs and open Journal (Key J)
  await E(page, () => {
    const g = window.__bs;
    g.world.logPickups.slice(0, 4).forEach((lg) => g.interact({ type: 'log', o: lg }));
    g.openJournal('playing');
  });
  await page.waitForTimeout(250);
  await shot('11_platform_journal');
  await E(page, () => window.__bs.closeModal());

  // 8. Test All 3 Jump-Scare Variants (Prompt 3 Section 5)
  for (const v of [0, 1, 2]) {
    await E(page, (variant) => {
      const g = window.__bs;
      g.state = 'playing';
      g.run.ended = false;
      g.beginCaught(variant);
      g.simulate(0.18);
    }, v);
    await page.waitForTimeout(200);
    await shot(`12_jumpscare_variant_${v + 1}`);
  }

  // 9. Verify Every Ending (0, 1, 2, 3, 4 crew helped, with and without Eli's locket) (Prompt 5 Section 6)
  const endingChecks = [];
  for (const locket of [false, true]) {
    for (const saved of [0, 1, 2, 3, 4]) {
      const res = await E(page, ({ savedCount, locketPlaced }) => {
        const g = window.__bs;
        g.run.ended = false;
        g.state = 'playing';
        g.playEndingWithFlags({ savedCount, locketPlaced, kind: 'pod' });
        return { savedCount, locketPlaced };
      }, { savedCount: saved, locketPlaced: locket });
      await page.waitForTimeout(2350);
      const title = await E(page, () => document.querySelector('.ending-title')?.textContent);
      endingChecks.push({ saved, locket, title });
      if ((saved === 0 && !locket) || (saved === 4 && !locket) || (saved === 4 && locket)) {
        await shot(`13_ending_saved${saved}_locket${locket ? 1 : 0}`);
      }
    }
  }
  log('all endings verified: ' + JSON.stringify(endingChecks));
}
