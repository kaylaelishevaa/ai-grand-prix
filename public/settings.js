import { coupiSVG } from './coupi.js';

const defaults = { askBeforeBuying: true, holdLateNight: true, cameraOnlyCalls: true };

export function readMemorySettings(storage, seed = []) {
  let memories = seed.map(memory => ({ ...memory })), permissions = { ...defaults }, paused = false;
  try {
    const stored = JSON.parse(storage.getItem('coupi_memory'));
    if (Array.isArray(stored)) memories = stored.filter(m => typeof m.text === 'string' && typeof m.source === 'string');
    const prefs = JSON.parse(storage.getItem('coupi_permissions'));
    for (const key of Object.keys(defaults)) if (typeof prefs?.[key] === 'boolean') permissions[key] = prefs[key];
    paused = storage.getItem('coupi_memory_paused') === '1';
  } catch { /* In-memory settings remain usable when storage is unavailable. */ }
  return { memories, permissions, paused };
}

function initSettings() {
  const $ = id => document.getElementById(id);
  let storage;
  try { storage = window.localStorage; } catch { /* May be blocked by browser settings. */ }
  const settings = readMemorySettings(storage, window.HOME_DEMO?.memory || []);
  const permissionIds = { 'ask-before-buying': 'askBeforeBuying', 'hold-late-night': 'holdLateNight', 'camera-only-calls': 'cameraOnlyCalls' };
  $('settings-avatar').innerHTML = coupiSVG('calm', 76);
  function save(key, value, message) {
    try { storage.setItem(key, value); $('memory-status').textContent = message; }
    catch { $('memory-status').textContent = 'Changed for this visit. Your browser could not save it on this device.'; }
  }
  function renderMemories() {
    const root = $('settings-memories'); root.replaceChildren();
    for (const [index, memory] of settings.memories.entries()) {
      const row = document.createElement('div'); row.className = 'settings-memory';
      const copy = document.createElement('div'); copy.textContent = memory.text;
      const source = document.createElement('small'); source.textContent = 'Source: ' + memory.source; copy.append(source);
      const forget = document.createElement('button'); forget.className = 'settings-forget'; forget.textContent = 'Forget'; forget.setAttribute('aria-label', 'Forget: ' + memory.text);
      forget.addEventListener('click', () => {
        settings.memories.splice(index, 1);
        save('coupi_memory', JSON.stringify(settings.memories), 'Memory forgotten.'); renderMemories();
        (root.querySelectorAll('button')[Math.min(index, settings.memories.length - 1)] || $('pause-memory')).focus();
      });
      row.append(copy, forget); root.append(row);
    }
    if (!settings.memories.length) { const empty = document.createElement('p'); empty.className = 'settings-note'; empty.textContent = 'No memories saved.'; root.append(empty); }
  }
  for (const [id, key] of Object.entries(permissionIds)) {
    $(id).checked = settings.permissions[key];
    $(id).addEventListener('change', () => { settings.permissions[key] = $(id).checked; save('coupi_permissions', JSON.stringify(settings.permissions), 'Permission saved.'); });
  }
  function renderPause() { $('pause-memory').textContent = settings.paused ? 'Resume memory' : 'Pause memory'; $('pause-memory').setAttribute('aria-pressed', String(settings.paused)); }
  $('pause-memory').addEventListener('click', () => { settings.paused = !settings.paused; save('coupi_memory_paused', settings.paused ? '1' : '0', settings.paused ? 'Memory paused. Existing memories stay until you forget them.' : 'Memory resumed.'); renderPause(); });
  const dialog = $('forget-dialog');
  $('forget-everything').addEventListener('click', () => { dialog.showModal(); $('forget-cancel').focus(); });
  for (const id of ['forget-close', 'forget-cancel']) $(id).addEventListener('click', () => dialog.close());
  $('forget-confirm').addEventListener('click', () => { settings.memories = []; save('coupi_memory', '[]', 'All memories forgotten.'); renderMemories(); dialog.close(); });
  dialog.addEventListener('close', () => $('forget-everything').focus());
  renderMemories(); renderPause();
  if (settings.paused) $('memory-status').textContent = 'Memory is paused.';
}

if (typeof document !== 'undefined' && document.getElementById('coupi-settings')) initSettings();
