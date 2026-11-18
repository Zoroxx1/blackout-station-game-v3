// DOM UI: HUD, title (with 4-difficulty picker & seed), content warning, how to play, settings (safety & audio buses),
// journal (Key J, 16 logs), crew choice & Bix patch panel puzzle, HRTF audio localization test, monster sandbox, endings (with crew portraits), credits.
import './ui.css';
import manifest from '../../assets/manifest.json' with { type: 'json' };
import { CFG, DEFAULT_KEYS, SCP_ATTRIBUTION } from './config.js';
import crewData from './crew.json' with { type: 'json' };

const KEYNAMES = {
  forward: 'Move forward', back: 'Move back', left: 'Strafe left', right: 'Strafe right',
  run: 'Run (hold)', light: 'Flashlight', swap: 'Switch item', use: 'Use / Eat item',
  interact: 'Interact / Hold E', journal: 'Open Journal', choice1: 'Choice 1', choice2: 'Choice 2',
};
const pretty = (c) => (c || '').replace('Key', '').replace('Digit', '').replace('Left', ' L').replace('Right', ' R');
const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
export const fmtTime = (s) => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

export class UI {
  constructor(root, ctx) {
    this.root = root; this.c = ctx; this.screen = null; this.prev = 'title'; this.msgT = 0; this.typeTimer = null;
    const d = document.createElement('div'); d.id = 'ui';
    d.innerHTML = `
    <div id="hud" class="bs-hide">
      <div class="bars">
        <div class="bar health"><label><span>HEALTH</span><span id="v-health">100</span></label><div class="b"><i id="b-health"></i></div></div>
        <div class="bar power"><label><span>POWER</span><span id="v-power">100</span></label><div class="b"><i id="b-power"></i></div></div>
        <div class="bar noise"><label><span>NOISE</span><span id="v-noise">0</span></label><div class="b"><i id="b-noise"></i></div></div>
        <div class="bar time"><label><span>RIG COLLAPSE</span><span id="v-time">10:00</span></label><div class="b"><i id="b-time"></i></div></div>
      </div>
      <div class="status" id="status"></div>
      <div class="topright">
        <button class="px-btn sm" id="btn-journal" title="Journal (J)">LOG</button>
        <button class="px-btn sm" id="btn-mute" title="Mute">SND</button>
        <input type="range" id="hud-vol" min="0" max="1" step="0.05" title="Master volume">
        <button class="px-btn sm" id="btn-fs" title="Fullscreen">FULL</button>
        <button class="px-btn sm" id="btn-pause" title="Pause">II</button>
      </div>
      <div class="cross"></div><div id="prompt"></div><div id="compass" class="bs-hide"></div>
      <svg id="ring" class="bs-hide" viewBox="0 0 120 120"><circle class="bg" cx="60" cy="60" r="48"/><circle class="fg" cx="60" cy="60" r="48" stroke-dasharray="301.6" stroke-dashoffset="301.6" transform="rotate(-90 60 60)"/></svg>
      <canvas id="radar" width="150" height="150" class="bs-hide"></canvas>
      <div id="subs"></div><div id="msg"></div>
    </div>
    <div class="flash" id="flash"></div>
    <div id="dbg" class="bs-hide"></div><div id="adbg" class="bs-hide"></div>
    <div id="screens"></div><div id="portrait">ROTATE YOUR PHONE TO LANDSCAPE</div>`;
    root.appendChild(d); this.el = d; this.$ = (s) => d.querySelector(s);
    this.hud = this.$('#hud'); this.screens = this.$('#screens');
    d.addEventListener('mouseover', (e) => { if (e.target.closest?.('.px-btn')) ctx.sfx('ui-hover'); });
    d.addEventListener('click', (e) => {
      const b = e.target.closest?.('[data-act]');
      if (!b || b.disabled) return;
      ctx.sfx('ui-click');
      this.act(b.dataset.act, b);
    });
    this.$('#btn-journal').onclick = () => ctx.toggleJournal?.();
    this.$('#btn-fs').onclick = () => ctx.fullscreen();
    this.$('#btn-pause').onclick = () => ctx.pause();
    this.$('#btn-mute').onclick = () => { ctx.settings.mute = !ctx.settings.mute; ctx.applySettings(); };
    this.$('#hud-vol').oninput = (e) => { ctx.settings.master = +e.target.value; ctx.applySettings(); };
    ['pointerdown', 'mousedown'].forEach((ev) => this.$('.topright').addEventListener(ev, (e) => e.stopPropagation()));
  }

