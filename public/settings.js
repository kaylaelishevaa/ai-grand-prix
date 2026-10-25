import { coupiSVG } from './coupi.js';

const defaults = { askBeforeBuying: true, holdLateNight: true, cameraOnlyCalls: true };

export function readMemorySettings(storage, seed = []) {
  let memories = seed.map(memory => ({ ...memory })), permissions = { ...defaults }, paused = false;
  try {
    const stored = JSON.parse(storage.getItem('coupi_memory'));
    if (Array.isArray(stored)) memories = stored.filter(m => m && typeof m.text === 'string' && typeof m.source === 'string');
  } catch { /* Invalid memory data must not prevent reading the pause setting. */ }
  try {
    const prefs = JSON.parse(storage.getItem('coupi_permissions'));
    for (const key of Object.keys(defaults)) if (typeof prefs?.[key] === 'boolean') permissions[key] = prefs[key];
  } catch { /* In-memory settings remain usable when storage is unavailable. */ }
  try { paused = storage.getItem('coupi_memory_paused') === '1'; } catch { /* Storage may be blocked. */ }
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
    try { storage.setItem(key, value); $('memory-status').textContent = message; return true; }
    catch { $('memory-status').textContent = 'Your browser could not save this change. Please allow browser storage and try again.'; return false; }
  }
  function addMemory(value, source) {
    const text = value.trim();
    if (!text || text.length > 400) { $('memory-status').textContent = 'Enter a memory between 1 and 400 characters.'; return false; }
    if (settings.memories.some(memory => memory.text.toLocaleLowerCase() === text.toLocaleLowerCase())) { $('memory-status').textContent = 'That memory is already saved.'; return false; }
    if (settings.memories.length >= 20) { $('memory-status').textContent = 'You can save up to 20 memories. Forget one before adding another.'; return false; }
    const memories = [...settings.memories, { text, source }];
    try { storage.setItem('coupi_memory', JSON.stringify(memories)); }
    catch { $('memory-status').textContent = 'Could not save this memory on your device. Please allow browser storage and try again.'; return false; }
    settings.memories = memories;
    $('memory-status').textContent = settings.paused ? 'Memory saved. Resume memory to use it for recommendations.' : 'Memory saved. Coupi will consider it in your next recommendation.';
    renderMemories();
    return true;
  }
  $('memory-form').addEventListener('submit', event => {
    event.preventDefault();
    const input = $('memory-input');
    if (addMemory(input.value, 'you told me')) input.value = '';
    input.focus();
  });
  function renderMemories() {
    const root = $('settings-memories'); root.replaceChildren();
    for (const [index, memory] of settings.memories.entries()) {
      const row = document.createElement('div'); row.className = 'settings-memory';
      const copy = document.createElement('div'); copy.textContent = memory.text;
      const source = document.createElement('small'); source.textContent = 'Source: ' + memory.source; copy.append(source);
      const forget = document.createElement('button'); forget.className = 'settings-forget'; forget.textContent = 'Forget'; forget.setAttribute('aria-label', 'Forget: ' + memory.text);
      forget.addEventListener('click', () => {
        const memories = settings.memories.filter((_, i) => i !== index);
        if (!save('coupi_memory', JSON.stringify(memories), 'Memory forgotten.')) return;
        settings.memories = memories; renderMemories();
        (root.querySelectorAll('button')[Math.min(index, settings.memories.length - 1)] || $('pause-memory')).focus();
      });
      row.append(copy, forget); root.append(row);
    }
    if (!settings.memories.length) {
      const empty = document.createElement('p'); empty.className = 'settings-note'; empty.textContent = 'No memories saved.';
      const heading = document.createElement('h3'); heading.className = 'settings-suggestions-heading'; heading.textContent = 'Suggested memories';
      const hint = document.createElement('p'); hint.className = 'settings-note'; hint.textContent = 'Choose a preference that fits you. Only saved suggestions become memories.';
      root.append(empty, heading, hint);
      for (const text of ['I prefer budget-friendly options.', 'I like neutral colors.', 'I look for compact, space-saving items.']) {
        const row = document.createElement('div'); row.className = 'settings-memory';
        const copy = document.createElement('div'); copy.textContent = text;
        const remember = document.createElement('button'); remember.type = 'button'; remember.className = 'settings-remember'; remember.textContent = 'Save'; remember.setAttribute('aria-label', 'Save memory: ' + text);
        remember.addEventListener('click', () => {
          if (addMemory(text, 'you saved a suggestion')) root.querySelectorAll('button')[0].focus();
        });
        row.append(copy, remember); root.append(row);
      }
    }
  }
  for (const [id, key] of Object.entries(permissionIds)) {
    $(id).checked = settings.permissions[key];
    $(id).addEventListener('change', () => {
      const permissions = { ...settings.permissions, [key]: $(id).checked };
      if (save('coupi_permissions', JSON.stringify(permissions), 'Permission saved.')) settings.permissions = permissions;
      else $(id).checked = settings.permissions[key];
    });
  }
  function renderPause() { $('pause-memory').textContent = settings.paused ? 'Resume memory' : 'Pause memory'; $('pause-memory').setAttribute('aria-pressed', String(settings.paused)); }
  $('pause-memory').addEventListener('click', () => {
    const paused = !settings.paused;
    if (!save('coupi_memory_paused', paused ? '1' : '0', paused ? 'Memory paused. Saved memories will not be used for recommendations.' : 'Memory resumed. Saved memories will help guide recommendations.')) return;
    settings.paused = paused; renderPause();
  });
  const dialog = $('forget-dialog');
  $('forget-everything').addEventListener('click', () => { dialog.showModal(); $('forget-cancel').focus(); });
  for (const id of ['forget-close', 'forget-cancel']) $(id).addEventListener('click', () => dialog.close());
  $('forget-confirm').addEventListener('click', () => {
    if (!save('coupi_memory', '[]', 'All memories forgotten.')) { dialog.close(); return; }
    settings.memories = []; renderMemories(); dialog.close();
  });
  dialog.addEventListener('close', () => $('forget-everything').focus());
  renderMemories(); renderPause();
  if (settings.paused) $('memory-status').textContent = 'Memory is paused.';
}

if (typeof document !== 'undefined' && document.getElementById('coupi-settings')) initSettings();
