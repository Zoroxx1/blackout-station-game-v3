// Local settings + records.
import { CFG, DEFAULT_KEYS } from './config.js';
const KEY = 'blackout-station-v1';
const DEFAULTS = { sens: 1, master: CFG.audio.master, music: CFG.audio.music, sfx: CFG.audio.sfx, mute: false, quality: 'auto', invert: false, shake: 1, subtitles: true, colorblind: false, compass: false, hard: false, keys: { ...DEFAULT_KEYS } };
export function loadSave() {
  try { const o = JSON.parse(localStorage.getItem(KEY) || '{}'); return { settings: { ...DEFAULTS, ...(o.settings || {}), keys: { ...DEFAULT_KEYS, ...(o.settings?.keys || {}) } }, records: { bestTime: 0, bestEnding: null, bestCrew: -1, runs: 0, wins: 0, endings: {}, ...(o.records || {}) } }; }
  catch { return { settings: { ...DEFAULTS }, records: { bestTime: 0, bestEnding: null, bestCrew: -1, runs: 0, wins: 0, endings: {} } }; }
}
export function persist(save) { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch { /* storage blocked */ } }
export function autoQuality() {
  const mobile = matchMedia('(pointer: coarse)').matches; const cores = navigator.hardwareConcurrency || 4, mem = navigator.deviceMemory || 4;
  if (mobile) return cores >= 8 && mem >= 6 ? 'medium' : 'low';
  return cores >= 8 && mem >= 8 ? 'high' : cores >= 4 ? 'medium' : 'low';
}