  hideScreens() { this.screens.innerHTML = ''; this.screen = null; }

  show(name, data = {}) {
    this.screen = name;
    const r = this.c.save.records;
    const s = this.c.settings;
    const curDiff = CFG.difficulties[s.difficulty || 'medium'] || CFG.difficulties.medium;
    let h = '';
    if (name === 'loading') {
      h = `<h1 class="title">BLACKOUT<br>STATION</h1><div class="sub" id="load-txt">Boarding Halcyon Deep...</div><div class="bar-load"><i id="load-bar"></i></div>`;
    } else if (name === 'warning') {
      h = `<h2 class="h2">CONTENT WARNING</h2>
        <div class="panel" style="max-width:580px">
          <h3>HALCYON DEEP</h3>
          This horror game contains themes of grief and loss, claustrophobic darkness, sudden loud sounds, and flashing lights during jump scares.<br><br>
          <div class="field"><span>REDUCE FLASHING</span><input type="checkbox" id="w-flash" ${s.reduceFlashing ? 'checked' : ''}></div>
          <div class="field"><span>LIMIT JUMP-SCARE VOLUME (-6 dB)</span><input type="checkbox" id="w-vol" ${s.limitScareVolume ? 'checked' : ''}></div>
          <div class="field"><span>JUMP SCARE OFF (FADE TO BLACK)</span><input type="checkbox" id="w-off" ${s.jumpScareOff ? 'checked' : ''}></div>
        </div>
        <button class="px-btn" data-act="accept-warning">CONTINUE</button>`;
    } else if (name === 'title') {
      h = `<h1 class="title">BLACKOUT<br>STATION</h1>
        <div class="sub">HALCYON DEEP OFFSHORE PLATFORM // 90 KM OFFSHORE.<br>IT WEEPS IN THE DARK. DO NOT LOOK AT ITS FACE.</div>
        <div class="menu">
          <button class="px-btn" data-act="play">PLAY</button>
          <button class="px-btn" data-act="howto">HOW TO PLAY</button>
          <button class="px-btn" data-act="settings">SETTINGS</button>
          <div class="row">
            <button class="px-btn sm alt" data-act="audiotest">HRTF AUDIO TEST</button>
            <button class="px-btn sm alt" data-act="sandbox">MONSTER SANDBOX</button>
            <button class="px-btn sm" data-act="credits">CREDITS</button>
          </div>
        </div>
        <div class="row">
          <div class="field" style="grid-template-columns:auto auto"><span>SEED</span><input type="text" id="seed-in" maxlength="16" placeholder="random" value="${esc(this.c.seedInput || '')}"></div>
          <div class="field" style="grid-template-columns:auto auto"><span>DIFFICULTY</span>
            <select id="diff-in">${Object.values(CFG.difficulties).map((d) => `<option value="${d.id}" ${(s.difficulty || 'medium') === d.id ? 'selected' : ''}>${d.label}</option>`).join('')}</select>
          </div>
          <div class="field" style="grid-template-columns:auto auto"><span>HARD MODE</span><input type="checkbox" id="hard-in" ${s.hard || s.difficulty === 'hard' || s.difficulty === 'extreme' ? 'checked' : ''}></div>
        </div>
        <div class="seed" id="diff-desc" style="color:#ffd068;max-width:560px">${esc(curDiff.desc)}</div>
        <div class="seed">${r.runs ? `RUNS ${r.runs} | ESCAPES ${r.wins} | BEST TIME LEFT ${r.bestTime ? fmtTime(r.bestTime) : '--'} | BEST: ${r.bestEnding ? esc(r.bestEnding) : '--'}` : 'NO RUNS YET'}</div>
        <div class="ver">v2.0 HALCYON DEEP - THREE.JS / WEBGL2</div>`;
    } else if (name === 'howto') {
      h = `<h2 class="h2">HOW TO PLAY</h2>
        <div class="panel">
          <h3>THE PLATFORM &amp; GOAL</h3>
          You are Nora Vance on the storm-lashed offshore rig <b>Halcyon Deep</b>. Find the <b>BLUE keycard</b> in a green-blinking supply chest, rescue the four surviving crew members (Ana, Bix, Chen, Dara), unlock the <b>Helideck Blast Gate</b> (10 Power), and board the rescue helicopter before the platform collapses.<br><br>
          <h3>THE CREATURE (DO NOT LOOK AT ITS FACE)</h3>
          While roaming, it weeps quietly with its head bowed. If you hear sobbing or wet breathing, <b>look away or turn off your flashlight</b>. Seeing its uncovered face triggers a loud distress scream (giving you seconds to run and close heavy doors behind you) before it hunts you relentlessly.<br><br>
          <h3>CONTROLS</h3>
          <table>
            <tr><td><span class="kbd">W</span><span class="kbd">A</span><span class="kbd">S</span><span class="kbd">D</span> move</td><td>Mouse / arrows look</td></tr>
            <tr><td><span class="kbd">SHIFT</span> run (loud)</td><td><span class="kbd">L</span> flashlight</td></tr>
            <tr><td><span class="kbd">Q</span>/<span class="kbd">TAB</span> cycle item (scanner, decoy, food, pry bar, cards)</td><td><span class="kbd">SPACE</span> use item (HOLD 1.5s to eat food)</td></tr>
            <tr><td><span class="kbd">E</span> interact (HOLD at generators, valves, doors)</td><td><span class="kbd">J</span> open Journal (16 logs &amp; clues)</td></tr>
            <tr><td><span class="kbd">ESC</span> pause</td><td><span class="kbd">F3</span> level/wall debug, <span class="kbd">F4</span> AI &amp; audio debug</td></tr>
          </table>
        </div>
        <button class="px-btn" data-act="back">BACK</button>`;
    } else if (name === 'settings') {
      h = this.settingsHTML();
    } else if (name === 'pause') {
      h = `<h2 class="h2">PAUSED</h2>
        <div class="menu">
          <button class="px-btn" data-act="resume">RESUME</button>
          <button class="px-btn" data-act="journal-p">JOURNAL (16 LOGS)</button>
          <button class="px-btn" data-act="howto-p">HOW TO PLAY</button>
          <button class="px-btn" data-act="settings-p">SETTINGS</button>
          <button class="px-btn alt" data-act="quit">QUIT TO TITLE</button>
        </div>
        <div class="seed">SEED ${esc(this.c.getSeed())} // DIFFICULTY ${esc((s.difficulty || 'medium').toUpperCase())}</div>`;
    } else if (name === 'credits') {
      h = `<h2 class="h2">CREDITS &amp; LICENSES</h2>
        <div class="panel" style="max-height:64vh;overflow:auto">
          <h3>BLACKOUT STATION: HALCYON DEEP</h3>
          Design, code, procedural PBR materials, 3D offshore rig &amp; creature models, and Web Audio synthesis.<br><br>
          <h3>SCP FOUNDATION ATTRIBUTION (CC BY-SA 3.0)</h3>
          <div style="color:#ffd068;font-size:11px;line-height:1.6">${esc(SCP_ATTRIBUTION)}</div><br>
          <h3>ASSET MANIFEST</h3>
          <table>${manifest.assets.map((a) => `<tr><td>${esc(a.name)}</td><td>${esc(a.author)}</td><td>${esc(a.license)}</td></tr>`).join('')}</table><br>
          ${manifest.notes.map(esc).join('<br>')}
        </div>
        <button class="px-btn" data-act="back">BACK</button>`;
    } else if (name === 'ending') {
      const crewStates = data.crewStates || {};
      const crewCards = Object.values(crewData.crew).map((c) => {
        const st = crewStates[c.id] === 'helped' ? 'SAVED' : 'LEFT BEHIND';
        const col = crewStates[c.id] === 'helped' ? '#28ff68' : '#ff4a5a';
        return `<div class="crew-card" style="border:2px solid ${col};padding:8px 12px;background:rgba(4,16,24,0.85);min-width:130px;text-align:center">
          <div style="font-size:13px;color:#ffe030">${esc(c.name)}</div>
          <div style="font-size:10px;color:#8ad8e8">${esc(c.role)}</div>
          <div style="font-size:11px;margin-top:4px;color:${col}">${st}</div>
        </div>`;
      }).join('');
      h = `<h1 class="ending-title">${esc(data.title)}</h1>
        ${data.cinematic ? `<div class="sub" style="color:#ffd888;max-width:660px;font-style:italic">${esc(data.cinematic)}</div>` : ''}
        <div class="ending-text">${esc(data.text)}</div>
        <div class="row" style="margin:6px 0">${crewCards}</div>
        <div class="stats">${(data.stats || []).map(esc).join('<br>')}</div>
        <div id="lb"></div>
        <div class="row">
          <button class="px-btn" data-act="again">RUN AGAIN</button>
          <button class="px-btn alt" data-act="replay">SAME SEED</button>
          <button class="px-btn" data-act="quit">TITLE</button>
        </div>`;
    } else if (name === 'journal') {
      h = this.journalHTML(data);
    } else if (name === 'audiotest') {
      h = this.audioTestHTML(data);
    } else if (name === 'sandbox') {
      h = this.sandboxHTML(data);
    }
    this.screens.innerHTML = `<div class="screen" id="scr-${name}">${h}</div>`;
    if (name === 'settings') this.bindSettings();
    if (name === 'title') {
      const diffSel = this.$('#diff-in');
      const hardChk = this.$('#hard-in');
      if (diffSel) {
        diffSel.onchange = (e) => {
          s.difficulty = e.target.value;
          s.hard = s.difficulty === 'hard' || s.difficulty === 'extreme';
          if (hardChk) hardChk.checked = s.hard;
          const d = CFG.difficulties[s.difficulty];
          const descEl = this.$('#diff-desc');
          if (descEl && d) descEl.textContent = d.desc;
          this.c.applySettings();
        };
      }
      if (hardChk) {
        hardChk.onchange = (e) => {
          s.hard = e.target.checked;
          s.difficulty = s.hard ? 'hard' : 'medium';
          if (diffSel) diffSel.value = s.difficulty;
          const d = CFG.difficulties[s.difficulty];
          const descEl = this.$('#diff-desc');
          if (descEl && d) descEl.textContent = d.desc;
          this.c.applySettings();
        };
      }
    }
  }

