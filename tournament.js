/* ==========================================================================
   Urlaubs-Turnier, Spieler-Verwaltung & Google-Drive CSV-Sync (tournament.js)
   Multi-Geräte-Turnier-Datenbank über Google Apps Script + Drive-CSV
   ========================================================================== */
(function(global) {
  'use strict';

  // ==========================================================================
  // CLOUD-KONFIGURATION (hier deine Google Apps Script Web-App-URL eintragen)
  // ==========================================================================
  const CLOUD_CONFIG = {
    appsScriptUrl: 'https://script.google.com/macros/s/AKfycbzf1Feaf1jlOvO0Hhw2_uTX09ham0ZaIjPsIGUXw7BAZtuHSxENyG1IXaJYoVZulfZWLw/exec',
    driveFolderUrl: 'https://drive.google.com/drive/folders/1Oqvt-SfoJk4H5PwC1gEsb-7YZf5UqPaY',
    pollIntervalMs: 25000
  };

  const STORAGE_KEY = 'spiele_turnier_db';
  const CLOUD_META_KEY = 'spiele_turnier_cloud_meta';
  const PIN_STORAGE_KEY = 'spiele_turnier_pin';
  const PENDING_QUEUE_KEY = 'spiele_turnier_pending_uploads';
  const PLACEHOLDER_GAME = '__SPIELER__';

  const AVATARS = ['🦁', '🦊', '🐼', '🐸', '🐯', '🐙', '🦄', '🦉', '🐝', '🐧', '🐢', '🦖', '🚀', '⚡', '🌟', '🍀'];

  const GAMES = {
    'Flip7': { icon: '7️⃣', lowerIsBetter: false, kingTitle: 'Flip7-Champ' },
    'Wizard': { icon: '🧙‍♂️', lowerIsBetter: false, kingTitle: 'Wizard-Meister' },
    'Qwirkle': { icon: '🧩', lowerIsBetter: false, kingTitle: 'Qwirkle-Stratege' },
    'Cabo': { icon: '🤫', lowerIsBetter: true, kingTitle: 'Cabo-Ass' },
    'Tutto': { icon: '🎲', lowerIsBetter: false, kingTitle: 'Tutto-Legende' },
    'Kniffel': { icon: '🎲', lowerIsBetter: false, kingTitle: 'Kniffel-König' },
    'Yatzy': { icon: '🎲', lowerIsBetter: false, kingTitle: 'Yatzy-König' },
    'Minigolf': { icon: '⛳', lowerIsBetter: true, kingTitle: 'Minigolf-Pro' },
    'Mölkky': { icon: '🪵', lowerIsBetter: false, kingTitle: 'Mölkky-Scharfschütze' }
  };

  let inFlightSyncPromise = null;
  let lastSyncAttemptMs = 0;
  let isSyncing = false;
  let pollTimerId = null;
  let activePinPromise = null;

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function getAppsScriptUrl() {
    const raw = String(CLOUD_CONFIG.appsScriptUrl || '').trim();
    if (!raw || raw.indexOf('HIER_') === 0 || !/^https:\/\/script\.google\.com\//i.test(raw)) {
      return '';
    }
    return raw;
  }

  function isCloudConfigured() {
    return getAppsScriptUrl() !== '';
  }

  function createEmptyDB() {
    return {
      players: [],
      matches: [],
      nextMatchId: 1
    };
  }

  function loadDB() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return createEmptyDB();
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return createEmptyDB();
      return {
        players: Array.isArray(parsed.players) ? parsed.players : [],
        matches: Array.isArray(parsed.matches) ? parsed.matches : [],
        nextMatchId: typeof parsed.nextMatchId === 'number' && parsed.nextMatchId >= 1
          ? parsed.nextMatchId
          : (Array.isArray(parsed.matches) ? parsed.matches.length + 1 : 1)
      };
    } catch (e) {
      return createEmptyDB();
    }
  }

  function saveDB(db) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    } catch (e) {
      console.error('Fehler beim Speichern der Turnier-Datenbank:', e);
    }
    try {
      global.dispatchEvent(new CustomEvent('tournament-updated', { detail: db }));
    } catch (e) {}
  }

  function loadCloudMeta() {
    try {
      const raw = localStorage.getItem(CLOUD_META_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return (parsed && typeof parsed === 'object') ? parsed : {};
    } catch (e) {
      return {};
    }
  }

  function saveCloudMeta(patch) {
    const next = Object.assign({}, loadCloudMeta(), patch || {});
    try {
      localStorage.setItem(CLOUD_META_KEY, JSON.stringify(next));
    } catch (e) {}
    emitSyncStatus();
    return next;
  }

  function getStoredPin() {
    try {
      return String(localStorage.getItem(PIN_STORAGE_KEY) || '').trim();
    } catch (e) {
      return '';
    }
  }

  function setStoredPin(pin) {
    const clean = String(pin || '').trim();
    try {
      if (clean) localStorage.setItem(PIN_STORAGE_KEY, clean);
      else localStorage.removeItem(PIN_STORAGE_KEY);
    } catch (e) {}
    emitSyncStatus();
  }

  function clearStoredPin() {
    setStoredPin('');
  }

  function getPendingUploads() {
    try {
      const raw = localStorage.getItem(PENDING_QUEUE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function savePendingUploads(list) {
    try {
      localStorage.setItem(PENDING_QUEUE_KEY, JSON.stringify(Array.isArray(list) ? list : []));
    } catch (e) {}
    emitSyncStatus();
  }

  function enqueuePendingUpload(item) {
    const queue = getPendingUploads();
    const exists = queue.some(q => q.clientMatchId === item.clientMatchId);
    if (!exists) {
      queue.push(item);
      savePendingUploads(queue);
    }
  }

  function removePendingUpload(clientMatchId) {
    if (!clientMatchId) return;
    const queue = getPendingUploads();
    const filtered = queue.filter(q => q.clientMatchId !== clientMatchId);
    if (filtered.length !== queue.length) {
      savePendingUploads(filtered);
    }
  }

  function getPendingUploadsCount() {
    return getPendingUploads().length;
  }

  function getCloudStatus() {
    const meta = loadCloudMeta();
    return {
      configured: isCloudConfigured(),
      syncing: isSyncing,
      pendingCount: getPendingUploadsCount(),
      hasPin: !!getStoredPin(),
      csvUrl: meta.csvUrl || '',
      csvDownloadUrl: meta.csvDownloadUrl || '',
      folderUrl: meta.folderUrl || CLOUD_CONFIG.driveFolderUrl,
      lastSyncAt: meta.lastSyncAt || '',
      lastSyncError: meta.lastSyncError || ''
    };
  }

  function emitSyncStatus() {
    try {
      global.dispatchEvent(new CustomEvent('tournament-sync-status', { detail: getCloudStatus() }));
    } catch (e) {}
  }

  function pickNextAvatar(existingPlayers) {
    const used = new Set(existingPlayers.map(p => p.avatar));
    for (let i = 0; i < AVATARS.length; i++) {
      if (!used.has(AVATARS[i])) return AVATARS[i];
    }
    return AVATARS[existingPlayers.length % AVATARS.length];
  }

  function getPlayers() {
    return loadDB().players;
  }

  function ensurePlayersRegistered(db, entries) {
    let added = false;
    entries.forEach(item => {
      const cleanName = typeof item === 'string' ? item.trim() : String((item && item.name) || '').trim();
      const preferredAvatar = typeof item === 'object' && item && item.avatar ? String(item.avatar).trim() : '';
      if (!cleanName) return;
      const existing = db.players.find(p => p.name.toLowerCase() === cleanName.toLowerCase());
      if (!existing) {
        db.players.push({
          id: 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
          name: cleanName,
          avatar: preferredAvatar || pickNextAvatar(db.players)
        });
        added = true;
      } else if (preferredAvatar && existing.avatar !== preferredAvatar) {
        existing.avatar = preferredAvatar;
      }
    });
    return added;
  }

  function computeRanks(entries, lowerIsBetter) {
    const list = entries.map(e => ({
      name: String(e.name || '').trim(),
      avatar: e.avatar ? String(e.avatar).trim() : '',
      score: e.score !== undefined && e.score !== null && e.score !== '' && !isNaN(Number(e.score)) ? Number(e.score) : null,
      explicitRank: e.rank !== undefined && e.rank !== null && !isNaN(Number(e.rank)) ? Number(e.rank) : null
    })).filter(e => e.name !== '');

    if (list.length === 0) return [];

    const useExplicitRank = list.every(e => e.explicitRank !== null);
    if (useExplicitRank) {
      list.sort((a, b) => a.explicitRank - b.explicitRank);
      const count = list.length;
      return list.map(item => ({
        name: item.name,
        avatar: item.avatar,
        score: item.score !== null ? item.score : 0,
        rank: item.explicitRank,
        tournamentPoints: Math.max(1, count - item.explicitRank + 1),
        playerCount: count
      }));
    }

    list.sort((a, b) => {
      const sa = a.score !== null ? a.score : 0;
      const sb = b.score !== null ? b.score : 0;
      return lowerIsBetter ? (sa - sb) : (sb - sa);
    });

    const count = list.length;
    const ranked = [];
    for (let i = 0; i < count; i++) {
      const s = list[i].score !== null ? list[i].score : 0;
      let rank = i + 1;
      if (i > 0) {
        const prevScore = list[i - 1].score !== null ? list[i - 1].score : 0;
        if (s === prevScore) {
          rank = ranked[i - 1].rank;
        }
      }
      ranked.push({
        name: list[i].name,
        avatar: list[i].avatar,
        score: s,
        rank: rank,
        tournamentPoints: Math.max(1, count - rank + 1),
        playerCount: count
      });
    }
    return ranked;
  }

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function getNowDateTime() {
    const now = new Date();
    const date = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
    const time = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
    return { date, time };
  }

  function generateClientMatchId() {
    return 'm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
  }

  // --- Cloud HTTP-Helfer ---
  async function callCloudGet() {
    const baseUrl = getAppsScriptUrl();
    if (!baseUrl) {
      return { ok: false, notConfigured: true, error: 'Apps-Script-URL ist noch nicht eingetragen.' };
    }
    const sep = baseUrl.indexOf('?') === -1 ? '?' : '&';
    const url = `${baseUrl}${sep}action=read&t=${Date.now()}`;
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      cache: 'no-store'
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    if (!data || typeof data !== 'object') {
      throw new Error('Ungültige Antwort vom Google Apps Script.');
    }
    return data;
  }

  async function callCloudPost(payload) {
    const baseUrl = getAppsScriptUrl();
    if (!baseUrl) {
      return { ok: false, notConfigured: true, error: 'Apps-Script-URL ist noch nicht eingetragen.' };
    }
    // text/plain verhindert CORS OPTIONS-Preflight bei Google Apps Script Web-Apps
    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      redirect: 'follow'
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    if (!data || typeof data !== 'object') {
      throw new Error('Ungültige Antwort vom Google Apps Script.');
    }
    if (data.code === 'INVALID_PIN') {
      clearStoredPin();
    }
    if (data.ok && typeof data.csvContent === 'string') {
      importCSV(data.csvContent, { allowEmpty: true });
      saveCloudMeta({
        csvUrl: data.csvUrl || loadCloudMeta().csvUrl || '',
        csvDownloadUrl: data.csvDownloadUrl || loadCloudMeta().csvDownloadUrl || '',
        folderUrl: data.folderUrl || CLOUD_CONFIG.driveFolderUrl,
        lastSyncAt: new Date().toISOString(),
        lastSyncError: ''
      });
    }
    return data;
  }

  // --- Eingebauter M3 PIN-Dialog (funktioniert auf Dashboard & allen Spiel-Seiten) ---
  function ensurePinModalElement() {
    let overlay = document.getElementById('t-cloud-pin-modal');
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = 't-cloud-pin-modal';
    overlay.className = 'modal-overlay t-pin-overlay hidden';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 't-pin-modal-title');
    overlay.innerHTML = `
      <div class="modal-content t-pin-card">
        <div class="t-modal-header">
          <h2 id="t-pin-modal-title">🔑 Turnier-PIN eingeben</h2>
          <button type="button" class="t-modal-close" id="t-pin-close-btn" aria-label="Abbrechen">✕</button>
        </div>
        <p id="t-pin-reason" class="t-pin-desc">
          Zum Speichern oder Bearbeiten in der gemeinsamen Google-Drive-CSV wird die Turnier-PIN benötigt (einmalig pro Gerät).
        </p>
        <input type="password" id="t-pin-input" class="t-pin-input" placeholder="Turnier-PIN..." autocomplete="off" inputmode="text">
        <div id="t-pin-error" class="t-password-error hidden" role="alert"></div>
        <div style="display:flex; gap:10px; margin-top:14px;">
          <button type="button" class="btn-outline" id="t-pin-cancel-btn" style="flex:1;">Abbrechen</button>
          <button type="button" class="btn-primary" id="t-pin-submit-btn" style="flex:1;">Freischalten</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    return overlay;
  }

  function requestPin(reasonText, initialErrorText) {
    if (activePinPromise) return activePinPromise;

    activePinPromise = new Promise((resolve) => {
      const overlay = ensurePinModalElement();
      const reasonEl = overlay.querySelector('#t-pin-reason');
      const inputEl = overlay.querySelector('#t-pin-input');
      const errEl = overlay.querySelector('#t-pin-error');
      const submitBtn = overlay.querySelector('#t-pin-submit-btn');
      const cancelBtn = overlay.querySelector('#t-pin-cancel-btn');
      const closeBtn = overlay.querySelector('#t-pin-close-btn');

      reasonEl.textContent = reasonText || 'Zum Speichern oder Bearbeiten in der gemeinsamen Google-Drive-CSV wird die Turnier-PIN benötigt (einmalig pro Gerät).';
      inputEl.value = '';
      submitBtn.disabled = false;
      submitBtn.textContent = 'Freischalten';

      if (initialErrorText) {
        errEl.textContent = initialErrorText;
        errEl.classList.remove('hidden');
      } else {
        errEl.classList.add('hidden');
        errEl.textContent = '';
      }

      function cleanup(result) {
        overlay.classList.add('hidden');
        submitBtn.removeEventListener('click', onSubmit);
        cancelBtn.removeEventListener('click', onCancel);
        closeBtn.removeEventListener('click', onCancel);
        inputEl.removeEventListener('keydown', onKeyDown);
        overlay.removeEventListener('click', onBackdrop);
        activePinPromise = null;
        resolve(result);
      }

      function onCancel() {
        cleanup(null);
      }

      function onBackdrop(e) {
        if (e.target === overlay) onCancel();
      }

      function onKeyDown(e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          onSubmit();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          onCancel();
        }
      }

      async function onSubmit() {
        const entered = String(inputEl.value || '').trim();
        if (!entered) {
          errEl.textContent = 'Bitte gib die Turnier-PIN ein.';
          errEl.classList.remove('hidden');
          inputEl.focus();
          return;
        }

        if (!isCloudConfigured()) {
          setStoredPin(entered);
          cleanup(entered);
          return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Prüfe PIN...';
        errEl.classList.add('hidden');

        try {
          const res = await callCloudPost({ action: 'verifyPin', pin: entered });
          if (res.ok) {
            setStoredPin(entered);
            saveCloudMeta({
              csvUrl: res.csvUrl || loadCloudMeta().csvUrl || '',
              csvDownloadUrl: res.csvDownloadUrl || loadCloudMeta().csvDownloadUrl || '',
              folderUrl: res.folderUrl || CLOUD_CONFIG.driveFolderUrl
            });
            cleanup(entered);
          } else {
            errEl.textContent = res.error || 'Falsche Turnier-PIN!';
            errEl.classList.remove('hidden');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Freischalten';
            inputEl.select();
            inputEl.focus();
          }
        } catch (err) {
          errEl.textContent = 'Keine Verbindung zu Google Drive beim Prüfen der PIN.';
          errEl.classList.remove('hidden');
          submitBtn.disabled = false;
          submitBtn.textContent = 'Freischalten';
        }
      }

      submitBtn.addEventListener('click', onSubmit);
      cancelBtn.addEventListener('click', onCancel);
      closeBtn.addEventListener('click', onCancel);
      inputEl.addEventListener('keydown', onKeyDown);
      overlay.addEventListener('click', onBackdrop);

      overlay.classList.remove('hidden');
      setTimeout(() => inputEl.focus(), 40);
    });

    return activePinPromise;
  }

  async function postWithPinRetry(buildPayload, reasonText) {
    let pin = getStoredPin();
    if (!pin) {
      pin = await requestPin(reasonText);
      if (!pin) {
        return { ok: false, cancelled: true, error: 'Aktion abgebrochen (keine Turnier-PIN eingegeben).' };
      }
    }

    let res = await callCloudPost(buildPayload(pin));
    if (!res.ok && res.code === 'INVALID_PIN') {
      clearStoredPin();
      const retryPin = await requestPin(
        reasonText,
        'Die gespeicherte Turnier-PIN ist ungültig. Bitte aktuelle PIN eingeben:'
      );
      if (!retryPin) {
        return { ok: false, cancelled: true, error: 'Aktion abgebrochen (ungültige PIN).' };
      }
      res = await callCloudPost(buildPayload(retryPin));
    }
    return res;
  }

  // --- Cloud Sync (Lesen & Queue abarbeiten) ---
  async function syncFromCloud(options) {
    const opts = options || {};
    if (!isCloudConfigured()) {
      emitSyncStatus();
      return { ok: false, notConfigured: true };
    }

    if (inFlightSyncPromise) return inFlightSyncPromise;
    if (!opts.force && Date.now() - lastSyncAttemptMs < 3500) {
      return { ok: true, skipped: true };
    }

    lastSyncAttemptMs = Date.now();
    isSyncing = true;
    emitSyncStatus();

    inFlightSyncPromise = (async () => {
      try {
        if (opts.flushPending !== false && getPendingUploadsCount() > 0 && getStoredPin()) {
          await flushPendingUploads({ interactive: false, skipTrailingSync: true });
        }

        const data = await callCloudGet();
        if (!data.ok) {
          saveCloudMeta({ lastSyncError: data.error || 'Sync fehlgeschlagen.' });
          return data;
        }

        const imported = importCSV(data.csvContent || '', { allowEmpty: true });
        saveCloudMeta({
          csvUrl: data.csvUrl || '',
          csvDownloadUrl: data.csvDownloadUrl || '',
          folderUrl: data.folderUrl || CLOUD_CONFIG.driveFolderUrl,
          lastSyncAt: new Date().toISOString(),
          lastSyncError: ''
        });
        return Object.assign({ ok: true, csvUrl: data.csvUrl }, imported);
      } catch (err) {
        const msg = err && err.message ? err.message : 'Verbindungsfehler';
        saveCloudMeta({ lastSyncError: 'Offline / Sync fehlgeschlagen (' + msg + ')' });
        return { ok: false, networkError: true, error: msg };
      } finally {
        isSyncing = false;
        inFlightSyncPromise = null;
        emitSyncStatus();
      }
    })();

    return inFlightSyncPromise;
  }

  async function flushPendingUploads(options) {
    const opts = options || {};
    const queue = getPendingUploads();
    if (queue.length === 0) return { ok: true, sent: 0, remaining: 0 };
    if (!isCloudConfigured()) return { ok: false, notConfigured: true, sent: 0, remaining: queue.length };

    let pin = getStoredPin();
    if (!pin) {
      if (!opts.interactive) {
        return { ok: false, needsPin: true, sent: 0, remaining: queue.length };
      }
      pin = await requestPin('Für das Nachsenden der zwischengespeicherten Ergebnisse wird die Turnier-PIN benötigt.');
      if (!pin) {
        return { ok: false, cancelled: true, sent: 0, remaining: queue.length };
      }
    }

    let sent = 0;
    for (let i = 0; i < queue.length; i++) {
      const item = queue[i];
      try {
        const res = await callCloudPost(Object.assign({}, item, { action: 'recordMatch', pin }));
        if (res.ok) {
          removePendingUpload(item.clientMatchId);
          sent++;
        } else if (res.code === 'INVALID_PIN' && opts.interactive) {
          clearStoredPin();
          pin = await requestPin('Bitte aktuelle Turnier-PIN zum Nachsenden eingeben:', 'Gespeicherte PIN ungültig.');
          if (!pin) break;
          const retryRes = await callCloudPost(Object.assign({}, item, { action: 'recordMatch', pin }));
          if (retryRes.ok) {
            removePendingUpload(item.clientMatchId);
            sent++;
          } else {
            break;
          }
        } else {
          break;
        }
      } catch (err) {
        break;
      }
    }

    if (sent > 0 && !opts.skipTrailingSync) {
      await syncFromCloud({ force: true, flushPending: false });
    }

    return { ok: getPendingUploadsCount() === 0, sent, remaining: getPendingUploadsCount() };
  }

  // --- CRUD-Operationen (Cloud-First, mit lokalem Fallback ohne Cloud-URL) ---
  async function addPlayer(name, avatar) {
    const cleanName = String(name || '').trim();
    if (!cleanName) {
      return { ok: false, error: 'Bitte einen gültigen Spielernamen eingeben.' };
    }

    const db = loadDB();
    const exists = db.players.some(p => p.name.toLowerCase() === cleanName.toLowerCase());
    if (exists) {
      return { ok: false, error: `Spieler "${cleanName}" existiert bereits.` };
    }

    const chosenAvatar = (avatar && String(avatar).trim()) ? String(avatar).trim() : pickNextAvatar(db.players);

    if (!isCloudConfigured()) {
      const newPlayer = {
        id: 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        name: cleanName,
        avatar: chosenAvatar
      };
      db.players.push(newPlayer);
      saveDB(db);
      return { ok: true, player: newPlayer, localOnly: true };
    }

    try {
      const res = await postWithPinRetry(
        (pin) => ({ action: 'addPlayer', pin, name: cleanName, avatar: chosenAvatar }),
        'Zum Anlegen eines Spielers in der gemeinsamen Drive-CSV ist die Turnier-PIN erforderlich.'
      );
      if (!res.ok) return res;
      return { ok: true, player: res.player || { name: cleanName, avatar: chosenAvatar } };
    } catch (err) {
      return { ok: false, error: 'Netzwerkfehler beim Anlegen auf Google Drive. Bitte Verbindung prüfen.' };
    }
  }

  async function removePlayer(nameOrId) {
    const db = loadDB();
    const target = String(nameOrId || '').trim().toLowerCase();
    const found = db.players.find(p => p.id.toLowerCase() === target || p.name.toLowerCase() === target);
    const targetName = found ? found.name : String(nameOrId || '').trim();

    if (!isCloudConfigured()) {
      const before = db.players.length;
      db.players = db.players.filter(p => p.id.toLowerCase() !== target && p.name.toLowerCase() !== target);
      if (db.players.length !== before) {
        saveDB(db);
        return { ok: true, removed: true };
      }
      return { ok: false, error: 'Spieler nicht gefunden.' };
    }

    try {
      const res = await postWithPinRetry(
        (pin) => ({ action: 'removePlayer', pin, name: targetName }),
        'Zum Entfernen eines Spielers wird die Turnier-PIN benötigt.'
      );
      return res;
    } catch (err) {
      return { ok: false, error: 'Netzwerkfehler beim Entfernen auf Google Drive.' };
    }
  }

  async function recordMatch({ game, players, lowerIsBetter, notes = '', date = '', time = '', clientMatchId = '' }) {
    const cleanGame = String(game || '').trim();
    if (!cleanGame) return { ok: false, error: 'Kein Spielname angegeben.' };
    if (!Array.isArray(players) || players.length === 0) {
      return { ok: false, error: 'Keine Spieler-Ergebnisse übergeben.' };
    }

    const db = loadDB();
    const gameMeta = GAMES[cleanGame];
    const isLower = typeof lowerIsBetter === 'boolean' ? lowerIsBetter : (gameMeta ? gameMeta.lowerIsBetter : false);

    const enrichedPlayers = players.map(entry => {
      const cleanName = String((entry && entry.name) || '').trim();
      const existing = db.players.find(p => p.name.toLowerCase() === cleanName.toLowerCase());
      return Object.assign({}, entry, {
        name: cleanName,
        avatar: (entry && entry.avatar) || (existing ? existing.avatar : '')
      });
    });

    const rankedResults = computeRanks(enrichedPlayers, isLower);
    if (rankedResults.length === 0) {
      return { ok: false, error: 'Keine gültigen Spieler gefunden.' };
    }

    const now = getNowDateTime();
    const matchDate = date || now.date;
    const matchTime = time || now.time;
    const cleanNotes = String(notes || '').trim();

    if (!isCloudConfigured()) {
      ensurePlayersRegistered(db, rankedResults);
      const match = {
        id: db.nextMatchId++,
        date: matchDate,
        time: matchTime,
        game: cleanGame,
        notes: cleanNotes,
        results: rankedResults
      };
      db.matches.push(match);
      saveDB(db);
      return { ok: true, matchId: match.id, match, localOnly: true };
    }

    const txId = clientMatchId || generateClientMatchId();
    const cloudPayloadBase = {
      clientMatchId: txId,
      game: cleanGame,
      date: matchDate,
      time: matchTime,
      notes: cleanNotes,
      lowerIsBetter: isLower,
      players: rankedResults.map(r => ({
        name: r.name,
        avatar: r.avatar || '',
        score: r.score,
        rank: r.rank
      }))
    };

    try {
      const res = await postWithPinRetry(
        (pin) => Object.assign({}, cloudPayloadBase, { action: 'recordMatch', pin }),
        'Zum Hochladen des Spielergebnisses in die Google-Drive-CSV wird die Turnier-PIN benötigt.'
      );

      if (!res.ok) {
        if (res.cancelled) return res;
        if (res.code === 'LOCK_TIMEOUT') {
          enqueuePendingUpload(Object.assign({}, cloudPayloadBase, { queuedAt: new Date().toISOString() }));
          return { ok: false, queued: true, clientMatchId: txId, error: res.error };
        }
        return res;
      }

      removePendingUpload(txId);
      const updatedDb = loadDB();
      const savedMatch = updatedDb.matches.find(m => m.id === res.matchId) || res.match || {
        id: res.matchId,
        date: matchDate,
        time: matchTime,
        game: cleanGame,
        notes: cleanNotes,
        results: rankedResults
      };

      return {
        ok: true,
        matchId: res.matchId,
        match: savedMatch,
        duplicate: !!res.duplicate
      };
    } catch (err) {
      enqueuePendingUpload(Object.assign({}, cloudPayloadBase, { queuedAt: new Date().toISOString() }));
      return {
        ok: false,
        queued: true,
        clientMatchId: txId,
        error: 'Keine Verbindung zu Google Drive – Ergebnis lokal zwischengespeichert.'
      };
    }
  }

  async function deleteMatch(matchId) {
    if (!isCloudConfigured()) {
      const db = loadDB();
      const before = db.matches.length;
      db.matches = db.matches.filter(m => m.id !== matchId);
      if (db.matches.length !== before) {
        saveDB(db);
        return { ok: true, deleted: true };
      }
      return { ok: false, error: 'Partie nicht gefunden.' };
    }

    try {
      return await postWithPinRetry(
        (pin) => ({ action: 'deleteMatch', pin, matchId }),
        'Zum Löschen der Partie aus der Google-Drive-CSV wird die Turnier-PIN benötigt.'
      );
    } catch (err) {
      return { ok: false, error: 'Netzwerkfehler beim Löschen der Partie.' };
    }
  }

  async function hardReset(adminPassword) {
    if (!isCloudConfigured()) {
      try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
      savePendingUploads([]);
      try {
        global.dispatchEvent(new CustomEvent('tournament-updated', { detail: createEmptyDB() }));
      } catch (e) {}
      return { ok: true, localOnly: true };
    }

    try {
      const res = await callCloudPost({
        action: 'resetTournament',
        adminPassword: String(adminPassword || '')
      });
      if (res.ok) {
        savePendingUploads([]);
      }
      return res;
    } catch (err) {
      return { ok: false, error: 'Netzwerkfehler beim Zurücksetzen auf Google Drive.' };
    }
  }

  async function uploadCSVToCloud(csvText, adminPassword) {
    if (!isCloudConfigured()) {
      return importCSV(csvText);
    }
    try {
      return await callCloudPost({
        action: 'importCSV',
        adminPassword: String(adminPassword || ''),
        csvText: String(csvText || '')
      });
    } catch (err) {
      return { ok: false, error: 'Netzwerkfehler beim Hochladen der CSV auf Google Drive.' };
    }
  }

  // --- Auswertung & Rangliste ---
  function calculateStandings() {
    const db = loadDB();
    const playerMap = new Map();

    db.players.forEach(p => {
      playerMap.set(p.name.toLowerCase(), {
        name: p.name,
        avatar: p.avatar || '🎲',
        tournamentPoints: 0,
        gold: 0,
        silver: 0,
        bronze: 0,
        matchesPlayed: 0,
        lastPlaces: 0,
        gamesPlayed: {}
      });
    });

    const gameStats = {};

    db.matches.forEach(match => {
      const gameName = match.game;
      const gameMeta = GAMES[gameName] || { icon: '🎲', lowerIsBetter: false, kingTitle: `${gameName}-König` };
      if (!gameStats[gameName]) {
        gameStats[gameName] = {
          game: gameName,
          icon: gameMeta.icon,
          lowerIsBetter: gameMeta.lowerIsBetter,
          kingTitle: gameMeta.kingTitle,
          matchesCount: 0,
          players: {}
        };
      }
      gameStats[gameName].matchesCount += 1;

      const maxRankInMatch = Math.max(...match.results.map(r => r.rank));

      match.results.forEach(res => {
        const key = res.name.toLowerCase();
        if (!playerMap.has(key)) {
          playerMap.set(key, {
            name: res.name,
            avatar: res.avatar || '🎲',
            tournamentPoints: 0,
            gold: 0,
            silver: 0,
            bronze: 0,
            matchesPlayed: 0,
            lastPlaces: 0,
            gamesPlayed: {}
          });
        }
        const entry = playerMap.get(key);
        entry.tournamentPoints += (res.tournamentPoints || 0);
        entry.matchesPlayed += 1;
        if (res.rank === 1) entry.gold += 1;
        else if (res.rank === 2) entry.silver += 1;
        else if (res.rank === 3) entry.bronze += 1;

        if (match.results.length > 1 && res.rank === maxRankInMatch) {
          entry.lastPlaces += 1;
        }

        if (!entry.gamesPlayed[gameName]) {
          entry.gamesPlayed[gameName] = { played: 0, wins: 0, bestScore: res.score, totalTournamentPoints: 0 };
        }
        const gp = entry.gamesPlayed[gameName];
        gp.played += 1;
        if (res.rank === 1) gp.wins += 1;
        gp.totalTournamentPoints += (res.tournamentPoints || 0);
        gp.bestScore = gameMeta.lowerIsBetter ? Math.min(gp.bestScore, res.score) : Math.max(gp.bestScore, res.score);

        if (!gameStats[gameName].players[key]) {
          gameStats[gameName].players[key] = {
            name: entry.name,
            avatar: entry.avatar,
            wins: 0,
            played: 0,
            bestScore: res.score,
            totalPts: 0
          };
        }
        const gsp = gameStats[gameName].players[key];
        gsp.played += 1;
        if (res.rank === 1) gsp.wins += 1;
        gsp.totalPts += (res.tournamentPoints || 0);
        gsp.bestScore = gameMeta.lowerIsBetter ? Math.min(gsp.bestScore, res.score) : Math.max(gsp.bestScore, res.score);
      });
    });

    const standings = Array.from(playerMap.values()).map(p => ({
      ...p,
      winRate: p.matchesPlayed > 0 ? Math.round((p.gold / p.matchesPlayed) * 100) : 0
    }));

    standings.sort((a, b) => {
      if (b.tournamentPoints !== a.tournamentPoints) return b.tournamentPoints - a.tournamentPoints;
      if (b.gold !== a.gold) return b.gold - a.gold;
      if (b.silver !== a.silver) return b.silver - a.silver;
      if (b.bronze !== a.bronze) return b.bronze - a.bronze;
      if (b.winRate !== a.winRate) return b.winRate - a.winRate;
      return a.name.localeCompare(b.name, 'de');
    });

    for (let i = 0; i < standings.length; i++) {
      if (
        i > 0 &&
        standings[i].tournamentPoints === standings[i - 1].tournamentPoints &&
        standings[i].gold === standings[i - 1].gold &&
        standings[i].silver === standings[i - 1].silver &&
        standings[i].bronze === standings[i - 1].bronze
      ) {
        standings[i].rank = standings[i - 1].rank;
      } else {
        standings[i].rank = i + 1;
      }
    }

    const awards = [];
    const activePlayers = standings.filter(p => p.matchesPlayed > 0);

    if (activePlayers.length > 0) {
      const mostActive = [...activePlayers].sort((a, b) => b.matchesPlayed - a.matchesPlayed || b.tournamentPoints - a.tournamentPoints)[0];
      if (mostActive && mostActive.matchesPlayed > 0) {
        awards.push({
          icon: '🔥',
          title: 'Dauerbrenner',
          winner: mostActive.name,
          avatar: mostActive.avatar,
          detail: `${mostActive.matchesPlayed} ${mostActive.matchesPlayed === 1 ? 'Partie' : 'Partien'} gespielt`
        });
      }

      const eligibleWinRate = activePlayers.filter(p => p.matchesPlayed >= 2);
      if (eligibleWinRate.length > 0) {
        const bestRate = [...eligibleWinRate].sort((a, b) => b.winRate - a.winRate || b.gold - a.gold)[0];
        if (bestRate.winRate > 0) {
          awards.push({
            icon: '🎯',
            title: 'Präzisions-Ass',
            winner: bestRate.name,
            avatar: bestRate.avatar,
            detail: `${bestRate.winRate}% Siegquote (${bestRate.gold}/${bestRate.matchesPlayed})`
          });
        }
      }

      Object.values(gameStats).forEach(gs => {
        const candidates = Object.values(gs.players);
        if (candidates.length === 0) return;
        candidates.sort((a, b) => {
          if (b.wins !== a.wins) return b.wins - a.wins;
          if (b.totalPts !== a.totalPts) return b.totalPts - a.totalPts;
          return gs.lowerIsBetter ? (a.bestScore - b.bestScore) : (b.bestScore - a.bestScore);
        });
        const king = candidates[0];
        if (king && (king.wins > 0 || gs.matchesCount >= 1)) {
          awards.push({
            icon: gs.icon,
            title: gs.kingTitle,
            winner: king.name,
            avatar: king.avatar,
            detail: `${king.wins} ${king.wins === 1 ? 'Sieg' : 'Siege'} • Bestwert: ${king.bestScore} Pkt`
          });
        }
      });

      const unluckyCandidates = activePlayers.filter(p => p.lastPlaces > 0);
      if (unluckyCandidates.length > 0 && db.matches.length >= 2) {
        unluckyCandidates.sort((a, b) => b.lastPlaces - a.lastPlaces || a.gold - b.gold);
        const unlucky = unluckyCandidates[0];
        awards.push({
          icon: '🍀',
          title: 'Ehren-Pechvogel',
          winner: unlucky.name,
          avatar: unlucky.avatar,
          detail: `${unlucky.lastPlaces}x Letzter – nächstes Mal wird's!`
        });
      }
    }

    return {
      standings,
      totalMatches: db.matches.length,
      registeredPlayersCount: db.players.length,
      activePlayersCount: activePlayers.length,
      awards,
      matches: [...db.matches].reverse()
    };
  }

  // --- CSV EXPORT & IMPORT ---
  function csvCell(val) {
    const str = val === null || val === undefined ? '' : String(val);
    if (str.includes(';') || str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  function generateCSV() {
    const db = loadDB();
    const avatarByLower = new Map();
    db.players.forEach(p => avatarByLower.set(p.name.toLowerCase(), p.avatar || '🎲'));

    const header = ['MatchID', 'Datum', 'Uhrzeit', 'Spiel', 'Spieler', 'Avatar', 'Punkte', 'Platzierung', 'Turnierpunkte', 'Mitspielerzahl', 'Notiz'];
    const lines = [header.join(';')];
    const playersInMatches = new Set();

    db.matches.forEach(match => {
      match.results.forEach(res => {
        playersInMatches.add(res.name.toLowerCase());
        const avatar = res.avatar || avatarByLower.get(res.name.toLowerCase()) || '🎲';
        const row = [
          match.id,
          match.date,
          match.time,
          match.game,
          res.name,
          avatar,
          res.score,
          res.rank,
          res.tournamentPoints,
          res.playerCount || match.results.length,
          match.notes || ''
        ];
        lines.push(row.map(csvCell).join(';'));
      });
    });

    const nowDt = getNowDateTime();
    db.players.forEach(p => {
      if (!playersInMatches.has(p.name.toLowerCase())) {
        const row = [0, nowDt.date, nowDt.time, PLACEHOLDER_GAME, p.name, p.avatar || '🎲', '', '', '', '', ''];
        lines.push(row.map(csvCell).join(';'));
      }
    });

    const today = nowDt.date;
    return {
      filename: `urlaub_turnier_${today}.csv`,
      content: '\uFEFF' + lines.join('\r\n') + '\r\n'
    };
  }

  function downloadCSV() {
    const { filename, content } = generateCSV();
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 150);
    return filename;
  }

  function parseCSVText(text, delimiter) {
    const rows = [];
    let currentRow = [];
    let currentVal = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      const next = text[i + 1];

      if (inQuotes) {
        if (ch === '"' && next === '"') {
          currentVal += '"';
          i++;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          currentVal += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === delimiter) {
          currentRow.push(currentVal);
          currentVal = '';
        } else if (ch === '\r' && next === '\n') {
          currentRow.push(currentVal);
          rows.push(currentRow);
          currentRow = [];
          currentVal = '';
          i++;
        } else if (ch === '\n' || ch === '\r') {
          currentRow.push(currentVal);
          rows.push(currentRow);
          currentRow = [];
          currentVal = '';
        } else {
          currentVal += ch;
        }
      }
    }
    if (currentVal.length > 0 || currentRow.length > 0) {
      currentRow.push(currentVal);
      rows.push(currentRow);
    }
    return rows.filter(r => r.some(cell => cell.trim() !== ''));
  }

  function importCSV(csvText, options) {
    const opts = options || {};
    if (!csvText || typeof csvText !== 'string') {
      if (opts.allowEmpty) {
        saveDB(createEmptyDB());
        return { ok: true, matchesImported: 0, playersImported: 0 };
      }
      return { ok: false, error: 'Die CSV-Datei ist leer.' };
    }
    const cleanText = csvText.replace(/^\uFEFF/, '');
    const firstLine = cleanText.split(/\r?\n/)[0] || '';
    const delimiter = (firstLine.split(';').length >= firstLine.split(',').length) ? ';' : ',';

    const rows = parseCSVText(cleanText, delimiter);
    if (rows.length === 0) {
      if (opts.allowEmpty) {
        saveDB(createEmptyDB());
        return { ok: true, matchesImported: 0, playersImported: 0 };
      }
      return { ok: false, error: 'Die CSV-Datei ist leer.' };
    }

    const headers = rows[0].map(h => h.trim().toLowerCase());
    const idxMatchId = headers.indexOf('matchid');
    const idxDate = headers.indexOf('datum');
    const idxTime = headers.indexOf('uhrzeit');
    const idxGame = headers.indexOf('spiel');
    const idxPlayer = headers.indexOf('spieler');
    const idxAvatar = headers.indexOf('avatar');
    const idxScore = headers.indexOf('punkte');
    const idxRank = headers.indexOf('platzierung');
    const idxPts = headers.indexOf('turnierpunkte');
    const idxCount = headers.indexOf('mitspielerzahl');
    const idxNote = headers.indexOf('notiz');

    if (idxGame === -1 || idxPlayer === -1) {
      return { ok: false, error: 'Ungültiges CSV-Format: Spalten "Spiel" und "Spieler" fehlen.' };
    }

    if (rows.length < 2) {
      if (opts.allowEmpty) {
        saveDB(createEmptyDB());
        return { ok: true, matchesImported: 0, playersImported: 0 };
      }
      return { ok: false, error: 'Die CSV-Datei enthält keine Spielergebnisse.' };
    }

    const matchGroups = new Map();
    const playerEntriesMap = new Map(); // lower -> { name, avatar }
    let maxId = 0;

    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      const game = (row[idxGame] || '').trim();
      const player = (row[idxPlayer] || '').trim();
      if (!game || !player) continue;

      const avatar = idxAvatar !== -1 ? (row[idxAvatar] || '').trim() : '';
      const keyLower = player.toLowerCase();
      if (!playerEntriesMap.has(keyLower)) {
        playerEntriesMap.set(keyLower, { name: player, avatar });
      } else if (avatar && !playerEntriesMap.get(keyLower).avatar) {
        playerEntriesMap.get(keyLower).avatar = avatar;
      }

      if (game === PLACEHOLDER_GAME) {
        continue;
      }

      const rawId = idxMatchId !== -1 ? parseInt(row[idxMatchId], 10) : NaN;
      const date = idxDate !== -1 ? (row[idxDate] || '').trim() : getNowDateTime().date;
      const time = idxTime !== -1 ? (row[idxTime] || '').trim() : '00:00';
      const note = idxNote !== -1 ? (row[idxNote] || '').trim() : '';

      const groupKey = (!isNaN(rawId) && rawId > 0) ? `id_${rawId}` : `dt_${date}_${time}_${game}`;
      if (!isNaN(rawId) && rawId > maxId) maxId = rawId;

      if (!matchGroups.has(groupKey)) {
        matchGroups.set(groupKey, {
          id: (!isNaN(rawId) && rawId > 0) ? rawId : null,
          date,
          time,
          game,
          notes: note,
          results: []
        });
      }

      const score = idxScore !== -1 && row[idxScore] !== '' ? Number(row[idxScore]) : 0;
      const rank = idxRank !== -1 && row[idxRank] !== '' ? parseInt(row[idxRank], 10) : null;
      const tPts = idxPts !== -1 && row[idxPts] !== '' ? parseInt(row[idxPts], 10) : null;
      const pCount = idxCount !== -1 && row[idxCount] !== '' ? parseInt(row[idxCount], 10) : null;

      matchGroups.get(groupKey).results.push({
        name: player,
        avatar,
        score: isNaN(score) ? 0 : score,
        rank,
        tournamentPoints: tPts,
        playerCount: pCount
      });
    }

    if (matchGroups.size === 0 && playerEntriesMap.size === 0) {
      if (opts.allowEmpty) {
        saveDB(createEmptyDB());
        return { ok: true, matchesImported: 0, playersImported: 0 };
      }
      return { ok: false, error: 'Keine gültigen Partien in der CSV gefunden.' };
    }

    const db = createEmptyDB();
    let autoId = 1;

    matchGroups.forEach(m => {
      if (m.id === null) {
        while (autoId <= maxId) autoId++;
        m.id = autoId++;
      }
      const totalPlayers = m.results.length;
      const gameMeta = GAMES[m.game];
      const lowerIsBetter = gameMeta ? gameMeta.lowerIsBetter : false;

      const needsRankCalc = m.results.some(res => res.rank === null || isNaN(res.rank));
      if (needsRankCalc) {
        m.results = computeRanks(m.results, lowerIsBetter);
      } else {
        m.results.forEach(res => {
          res.playerCount = res.playerCount || totalPlayers;
          if (res.tournamentPoints === null || isNaN(res.tournamentPoints)) {
            res.tournamentPoints = Math.max(1, res.playerCount - res.rank + 1);
          }
        });
        m.results.sort((a, b) => a.rank - b.rank);
      }
      db.matches.push(m);
    });

    db.matches.sort((a, b) => a.id - b.id);
    db.nextMatchId = Math.max(maxId + 1, autoId, db.matches.length + 1);
    ensurePlayersRegistered(db, Array.from(playerEntriesMap.values()));
    saveDB(db);

    return {
      ok: true,
      matchesImported: db.matches.length,
      playersImported: db.players.length
    };
  }

  function buildShareText() {
    const data = calculateStandings();
    const { date } = getNowDateTime();
    const lines = [
      `🏆 URLAUBS-TURNIER SIEGEREHRUNG 🏆`,
      `📅 Stand: ${date.split('-').reverse().join('.')} (${data.totalMatches} ${data.totalMatches === 1 ? 'Partie' : 'Partien'})`,
      ``
    ];

    const medals = { 1: '🥇', 2: '🥈', 3: '🥉' };
    data.standings.filter(p => p.matchesPlayed > 0).forEach(p => {
      const prefix = medals[p.rank] || `${p.rank}.`;
      lines.push(`${prefix} ${p.name} – ${p.tournamentPoints} Pkt (${p.gold}x 🥇, ${p.silver}x 🥈, ${p.bronze}x 🥉)`);
    });

    if (data.awards.length > 0) {
      lines.push(``);
      lines.push(`🏅 Sonderpreise:`);
      data.awards.slice(0, 6).forEach(a => {
        lines.push(`• ${a.title}: ${a.winner} (${a.detail})`);
      });
    }
    return lines.join('\n');
  }

  // --- GEMEINSAME SPIEL-INTEGRATION (Chips & Save-Button) ---
  function isTournamentModeEnabled() {
    if (typeof global.isTournamentMode === 'function') {
      return global.isTournamentMode();
    }
    try {
      return localStorage.getItem('spiele_tournament_mode') === 'on';
    } catch (e) {
      return false;
    }
  }

  const mountedChipRegistrations = new Map();
  const mountedSaveCallbacks = new Set();

  function renderPlayerChips(container, options) {
    const el = typeof container === 'string' ? document.getElementById(container) : container;
    if (!el) return;

    mountedChipRegistrations.set(el, options);

    if (!isTournamentModeEnabled()) {
      el.innerHTML = '';
      el.classList.add('hidden');
      return;
    }

    el.classList.remove('hidden');

    const players = getPlayers();
    const titleText = (options && options.title) || '👥 Turnier-Spieler schnell hinzufügen:';

    if (players.length === 0) {
      el.innerHTML = `
        <div class="t-chips-box t-chips-empty">
          <span>💡 Tipp: Lege im <a href="../index.html" style="color: var(--md-sys-color-primary); font-weight: 600;">Dashboard</a> Spieler an, um sie hier mit 1 Klick auszuwählen.</span>
        </div>
      `;
      return;
    }

    const chipsHtml = players.map(p => {
      const active = options && typeof options.isSelected === 'function' ? options.isSelected(p.name) : false;
      return `
        <button type="button" class="t-player-chip ${active ? 'is-selected' : ''}" data-player-name="${escapeHtml(p.name)}">
          <span class="t-chip-avatar">${escapeHtml(p.avatar || '🎲')}</span>
          <span class="t-chip-name">${escapeHtml(p.name)}</span>
          <span class="t-chip-check">${active ? '✓' : '+'}</span>
        </button>
      `;
    }).join('');

    el.innerHTML = `
      <div class="t-chips-box">
        <div class="t-chips-label">${escapeHtml(titleText)}</div>
        <div class="t-chips-grid">${chipsHtml}</div>
      </div>
    `;

    el.querySelectorAll('.t-player-chip').forEach(btn => {
      btn.addEventListener('click', function() {
        const name = this.getAttribute('data-player-name');
        if (options && typeof options.onToggle === 'function') {
          options.onToggle(name);
          renderPlayerChips(el, options);
        }
      });
    });
  }

  function mountSaveButton(container, config) {
    const el = typeof container === 'string' ? document.getElementById(container) : container;
    if (!el) return null;

    let isSaved = false;
    let isSaving = false;
    let pendingFrozenPayload = null;

    el.innerHTML = `
      <button type="button" class="btn-tournament-save" id="t-save-btn-${escapeHtml(config.gameName).replace(/\W+/g, '')}">
        🏆 In Urlaubs-Wertung speichern
      </button>
      <div class="t-save-status" style="display:none;"></div>
    `;

    const btn = el.querySelector('.btn-tournament-save');
    const status = el.querySelector('.t-save-status');

    function syncVisibility() {
      if (isTournamentModeEnabled()) {
        el.classList.remove('hidden');
      } else {
        el.classList.add('hidden');
      }
    }

    mountedSaveCallbacks.add(syncVisibility);
    syncVisibility();

    function resetState() {
      isSaved = false;
      isSaving = false;
      pendingFrozenPayload = null;
      if (btn) {
        btn.disabled = false;
        btn.classList.remove('is-saved', 'is-pending');
        btn.innerHTML = '🏆 In Urlaubs-Wertung speichern';
      }
      if (status) {
        status.style.display = 'none';
        status.classList.remove('is-error');
        status.textContent = '';
      }
      syncVisibility();
    }

    btn.addEventListener('click', async function() {
      if (!isTournamentModeEnabled() || isSaved || isSaving) return;

      let payload = pendingFrozenPayload;
      if (!payload) {
        const entries = typeof config.getEntries === 'function' ? config.getEntries() : [];
        if (!entries || entries.length === 0) {
          alert('Keine Spieler-Ergebnisse zum Speichern vorhanden.');
          return;
        }
        payload = {
          game: config.gameName,
          players: entries,
          lowerIsBetter: config.lowerIsBetter,
          clientMatchId: generateClientMatchId()
        };
      }

      isSaving = true;
      btn.disabled = true;
      btn.classList.remove('is-pending');
      btn.innerHTML = isCloudConfigured() ? '⏳ Wird auf Google Drive gespeichert...' : '⏳ Wird gespeichert...';
      if (status) {
        status.style.display = 'none';
        status.classList.remove('is-error');
      }

      const res = await recordMatch(payload);
      isSaving = false;

      if (res.ok) {
        pendingFrozenPayload = null;
        isSaved = true;
        btn.disabled = true;
        btn.classList.remove('is-pending');
        btn.classList.add('is-saved');
        btn.innerHTML = isCloudConfigured()
          ? '✅ In Google-Drive-CSV gespeichert!'
          : '✅ Im Urlaubs-Turnier gespeichert!';
        const top = res.match && res.match.results && res.match.results[0];
        if (status && top) {
          status.style.display = 'block';
          status.classList.remove('is-error');
          status.textContent = `Match #${res.matchId || res.match.id} verbucht (${top.name} holt ${top.tournamentPoints} Turnierpunkte)`;
        }
      } else if (res.cancelled) {
        pendingFrozenPayload = null;
        btn.disabled = false;
        btn.innerHTML = '🏆 In Urlaubs-Wertung speichern';
      } else if (res.queued) {
        pendingFrozenPayload = payload;
        btn.disabled = false;
        btn.classList.add('is-pending');
        btn.innerHTML = '⚠️ Upload fehlgeschlagen – Erneut senden';
        if (status) {
          status.style.display = 'block';
          status.classList.add('is-error');
          status.textContent = 'Netzwerkfehler: Ergebnis ist lokal vorgemerkt. Bei Empfang erneut tippen.';
        }
      } else {
        btn.disabled = false;
        btn.innerHTML = '🏆 In Urlaubs-Wertung speichern';
        alert(res.error || 'Fehler beim Speichern.');
      }
    });

    return { reset: resetState };
  }

  // --- Polling & Reaktive Sync-Events ---
  function startAutoSync() {
    if (!isCloudConfigured()) return;
    if (pollTimerId) return;
    pollTimerId = setInterval(() => {
      if (document.visibilityState === 'visible' && isTournamentModeEnabled()) {
        syncFromCloud({ silent: true });
      }
    }, CLOUD_CONFIG.pollIntervalMs || 25000);
  }

  function stopAutoSync() {
    if (pollTimerId) {
      clearInterval(pollTimerId);
      pollTimerId = null;
    }
  }

  global.addEventListener('tournament-mode-changed', function(e) {
    mountedChipRegistrations.forEach((options, el) => {
      renderPlayerChips(el, options);
    });
    mountedSaveCallbacks.forEach(fn => fn());
    if (e && e.detail && e.detail.enabled && isCloudConfigured()) {
      syncFromCloud({ force: true });
    }
  });

  global.addEventListener('tournament-updated', function() {
    mountedChipRegistrations.forEach((options, el) => {
      renderPlayerChips(el, options);
    });
  });

  function initAutoCloudSync() {
    if (isTournamentModeEnabled() && isCloudConfigured()) {
      syncFromCloud({ force: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAutoCloudSync);
  } else {
    initAutoCloudSync();
  }

  global.addEventListener('pageshow', function() {
    if (isTournamentModeEnabled() && isCloudConfigured()) {
      syncFromCloud();
    }
  });

  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'visible' && isTournamentModeEnabled() && isCloudConfigured()) {
      syncFromCloud();
    }
  });

  global.addEventListener('online', function() {
    if (isTournamentModeEnabled() && isCloudConfigured()) {
      flushPendingUploads({ interactive: false }).then(() => syncFromCloud({ force: true }));
    }
  });

  global.Tournament = {
    CLOUD_CONFIG,
    AVATARS,
    GAMES,
    escapeHtml,
    isTournamentMode: isTournamentModeEnabled,
    isCloudConfigured,
    getCloudStatus,
    syncFromCloud,
    flushPendingUploads,
    getPendingUploadsCount,
    getStoredPin,
    setStoredPin,
    clearStoredPin,
    requestPin,
    startAutoSync,
    stopAutoSync,
    loadDB,
    getPlayers,
    addPlayer,
    removePlayer,
    computeRanks,
    recordMatch,
    deleteMatch,
    calculateStandings,
    generateCSV,
    downloadCSV,
    importCSV,
    uploadCSVToCloud,
    hardReset,
    buildShareText,
    renderPlayerChips,
    mountSaveButton
  };
})(window);
