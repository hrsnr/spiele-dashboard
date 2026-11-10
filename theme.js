/* ==========================================================================
   Theme, M3 Signature Color Scheme & Tournament Mode Sync (theme.js)
   Synchronisiert Light/Dark Mode, 5 M3 Signature-Farben & Turniermodus
   ========================================================================== */
(function(global) {
  'use strict';

  const ACCENTS = ['blue', 'sage', 'indigo', 'terracotta', 'plum'];
  const DEFAULT_ACCENT = 'blue';
  const TOURNAMENT_STORAGE_KEY = 'spiele_tournament_mode';
  const DEFAULT_TMODE = 'off';

  function normalizeTMode(val) {
    if (val === true || val === 'on' || val === '1' || val === 'true') return 'on';
    return 'off';
  }

  function parseHashParams() {
    const hash = location.hash || '';
    const themeMatch = hash.match(/theme=(dark|light)/);
    const accentMatch = hash.match(/accent=(blue|sage|indigo|terracotta|plum)/);
    const tmodeMatch = hash.match(/tmode=(on|off)/);
    return {
      theme: themeMatch ? themeMatch[1] : null,
      accent: accentMatch ? accentMatch[1] : null,
      tmode: tmodeMatch ? tmodeMatch[1] : null
    };
  }

  function parseWindowName() {
    const raw = window.name || '';
    const themeMatch = raw.match(/spiele_theme:(dark|light)/);
    const accentMatch = raw.match(/spiele_accent:(blue|sage|indigo|terracotta|plum)/);
    const tmodeMatch = raw.match(/spiele_tmode:(on|off)/);
    return {
      theme: themeMatch ? themeMatch[1] : null,
      accent: accentMatch ? accentMatch[1] : null,
      tmode: tmodeMatch ? tmodeMatch[1] : null
    };
  }

  function buildHash(theme, accent, tmode) {
    return '#theme=' + theme + '&accent=' + accent + '&tmode=' + tmode;
  }

  function updateLinks(theme, accent, tmode) {
    const hashStr = buildHash(theme, accent, tmode);
    document.querySelectorAll('a[href]').forEach(function(link) {
      const raw = link.getAttribute('href');
      if (!raw || raw.startsWith('#') || raw.startsWith('javascript:')) return;
      link.setAttribute('href', raw.split('#')[0] + hashStr);
    });
  }

  function applyState(theme, accent, tmode) {
    const safeTheme = (theme === 'dark' || theme === 'light') ? theme : 'light';
    const safeAccent = ACCENTS.indexOf(accent) !== -1 ? accent : DEFAULT_ACCENT;
    const prevTMode = document.documentElement.getAttribute('data-tournament-mode');
    const safeTMode = tmode !== undefined && tmode !== null ? normalizeTMode(tmode) : getInitialTMode();

    document.documentElement.setAttribute('data-theme', safeTheme);
    document.documentElement.setAttribute('data-accent', safeAccent);
    document.documentElement.setAttribute('data-tournament-mode', safeTMode);

    try { localStorage.setItem('spiele_theme', safeTheme); } catch (e) {}
    try { localStorage.setItem('spiele_accent', safeAccent); } catch (e) {}
    try { localStorage.setItem(TOURNAMENT_STORAGE_KEY, safeTMode); } catch (e) {}
    try { window.name = 'spiele_theme:' + safeTheme + ';spiele_accent:' + safeAccent + ';spiele_tmode:' + safeTMode; } catch (e) {}
    try {
      history.replaceState(null, '', location.pathname + location.search + buildHash(safeTheme, safeAccent, safeTMode));
    } catch (e) {}

    updateLinks(safeTheme, safeAccent, safeTMode);

    try {
      global.dispatchEvent(new CustomEvent('theme-changed', {
        detail: { theme: safeTheme, accent: safeAccent, tmode: safeTMode }
      }));
    } catch (e) {}

    if (prevTMode !== safeTMode) {
      try {
        global.dispatchEvent(new CustomEvent('tournament-mode-changed', {
          detail: { enabled: safeTMode === 'on', mode: safeTMode }
        }));
      } catch (e) {}
    }
  }

  function getInitialTheme() {
    const hp = parseHashParams();
    if (hp.theme) return hp.theme;
    const wn = parseWindowName();
    if (wn.theme) return wn.theme;
    try {
      const saved = localStorage.getItem('spiele_theme');
      if (saved === 'dark' || saved === 'light') return saved;
    } catch (e) {}
    return (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  }

  function getInitialAccent() {
    const hp = parseHashParams();
    if (hp.accent) return hp.accent;
    const wn = parseWindowName();
    if (wn.accent) return wn.accent;
    try {
      const saved = localStorage.getItem('spiele_accent');
      if (saved && ACCENTS.indexOf(saved) !== -1) return saved;
    } catch (e) {}
    return DEFAULT_ACCENT;
  }

  function getInitialTMode() {
    const hp = parseHashParams();
    if (hp.tmode) return hp.tmode;
    const wn = parseWindowName();
    if (wn.tmode) return wn.tmode;
    try {
      const saved = localStorage.getItem(TOURNAMENT_STORAGE_KEY);
      if (saved === 'on' || saved === 'off') return saved;
    } catch (e) {}
    return DEFAULT_TMODE;
  }

  applyState(getInitialTheme(), getInitialAccent(), getInitialTMode());

  function mountStaticGameBackground() {
    if (!document.body || document.querySelector('.m3-bg-geometry')) return;
    const wrap = document.createElement('div');
    wrap.className = 'm3-bg-geometry m3-bg-geometry--static';
    wrap.setAttribute('aria-hidden', 'true');
    wrap.innerHTML =
      '<svg width="0" height="0" style="position:absolute; overflow:hidden;" aria-hidden="true">' +
        '<defs>' +
          '<path id="m3-static-clover" d="M82.9,82.9 C79.5,86.3 70.0,85.7 64.5,85.1 C59.1,84.5 54.8,79.5 50.0,79.5 C45.2,79.5 40.9,84.5 35.5,85.1 C30.0,85.7 20.5,86.3 17.1,82.9 C13.7,79.5 14.3,70.0 14.9,64.5 C15.5,59.1 20.5,54.8 20.5,50.0 C20.5,45.2 15.5,40.9 14.9,35.5 C14.3,30.0 13.7,20.5 17.1,17.1 C20.5,13.7 30.0,14.3 35.5,14.9 C40.9,15.5 45.2,20.5 50.0,20.5 C54.8,20.5 59.1,15.5 64.5,14.9 C70.0,14.3 79.5,13.7 82.9,17.1 C86.3,20.5 85.7,30.0 85.1,35.5 C84.5,40.9 79.5,45.2 79.5,50.0 C79.5,54.8 84.5,59.1 85.1,64.5 C85.7,70.0 86.3,79.5 82.9,82.9Z" />' +
          '<path id="m3-static-hexagon" d="M 40.91 11.25 Q 50.00 6.00 59.09 11.25 L 79.01 22.75 Q 88.11 28.00 88.11 38.50 L 88.11 61.50 Q 88.11 72.00 79.01 77.25 L 59.09 88.75 Q 50.00 94.00 40.91 88.75 L 20.99 77.25 Q 11.89 72.00 11.89 61.50 L 11.89 38.50 Q 11.89 28.00 20.99 22.75 Z" />' +
          '<path id="m3-static-cookie" d="M50.0,3.3 C53.0,3.3 56.1,10.2 59.0,12.1 C61.9,14.1 64.0,14.9 67.5,15.2 C71.0,15.6 77.7,12.3 80.0,14.2 C82.3,16.1 80.3,23.4 81.2,26.8 C82.2,30.2 83.3,32.1 85.7,34.6 C88.2,37.1 95.5,38.9 96.0,41.9 C96.5,44.8 90.3,49.1 88.8,52.3 C87.4,55.5 87.0,57.6 87.3,61.2 C87.5,64.7 91.9,70.8 90.4,73.3 C88.9,75.9 81.5,75.2 78.3,76.7 C75.1,78.2 73.4,79.6 71.4,82.5 C69.3,85.4 68.8,92.9 66.0,93.9 C63.2,94.9 57.9,89.5 54.5,88.6 C51.1,87.8 48.9,87.8 45.5,88.6 C42.1,89.5 36.8,94.9 34.0,93.9 C31.2,92.9 30.7,85.4 28.6,82.5 C26.6,79.6 24.9,78.2 21.7,76.7 C18.5,75.2 11.1,75.9 9.6,73.4 C8.1,70.8 12.5,64.7 12.7,61.2 C13.0,57.6 12.6,55.5 11.2,52.3 C9.7,49.1 3.5,44.8 4.0,41.9 C4.5,38.9 11.8,37.1 14.3,34.6 C16.7,32.1 17.8,30.2 18.8,26.8 C19.7,23.4 17.7,16.1 20.0,14.2 C22.3,12.3 29.0,15.6 32.5,15.2 C36.0,14.9 38.1,14.1 41.0,12.1 C43.9,10.2 47.0,3.3 50.0,3.3Z" />' +
        '</defs>' +
      '</svg>' +
      '<svg class="m3-bg-geo-shape" style="top:-90px; right:-110px; width:420px; height:420px; transform:rotate(8deg);" viewBox="0 0 100 100"><use href="#m3-static-clover"></use></svg>' +
      '<svg class="m3-bg-geo-outline" style="top:-120px; right:-140px; width:485px; height:485px; transform:rotate(-12deg);" viewBox="0 0 100 100"><use href="#m3-static-clover"></use></svg>' +
      '<svg class="m3-bg-geo-outline m3-bg-geo-outline--fine" style="top:-148px; right:-165px; width:545px; height:545px; transform:rotate(14deg);" viewBox="0 0 100 100"><use href="#m3-static-clover"></use></svg>' +
      '<svg class="m3-bg-geo-shape" style="top:30%; left:-140px; width:360px; height:360px; transform:rotate(-10deg);" viewBox="0 0 100 100"><use href="#m3-static-hexagon"></use></svg>' +
      '<svg class="m3-bg-geo-outline" style="top:27%; left:-172px; width:430px; height:430px; transform:rotate(14deg);" viewBox="0 0 100 100"><use href="#m3-static-hexagon"></use></svg>' +
      '<svg class="m3-bg-geo-outline m3-bg-geo-outline--fine" style="top:24%; left:-200px; width:490px; height:490px; transform:rotate(-16deg);" viewBox="0 0 100 100"><use href="#m3-static-hexagon"></use></svg>' +
      '<svg class="m3-bg-geo-shape" style="bottom:-110px; right:-85px; width:440px; height:440px; transform:rotate(11deg);" viewBox="0 0 100 100"><use href="#m3-static-cookie"></use></svg>' +
      '<svg class="m3-bg-geo-outline" style="bottom:-145px; right:-120px; width:510px; height:510px; transform:rotate(-14deg);" viewBox="0 0 100 100"><use href="#m3-static-cookie"></use></svg>' +
      '<svg class="m3-bg-geo-outline m3-bg-geo-outline--fine" style="bottom:-175px; right:-150px; width:575px; height:575px; transform:rotate(9deg);" viewBox="0 0 100 100"><use href="#m3-static-cookie"></use></svg>';
    document.body.insertBefore(wrap, document.body.firstChild);
  }

  window.addEventListener('DOMContentLoaded', function() {
    mountStaticGameBackground();
    const t = document.documentElement.getAttribute('data-theme') || getInitialTheme();
    const a = document.documentElement.getAttribute('data-accent') || getInitialAccent();
    const m = document.documentElement.getAttribute('data-tournament-mode') || getInitialTMode();
    applyState(t, a, m);
  });

  window.addEventListener('pageshow', function() {
    const wn = parseWindowName();
    let t = wn.theme;
    let a = wn.accent;
    let m = wn.tmode;
    try {
      const st = localStorage.getItem('spiele_theme');
      if (st === 'dark' || st === 'light') t = st;
      const sa = localStorage.getItem('spiele_accent');
      if (sa && ACCENTS.indexOf(sa) !== -1) a = sa;
      const sm = localStorage.getItem(TOURNAMENT_STORAGE_KEY);
      if (sm === 'on' || sm === 'off') m = sm;
    } catch (err) {}
    applyState(t || getInitialTheme(), a || getInitialAccent(), m || getInitialTMode());
  });

  window.addEventListener('storage', function(e) {
    if (e.key === 'spiele_theme' || e.key === 'spiele_accent' || e.key === TOURNAMENT_STORAGE_KEY) {
      const t = document.documentElement.getAttribute('data-theme') || 'dark';
      const a = document.documentElement.getAttribute('data-accent') || DEFAULT_ACCENT;
      const m = document.documentElement.getAttribute('data-tournament-mode') || DEFAULT_TMODE;
      applyState(
        e.key === 'spiele_theme' ? e.newValue : t,
        e.key === 'spiele_accent' ? e.newValue : a,
        e.key === TOURNAMENT_STORAGE_KEY ? e.newValue : m
      );
    }
  });

  document.addEventListener('click', function(e) {
    const link = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!link) return;
    const raw = link.getAttribute('href');
    if (!raw || raw.startsWith('#') || raw.startsWith('javascript:')) return;
    const t = document.documentElement.getAttribute('data-theme') || 'dark';
    const a = document.documentElement.getAttribute('data-accent') || DEFAULT_ACCENT;
    const m = document.documentElement.getAttribute('data-tournament-mode') || DEFAULT_TMODE;
    link.setAttribute('href', raw.split('#')[0] + buildHash(t, a, m));
  }, true);

  global.toggleTheme = function() {
    const t = document.documentElement.getAttribute('data-theme') || 'dark';
    const a = document.documentElement.getAttribute('data-accent') || DEFAULT_ACCENT;
    const m = document.documentElement.getAttribute('data-tournament-mode') || DEFAULT_TMODE;
    applyState(t === 'dark' ? 'light' : 'dark', a, m);
  };

  global.setAccent = function(accent) {
    const t = document.documentElement.getAttribute('data-theme') || 'dark';
    const m = document.documentElement.getAttribute('data-tournament-mode') || DEFAULT_TMODE;
    applyState(t, accent, m);
  };

  global.getAccent = function() {
    return document.documentElement.getAttribute('data-accent') || DEFAULT_ACCENT;
  };

  global.isTournamentMode = function() {
    return (document.documentElement.getAttribute('data-tournament-mode') || DEFAULT_TMODE) === 'on';
  };

  global.setTournamentMode = function(enabled) {
    const t = document.documentElement.getAttribute('data-theme') || 'dark';
    const a = document.documentElement.getAttribute('data-accent') || DEFAULT_ACCENT;
    applyState(t, a, enabled ? 'on' : 'off');
  };

  global.toggleTournamentMode = function() {
    global.setTournamentMode(!global.isTournamentMode());
    return global.isTournamentMode();
  };

  global.getStateHash = function() {
    const t = document.documentElement.getAttribute('data-theme') || 'light';
    const a = document.documentElement.getAttribute('data-accent') || DEFAULT_ACCENT;
    const m = document.documentElement.getAttribute('data-tournament-mode') || DEFAULT_TMODE;
    return buildHash(t, a, m);
  };
})(window);