  journalHTML(data) {
    const found = data.foundLogs || [];
    const clues = data.clues || [];
    const crewStates = data.crewStates || {};
    const allLogs = data.allLogs || [];
    return `<h2 class="h2">PLATFORM JOURNAL (${found.length}/16 LOGS)</h2>
      <div class="panel" style="max-height:66vh;overflow:auto;width:min(760px,94vw)">
        <h3>CREW STATUS &amp; CLUES</h3>
        <div style="margin-bottom:10px;color:#ffd068">
          ${Object.values(crewData.crew).map((c) => `${esc(c.name)} (${esc(c.role)}): <b>${esc((crewStates[c.id] || 'UNMET').toUpperCase())}</b>`).join(' &nbsp;|&nbsp; ')}
          ${clues.length ? '<br>' + clues.map((cl) => `<span style="color:#58ff98">&gt; ${esc(cl)}</span>`).join('<br>') : ''}
        </div>
        <h3>COLLECTED LOGS</h3>
        ${allLogs.map((lg) => {
          const isFound = found.includes(lg.id);
          return `<div style="margin-bottom:12px;padding-bottom:8px;border-bottom:1px dashed rgba(31,184,208,0.3)">
            <div style="color:${isFound ? '#ffe030' : '#4a6878'}"><b>${esc(lg.id)} // ${isFound ? esc(lg.title) : 'UNFOUND LOG'}</b> — ${isFound ? esc(lg.author) : '???'}</div>
            ${isFound ? `<div style="color:#cfe9f0;margin-top:4px">${esc(lg.text)}</div>` : ''}
          </div>`;
        }).join('')}
      </div>
      <button class="px-btn" data-act="close-modal">CLOSE [J]</button>`;
  }

