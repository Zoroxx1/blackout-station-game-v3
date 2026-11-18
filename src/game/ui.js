// DOM UI: HUD, title, how to play, settings (with key rebinding), pause, terminal, endings, credits.
import './ui.css';
import manifest from '../../assets/manifest.json';
import { DEFAULT_KEYS } from './config.js';

const KEYNAMES = { forward: 'Move forward', back: 'Move back', left: 'Strafe left', right: 'Strafe right', run: 'Run (hold)', light: 'Flashlight', swap: 'Switch item', use: 'Use item', interact: 'Interact / hold', choice1: 'Terminal choice 1', choice2: 'Terminal choice 2' };
const pretty = (c) => c.replace('Key', '').replace('Digit', '').replace('Left', ' L').replace('Right', ' R');
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
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
        <div class="bar time"><label><span>STATION COLLAPSE</span><span id="v-time">10:00</span></label><div class="b"><i id="b-time"></i></div></div>
      </div>
      <div class="status" id="status"></div>
      <div class="topright"><button class="px-btn sm" id="btn-mute" title="Mute">SND</button><input type="range" id="hud-vol" min="0" max="1" step="0.05" title="Master volume"><button class="px-btn sm" id="btn-fs" title="Fullscreen">FULL</button><button class="px-btn sm" id="btn-pause" title="Pause">II</button></div>
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
    d.addEventListener('click', (e) => { const b = e.target.closest?.('[data-act]'); if (!b || b.disabled) return; ctx.sfx('ui-click'); this.act(b.dataset.act, b); });
    this.$('#btn-fs').onclick = () => ctx.fullscreen(); this.$('#btn-pause').onclick = () => ctx.pause(); this.$('#btn-mute').onclick = () => { ctx.settings.mute = !ctx.settings.mute; ctx.applySettings(); };
    this.$('#hud-vol').oninput = (e) => { ctx.settings.master = +e.target.value; ctx.applySettings(); };
    ['pointerdown', 'mousedown'].forEach((ev) => this.$('.topright').addEventListener(ev, (e) => e.stopPropagation()));
  }
  // ---------------- screens ----------------
  hideScreens() { this.screens.innerHTML = ''; this.screen = null; }
  show(name, data = {}) {
    this.screen = name; const r = this.c.save.records; let h = '';
    if (name === 'loading') h = `<h1 class="title">BLACKOUT<br>STATION</h1><div class="sub" id="load-txt">Assembling the station...</div><div class="bar-load"><i id="load-bar"></i></div>`;
    else if (name === 'title') h = `<h1 class="title">BLACKOUT<br>STATION</h1><div class="sub">THE HULL IS FAILING. TEN MINUTES. IT CAN'T SEE YOU. IT CAN HEAR EVERYTHING.</div>
      <div class="menu"><button class="px-btn" data-act="play">PLAY</button><button class="px-btn" data-act="howto">HOW TO PLAY</button><button class="px-btn" data-act="settings">SETTINGS</button><button class="px-btn" data-act="credits">CREDITS</button></div>
      <div class="row"><div class="field" style="grid-template-columns:auto auto"><span>SEED</span><input type="text" id="seed-in" maxlength="16" placeholder="random" value="${esc(this.c.seedInput || '')}"></div><div class="field" style="grid-template-columns:auto auto"><span>HARD MODE</span><input type="checkbox" id="hard-in" ${this.c.settings.hard ? 'checked' : ''}></div></div>
      <div class="seed">${r.runs ? `RUNS ${r.runs} | ESCAPES ${r.wins} | BEST TIME LEFT ${r.bestTime ? fmtTime(r.bestTime) : '--'} | BEST: ${r.bestEnding ? esc(r.bestEnding) : '--'}` : 'NO RUNS YET'}</div><div class="ver">v1.0 - THREE.JS / WEBGL2</div>`;
    else if (name === 'howto') h = `<h2 class="h2">HOW TO PLAY</h2><div class="panel"><h3>GOAL</h3>Find the BLUE keycard, reach the escape pod and launch it (10 power) before the hull fails. Pink lockers hold keycards and noise decoys. Terminals hold the crew's logs and force a choice.<br><br>
      <h3>THE CREATURE</h3>It is blind. It hunts what it hears: running, doors, scanning, generators. Running is slightly faster than its chase: gain distance, stop, switch the flashlight OFF and walk quietly until the hunt ends. The dark drains health after 60 s without light.<br><br>
      <h3>CONTROLS</h3><table><tr><td><span class="kbd">W</span><span class="kbd">A</span><span class="kbd">S</span><span class="kbd">D</span> move</td><td>Mouse / arrows look</td></tr><tr><td><span class="kbd">SHIFT</span> run (loud)</td><td><span class="kbd">L</span> flashlight</td></tr><tr><td><span class="kbd">Q</span>/<span class="kbd">TAB</span> switch item</td><td><span class="kbd">SPACE</span> use item</td></tr><tr><td><span class="kbd">E</span> interact (HOLD at generators)</td><td><span class="kbd">1</span> <span class="kbd">2</span> terminal choice</td></tr><tr><td><span class="kbd">ESC</span> pause</td><td><span class="kbd">F3</span> debug, <span class="kbd">F4</span> audio debug</td></tr></table>
      <br><b>PHONE:</b> left stick moves (push fully = run), drag the right side to look, USE (hold at generators), TOOL, SWAP, LIGHT, RUN.</div><button class="px-btn" data-act="back">BACK</button>`;
    else if (name === 'settings') h = this.settingsHTML();
    else if (name === 'pause') h = `<h2 class="h2">PAUSED</h2><div class="menu"><button class="px-btn" data-act="resume">RESUME</button><button class="px-btn" data-act="howto-p">HOW TO PLAY</button><button class="px-btn" data-act="settings-p">SETTINGS</button><button class="px-btn alt" data-act="quit">QUIT TO TITLE</button></div><div class="seed">SEED ${esc(this.c.getSeed())}</div>`;
    else if (name === 'credits') h = `<h2 class="h2">CREDITS</h2><div class="panel" style="max-height:60vh;overflow:auto"><h3>BLACKOUT STATION</h3>Design, code, textures, models and sound: generated procedurally in-engine.<br><br><h3>ASSETS</h3><table>${manifest.assets.map((a) => `<tr><td>${esc(a.name)}</td><td>${esc(a.author)}</td><td>${esc(a.license)}</td></tr>`).join('')}</table><br>${manifest.notes.map(esc).join('<br>')}</div><button class="px-btn" data-act="back">BACK</button>`;
    else if (name === 'ending') h = `<h1 class="ending-title">${esc(data.title)}</h1><div class="ending-text">${esc(data.text)}</div><div class="stats">${data.stats.map(esc).join('<br>')}</div><div id="lb"></div><div class="row"><button class="px-btn" data-act="again">RUN AGAIN</button><button class="px-btn alt" data-act="replay">SAME SEED</button><button class="px-btn" data-act="quit">TITLE</button></div>`;
    this.screens.innerHTML = `<div class="screen" id="scr-${name}">${h}</div>`;
    if (name === 'settings') this.bindSettings();
  }
  settingsHTML() {
    const s = this.c.settings, unlocked = this.c.save.records.wins > 0;
    const rng = (id, v, min, max, step) => `<input type="range" id="s-${id}" min="${min}" max="${max}" step="${step}" value="${v}">`;
    const chk = (id, v, dis) => `<input type="checkbox" id="s-${id}" ${v ? 'checked' : ''} ${dis ? 'disabled' : ''}>`;
    return `<h2 class="h2">SETTINGS</h2><div class="panel" style="max-height:66vh;overflow:auto;min-width:min(520px,92vw)">
      <div class="field"><span>LOOK SENSITIVITY</span>${rng('sens', s.sens, 0.2, 3, 0.05)}</div><div class="field"><span>INVERT LOOK</span>${chk('invert', s.invert)}</div>
      <div class="field"><span>MASTER VOLUME</span>${rng('master', s.master, 0, 1, 0.05)}</div><div class="field"><span>MUSIC VOLUME</span>${rng('music', s.music, 0, 1, 0.05)}</div><div class="field"><span>EFFECTS VOLUME</span>${rng('sfx', s.sfx, 0, 1, 0.05)}</div><div class="field"><span>MUTE</span>${chk('mute', s.mute)}</div>
      <div class="field"><span>GRAPHICS QUALITY</span><select id="s-quality">${['auto', 'low', 'medium', 'high'].map((q) => `<option ${s.quality === q ? 'selected' : ''}>${q}</option>`).join('')}</select></div>
      <div class="field"><span>CAMERA SHAKE</span>${rng('shake', s.shake, 0, 1.5, 0.1)}</div><div class="field"><span>SUBTITLES</span>${chk('subtitles', s.subtitles)}</div><div class="field"><span>COLORBLIND-FRIENDLY</span>${chk('colorblind', s.colorblind)}</div>
      <div class="field"><span>POD COMPASS ${unlocked ? '' : '(UNLOCK: ESCAPE ONCE)'}</span>${chk('compass', s.compass && unlocked, !unlocked)}</div><div class="field"><span>HARD MODE</span>${chk('hard', s.hard)}</div>
      <h3 style="margin-top:12px">KEY BINDINGS</h3><table>${Object.keys(KEYNAMES).map((a) => `<tr><td>${KEYNAMES[a]}</td><td><button class="px-btn sm" data-act="rebind" data-key="${a}">${pretty(s.keys[a])}</button></td></tr>`).join('')}</table>
      <div class="row" style="margin-top:8px"><button class="px-btn sm alt" data-act="resetkeys">RESET KEYS</button></div></div><button class="px-btn" data-act="back">BACK</button>`;
  }
  bindSettings() {
    const s = this.c.settings, q = (id) => this.$('#s-' + id);
    for (const k of ['sens', 'master', 'music', 'sfx', 'shake']) q(k).oninput = (e) => { s[k] = +e.target.value; this.c.applySettings(); };
    for (const k of ['invert', 'mute', 'subtitles', 'colorblind', 'compass', 'hard']) q(k).onchange = (e) => { s[k] = e.target.checked; this.c.applySettings(); };
    q('quality').onchange = (e) => { s.quality = e.target.value; this.c.applySettings(true); };
  }
  act(a, btn) {
    const c = this.c;
    if (a === 'play') { c.seedInput = this.$('#seed-in')?.value.trim() || ''; c.settings.hard = !!this.$('#hard-in')?.checked; c.applySettings(); c.play(c.seedInput); }
    else if (a === 'howto') { this.prev = 'title'; this.show('howto'); } else if (a === 'howto-p') { this.prev = 'pause'; this.show('howto'); }
    else if (a === 'settings') { this.prev = 'title'; this.show('settings'); } else if (a === 'settings-p') { this.prev = 'pause'; this.show('settings'); }
    else if (a === 'credits') { this.prev = 'title'; this.show('credits'); }
    else if (a === 'back') this.show(this.prev);
    else if (a === 'resume') c.resume(); else if (a === 'quit') c.quit(); else if (a === 'again') c.play(''); else if (a === 'replay') c.play(c.getSeed());
    else if (a === 'rebind') { btn.textContent = 'PRESS KEY...'; c.input.rebinding = (code) => { c.settings.keys[btn.dataset.key] = code; c.applySettings(); btn.textContent = pretty(code); }; }
    else if (a === 'resetkeys') { c.settings.keys = { ...DEFAULT_KEYS }; c.applySettings(); this.show('settings'); }
    else if (a === 'choice') c.choose(+btn.dataset.i);
  }
  setLoad(p, txt) { const b = this.$('#load-bar'); if (b) b.style.width = Math.round(p * 100) + '%'; const t = this.$('#load-txt'); if (t && txt) t.textContent = txt; }
  // ---------------- HUD ----------------
  showHud(v) { this.hud.classList.toggle('bs-hide', !v); }
  bars(h, p, n, t, total) {
    const set = (id, v, max, txt) => { this.$('#b-' + id).style.width = Math.max(0, Math.min(100, (v / max) * 100)) + '%'; this.$('#v-' + id).textContent = txt; };
    set('health', h, 100, Math.ceil(h)); set('power', p, 100, Math.ceil(p)); set('noise', n, 100, Math.round(n)); set('time', t, total, fmtTime(t));
    this.$('.bar.power').classList.toggle('low', p < 20); this.$('.bar.health').classList.toggle('low', h < 30); this.$('.bar.noise').classList.toggle('low', n > 60);
  }
  status(t) { if (t !== this._st) { this._st = t; this.$('#status').textContent = t; } }
  msg(t, ms = 3600) { const m = this.$('#msg'); m.textContent = t; m.style.opacity = 1; clearTimeout(this.msgT); this.msgT = setTimeout(() => { m.style.opacity = 0; }, ms); }
  prompt(t) { const p = this.$('#prompt'); if (p.textContent !== (t || '')) p.textContent = t || ''; }
  ring(v) { const r = this.$('#ring'); if (v === null) { r.classList.add('bs-hide'); return; } r.classList.remove('bs-hide'); r.querySelector('.fg').setAttribute('stroke-dashoffset', String(301.6 * (1 - v))); }
  sub(t) { const box = this.$('#subs'); const s = document.createElement('span'); s.textContent = '[' + t + ']'; box.appendChild(s); while (box.children.length > 3) box.firstChild.remove(); setTimeout(() => s.remove(), 2800); }
  flash(color, op, ms) { const f = this.$('#flash'); f.style.background = color; f.style.transition = 'none'; f.style.opacity = op; requestAnimationFrame(() => { f.style.transition = `opacity ${ms}ms`; f.style.opacity = 0; }); }
  compass(txt) { const c = this.$('#compass'); c.classList.toggle('bs-hide', !txt); if (txt) c.textContent = txt; }
  radar() { return this.$('#radar'); }
  muteIcon(m) { this.$('#btn-mute').textContent = m ? 'MUTE' : 'SND'; this.$('#hud-vol').value = this.c.settings.master; }
  // ---------------- terminal ----------------
  terminal(story, power, costs) {
    this.screen = 'terminal'; clearInterval(this.typeTimer);
    const text = story.log.join('\n\n');
    this.screens.innerHTML = `<div class="screen" id="terminal"><div class="panel"><h3>&gt; ${esc(story.name.toUpperCase())} // ${esc(story.role)}</h3><pre id="t-text"></pre><div id="t-choices" class="menu bs-hide" style="min-width:100%">${story.choices.map((c, i) => { const ok = power >= (costs[i] || 0); return `<button class="px-btn ${i ? 'alt' : ''}" data-act="choice" data-i="${i}" ${ok ? '' : 'disabled'}>[${i + 1}] ${esc(c.label)}${ok ? '' : ' - NOT ENOUGH POWER'}</button>`; }).join('')}</div></div></div>`;
    const pre = this.$('#t-text'); let i = 0;
    this.typeTimer = setInterval(() => { i += 3; pre.textContent = text.slice(0, i); if (i >= text.length) { clearInterval(this.typeTimer); this.$('#t-choices').classList.remove('bs-hide'); } }, 22);
    this.typeTimer2 = setTimeout(() => this.$('#t-choices')?.classList.remove('bs-hide'), 1200); // choices appear early; they are forced anyway
  }
  terminalResult(text) { clearInterval(this.typeTimer); const p = this.$('#terminal .panel'); if (p) p.innerHTML += `<pre style="margin-top:12px;color:#ffe9a8">&gt; ${esc(text)}</pre>`; }
  debug(t) { const d = this.$('#dbg'); d.classList.toggle('bs-hide', !t); if (t) d.textContent = t; }
  adebug(t) { const d = this.$('#adbg'); d.classList.toggle('bs-hide', !t); if (t) d.textContent = t; }
}