  // Prompt 4 Section 4 & 7: 8-bearing HRTF Localization Test Page
  audioTestHTML(data = {}) {
    const bearings = [
      { idx: 0, label: '0° AHEAD (N)',     ang: 0 },
      { idx: 1, label: '45° AHEAD-RIGHT',  ang: Math.PI * 0.25 },
      { idx: 2, label: '90° RIGHT (E)',    ang: Math.PI * 0.5 },
      { idx: 3, label: '135° BEHIND-RIGHT',ang: Math.PI * 0.75 },
      { idx: 4, label: '180° BEHIND (S)',  ang: Math.PI },
      { idx: 5, label: '225° BEHIND-LEFT', ang: -Math.PI * 0.75 },
      { idx: 6, label: '270° LEFT (W)',    ang: -Math.PI * 0.5 },
      { idx: 7, label: '315° AHEAD-LEFT',  ang: -Math.PI * 0.25 },
    ];
    const scoreTxt = data.trials ? `ACCURACY: ${data.hits}/${data.trials} (${Math.round((data.hits / data.trials) * 100)}%) — LAST: ${data.lastResult || ''}` : 'Click PLAY RANDOM BEARING, listen on headphones, then click the direction you heard.';
    return `<h2 class="h2">3D HRTF LOCALIZATION TEST</h2>
      <div class="panel" style="max-width:640px;text-align:center">
        <p>Tests the 3D HRTF positional monster weeping/growling across 8 compass bearings at 8m distance.</p>
        <button class="px-btn alt" data-act="hrtf-play">PLAY RANDOM BEARING</button>
        <div style="margin:14px 0;color:#ffe030" id="hrtf-score">${esc(scoreTxt)}</div>
        <div class="row" style="gap:8px">
          ${bearings.map((b) => `<button class="px-btn sm" data-act="hrtf-guess" data-idx="${b.idx}">${esc(b.label)}</button>`).join('')}
        </div>
      </div>
      <button class="px-btn" data-act="back">BACK</button>`;
  }

  // Prompt 3 Section 6: Monster Sandbox to preview all 11 animations & test face-seen conditions
  sandboxHTML(data = {}) {
    const clips = [
      'idle_weep', 'roam_walk', 'roam_pause_lookup', 'turn_to_noise',
      'flinch_face_seen', 'distress_crouch', 'rage_run', 'door_bash',
      'leap', 'kill_grab', 'recover_sit', 'sit_sob',
    ];
    return `<div style="position:fixed;left:16px;top:16px;z-index:50;background:rgba(4,14,20,0.88);border:2px solid #1fb8d0;padding:14px;text-align:left;max-width:360px">
      <h3 style="color:#ffe030;margin:0 0 8px">MONSTER SANDBOX</h3>
      <div style="font-size:11px;margin-bottom:8px;color:#9fe8ff" id="sb-status">Clip: ${esc(data.clip || 'idle_weep')} | Jaw: ${Math.round((data.jaw || 0) * 100)}%</div>
      <div class="row" style="justify-content:flex-start;gap:4px;margin-bottom:8px">
        ${clips.map((c) => `<button class="px-btn sm" data-act="sb-clip" data-clip="${c}">${c}</button>`).join('')}
      </div>
      <div class="row" style="justify-content:flex-start;gap:6px">
        <button class="px-btn sm alt" data-act="sb-rot">ROTATE 90°</button>
        <button class="px-btn sm alt" data-act="sb-scare">TEST JUMP SCARE</button>
        <button class="px-btn sm" data-act="quit">EXIT SANDBOX</button>
      </div>
    </div>`;
  }

  settingsHTML() {
    const s = this.c.settings, unlocked = this.c.save.records.wins > 0;
    const rng = (id, v, min, max, step) => `<input type="range" id="s-${id}" min="${min}" max="${max}" step="${step}" value="${v ?? 0.8}">`;
    const chk = (id, v, dis) => `<input type="checkbox" id="s-${id}" ${v ? 'checked' : ''} ${dis ? 'disabled' : ''}>`;
    return `<h2 class="h2">SETTINGS</h2>
      <div class="panel" style="max-height:66vh;overflow:auto;min-width:min(540px,92vw)">
        <h3>GAMEPLAY &amp; CONTROLS</h3>
        <div class="field"><span>DIFFICULTY</span><select id="s-difficulty">${Object.values(CFG.difficulties).map((d) => `<option value="${d.id}" ${(s.difficulty || 'medium') === d.id ? 'selected' : ''}>${d.label}</option>`).join('')}</select></div>
        <div class="field"><span>HARD MODE</span>${chk('hard', s.hard)}</div>
        <div class="field"><span>LOOK SENSITIVITY</span>${rng('sens', s.sens, 0.2, 3, 0.05)}</div>
        <div class="field"><span>INVERT LOOK</span>${chk('invert', s.invert)}</div>
        <div class="field"><span>GRAPHICS QUALITY</span><select id="s-quality">${['auto', 'low', 'medium', 'high'].map((q) => `<option ${s.quality === q ? 'selected' : ''}>${q}</option>`).join('')}</select></div>
        <div class="field"><span>CAMERA SHAKE</span>${rng('shake', s.shake, 0, 1.5, 0.1)}</div>
        <div class="field"><span>REDUCE MOTION (WAVE SWAY)</span>${chk('reduceMotion', s.reduceMotion)}</div>
        <div class="field"><span>SUBTITLES</span>${chk('subtitles', s.subtitles)}</div>
        <div class="field"><span>COLORBLIND-FRIENDLY</span>${chk('colorblind', s.colorblind)}</div>
        <div class="field"><span>HELIDECK COMPASS ${unlocked ? '' : '(UNLOCK: ESCAPE ONCE)'}</span>${chk('compass', s.compass && unlocked, !unlocked)}</div>
        <h3 style="margin-top:12px">JUMP-SCARE SAFETY</h3>
        <div class="field"><span>REDUCE FLASHING</span>${chk('reduceFlashing', s.reduceFlashing)}</div>
        <div class="field"><span>LIMIT JUMP-SCARE VOLUME (-6 dB)</span>${chk('limitScareVolume', s.limitScareVolume)}</div>
        <div class="field"><span>JUMP SCARE OFF (FADE TO BLACK)</span>${chk('jumpScareOff', s.jumpScareOff)}</div>
        <h3 style="margin-top:12px">AUDIO BUSES</h3>
        <div class="field"><span>MASTER VOLUME</span>${rng('master', s.master, 0, 1, 0.05)}</div>
        <div class="field"><span>MUSIC VOLUME</span>${rng('music', s.music, 0, 1, 0.05)}</div>
        <div class="field"><span>AMBIENCE VOLUME</span>${rng('ambience', s.ambience, 0, 1, 0.05)}</div>
        <div class="field"><span>MONSTER VOLUME</span>${rng('monster', s.monster, 0, 1, 0.05)}</div>
        <div class="field"><span>EFFECTS VOLUME</span>${rng('sfx', s.sfx, 0, 1, 0.05)}</div>
        <div class="field"><span>FOOTSTEPS VOLUME</span>${rng('foot', s.foot, 0, 1, 0.05)}</div>
        <div class="field"><span>MUTE ALL</span>${chk('mute', s.mute)}</div>
        <h3 style="margin-top:12px">KEY BINDINGS</h3>
        <table>${Object.keys(KEYNAMES).map((a) => `<tr><td>${KEYNAMES[a]}</td><td><button class="px-btn sm" data-act="rebind" data-key="${a}">${pretty(s.keys[a] || DEFAULT_KEYS[a])}</button></td></tr>`).join('')}</table>
        <div class="row" style="margin-top:8px"><button class="px-btn sm alt" data-act="resetkeys">RESET KEYS</button></div>
      </div>
      <button class="px-btn" data-act="back">BACK</button>`;
  }

  bindSettings() {
    const s = this.c.settings, q = (id) => this.$('#s-' + id);
    for (const k of ['sens', 'master', 'music', 'ambience', 'monster', 'sfx', 'foot', 'shake']) {
      if (q(k)) q(k).oninput = (e) => { s[k] = +e.target.value; this.c.applySettings(); };
    }
    for (const k of ['invert', 'mute', 'subtitles', 'colorblind', 'compass', 'hard', 'reduceFlashing', 'limitScareVolume', 'jumpScareOff', 'reduceMotion']) {
      if (q(k)) q(k).onchange = (e) => {
        s[k] = e.target.checked;
        if (k === 'hard') s.difficulty = s.hard ? 'hard' : 'medium';
        this.c.applySettings();
      };
    }
    if (q('difficulty')) {
      q('difficulty').onchange = (e) => {
        s.difficulty = e.target.value;
        s.hard = s.difficulty === 'hard' || s.difficulty === 'extreme';
        if (q('hard')) q('hard').checked = s.hard;
        this.c.applySettings();
      };
    }
    if (q('quality')) q('quality').onchange = (e) => { s.quality = e.target.value; this.c.applySettings(true); };
  }

  // Crew First-Contact Modal (Help vs Leave - Prompt 5 Section 2)
  crewModal(crewDef, onDecision) {
    this.screen = 'crew_modal';
    this.onCrewDecision = onDecision;
    this.screens.innerHTML = `<div class="screen" id="terminal">
      <div class="panel">
        <h3>&gt; ${esc(crewDef.name.toUpperCase())} // ${esc(crewDef.role.toUpperCase())}</h3>
        <p style="color:#cfe9f0;line-height:1.8">${esc(crewDef.intro)}</p>
        <div class="menu" style="min-width:100%;margin-top:12px">
          <button class="px-btn" data-act="crew-decide" data-choice="0">[1] ${esc(crewDef.choices.help)}</button>
          <button class="px-btn alt" data-act="crew-decide" data-choice="1">[2] ${esc(crewDef.choices.leave)}</button>
        </div>
      </div>
    </div>`;
  }

  // Bix Okafor Patch Panel Repair Puzzle UI (Prompt 5 Section 2.2)
  patchPuzzleModal(enc, onConnect, onClose) {
    this.screen = 'patch_puzzle';
    this.onPatchConnect = onConnect;
    this.onPatchClose = onClose;
    const conn = enc.connected || {};
    const wires = ['RED', 'GREEN', 'BLUE'];
    this.screens.innerHTML = `<div class="screen" id="terminal">
      <div class="panel" style="max-width:560px">
        <h3>&gt; RADIO ROOM PATCH PANEL // BIX OKAFOR</h3>
        <div style="color:#ffd068;margin-bottom:10px">${esc(enc.clueText)}</div>
        <p style="font-size:11px;color:#9fe8ff">Click a wire color, then click the matching terminal port (1, 2, or 3). A wrong connection sparks and adds +20 noise.</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:14px 0">
          <div>
            <div style="color:#ffe030;margin-bottom:6px">CABLE LEADS</div>
            ${wires.map((w) => `<button class="px-btn sm ${this.selectedWire === w ? 'alt' : ''}" style="width:100%;margin-bottom:6px" data-act="patch-wire" data-wire="${w}">${w} LEAD ${conn[w] ? `-> PORT ${conn[w]}` : ''}</button>`).join('')}
          </div>
          <div>
            <div style="color:#ffe030;margin-bottom:6px">TRANSCEIVER PORTS</div>
            ${[1, 2, 3].map((p) => `<button class="px-btn sm" style="width:100%;margin-bottom:6px" data-act="patch-port" data-port="${p}">PORT ${p}</button>`).join('')}
          </div>
        </div>
        <button class="px-btn sm alt" data-act="patch-close">STEP BACK [ESC]</button>
      </div>
    </div>`;
  }

  act(a, btn) {
    const c = this.c;
    if (a === 'accept-warning') {
      c.settings.reduceFlashing = !!this.$('#w-flash')?.checked;
      c.settings.limitScareVolume = !!this.$('#w-vol')?.checked;
      c.settings.jumpScareOff = !!this.$('#w-off')?.checked;
      c.settings.contentWarningSeen = true;
      c.applySettings();
      this.show('title');
    } else if (a === 'play') {
      c.seedInput = this.$('#seed-in')?.value.trim() || '';
      const diffVal = this.$('#diff-in')?.value;
      const hardChecked = !!this.$('#hard-in')?.checked;
      if (diffVal) c.settings.difficulty = diffVal;
      if (hardChecked && c.settings.difficulty === 'medium') c.settings.difficulty = 'hard';
      c.settings.hard = c.settings.difficulty === 'hard' || c.settings.difficulty === 'extreme' || hardChecked;
      c.applySettings();
      c.play(c.seedInput);
    } else if (a === 'howto') { this.prev = 'title'; this.show('howto'); }
    else if (a === 'howto-p') { this.prev = 'pause'; this.show('howto'); }
    else if (a === 'settings') { this.prev = 'title'; this.show('settings'); }
    else if (a === 'settings-p') { this.prev = 'pause'; this.show('settings'); }
    else if (a === 'journal-p') { this.prev = 'pause'; c.openJournal?.('pause'); }
    else if (a === 'credits') { this.prev = 'title'; this.show('credits'); }
    else if (a === 'audiotest') { this.prev = 'title'; c.startAudioTest?.(); }
    else if (a === 'hrtf-play') { c.playAudioTestBearing?.(); }
    else if (a === 'hrtf-guess') { c.guessAudioTestBearing?.(+btn.dataset.idx); }
    else if (a === 'sandbox') { this.prev = 'title'; c.startSandbox?.(); }
    else if (a === 'sb-clip') { c.setSandboxClip?.(btn.dataset.clip); }
    else if (a === 'sb-rot') { c.rotateSandboxMonster?.(); }
    else if (a === 'sb-scare') { c.triggerSandboxJumpScare?.(); }
    else if (a === 'back') this.show(this.prev);
    else if (a === 'close-modal') c.closeModal?.();
    else if (a === 'crew-decide') { this.onCrewDecision?.(+btn.dataset.choice); }
    else if (a === 'patch-wire') { this.selectedWire = btn.dataset.wire; this.patchPuzzleModal(c.activePatchEnc, this.onPatchConnect, this.onPatchClose); }
    else if (a === 'patch-port') { if (this.selectedWire) this.onPatchConnect?.(this.selectedWire, +btn.dataset.port); }
    else if (a === 'patch-close') { this.onPatchClose?.(); }
    else if (a === 'resume') c.resume();
    else if (a === 'quit') c.quit();
    else if (a === 'again') c.play('');
    else if (a === 'replay') c.play(c.getSeed());
    else if (a === 'rebind') {
      btn.textContent = 'PRESS KEY...';
      c.input.rebinding = (code) => { c.settings.keys[btn.dataset.key] = code; c.applySettings(); btn.textContent = pretty(code); };
    } else if (a === 'resetkeys') {
      c.settings.keys = { ...DEFAULT_KEYS }; c.applySettings(); this.show('settings');
    } else if (a === 'choice') c.choose(+btn.dataset.i);
  }

  setLoad(p, txt) {
    const b = this.$('#load-bar'); if (b) b.style.width = Math.round(p * 100) + '%';
    const t = this.$('#load-txt'); if (t && txt) t.textContent = txt;
  }

  showHud(v) { this.hud.classList.toggle('bs-hide', !v); }
  bars(h, p, n, t, total) {
    const set = (id, v, max, txt) => {
      this.$('#b-' + id).style.width = Math.max(0, Math.min(100, (v / max) * 100)) + '%';
      this.$('#v-' + id).textContent = txt;
    };
    set('health', h, 100, Math.ceil(h));
    set('power', p, 100, Math.ceil(p));
    set('noise', n, 100, Math.round(n));
    set('time', t, total, fmtTime(t));
    this.$('.bar.power').classList.toggle('low', p < 20);
    this.$('.bar.health').classList.toggle('low', h < 30);
    this.$('.bar.noise').classList.toggle('low', n > 60);
  }
  status(t) { if (t !== this._st) { this._st = t; this.$('#status').textContent = t; } }
  msg(t, ms = 3600) {
    const m = this.$('#msg'); m.textContent = t; m.style.opacity = 1;
    clearTimeout(this.msgT); this.msgT = setTimeout(() => { m.style.opacity = 0; }, ms);
  }
  prompt(t) { const p = this.$('#prompt'); if (p.textContent !== (t || '')) p.textContent = t || ''; }
  ring(v) {
    const r = this.$('#ring');
    if (v === null) { r.classList.add('bs-hide'); return; }
    r.classList.remove('bs-hide');
    r.querySelector('.fg').setAttribute('stroke-dashoffset', String(301.6 * (1 - v)));
  }
  sub(t) {
    const box = this.$('#subs'); const s = document.createElement('span');
    s.textContent = '[' + t + ']'; box.appendChild(s);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => s.remove(), 2800);
  }
  flash(color, op, ms) {
    if (this.c.settings.reduceFlashing) op = Math.min(op, 0.15);
    const f = this.$('#flash'); f.style.background = color; f.style.transition = 'none'; f.style.opacity = op;
    requestAnimationFrame(() => { f.style.transition = `opacity ${ms}ms`; f.style.opacity = 0; });
  }
  compass(txt) { const c = this.$('#compass'); c.classList.toggle('bs-hide', !txt); if (txt) c.textContent = txt; }
  radar() { return this.$('#radar'); }
  muteIcon(m) { this.$('#btn-mute').textContent = m ? 'MUTE' : 'SND'; this.$('#hud-vol').value = this.c.settings.master; }

  terminal(storyObj, power, costs) {
    this.screen = 'terminal'; clearInterval(this.typeTimer);
    const text = storyObj.log.join('\n\n');
    this.screens.innerHTML = `<div class="screen" id="terminal"><div class="panel"><h3>&gt; ${esc(storyObj.name.toUpperCase())} // ${esc(storyObj.role)}</h3><pre id="t-text"></pre><div id="t-choices" class="menu bs-hide" style="min-width:100%">${storyObj.choices.map((c, i) => {
      const ok = power >= (costs[i] || 0);
      return `<button class="px-btn ${i ? 'alt' : ''}" data-act="choice" data-i="${i}" ${ok ? '' : 'disabled'}>[${i + 1}] ${esc(c.label)}${ok ? '' : ' - NOT ENOUGH POWER'}</button>`;
    }).join('')}</div></div></div>`;
    const pre = this.$('#t-text'); let i = 0;
    this.typeTimer = setInterval(() => {
      i += 3; pre.textContent = text.slice(0, i);
      if (i >= text.length) { clearInterval(this.typeTimer); this.$('#t-choices')?.classList.remove('bs-hide'); }
    }, 22);
    this.typeTimer2 = setTimeout(() => this.$('#t-choices')?.classList.remove('bs-hide'), 1200);
  }
  terminalResult(text) {
    clearInterval(this.typeTimer);
    const p = this.$('#terminal .panel');
    if (p) p.innerHTML += `<pre style="margin-top:12px;color:#ffe9a8">&gt; ${esc(text)}</pre>`;
  }
  debug(t) { const d = this.$('#dbg'); d.classList.toggle('bs-hide', !t); if (t) d.textContent = t; }
  adebug(t) { const d = this.$('#adbg'); d.classList.toggle('bs-hide', !t); if (t) d.textContent = t; }
}
