(() => {
  'use strict';

  // ---------- Estado ----------
  const state = {
    playlist: [],       // {name, url, file, lyrics}
    currentIndex: -1,
    shuffle: false,
    repeat: 'off',       // off | one | all
    eqBands: [60,170,310,600,1000,3000,6000,12000,14000],
    eqGains: new Array(9).fill(0),
  };

  const LS_THEME = 'rack_theme_v1';
  const LS_LAYOUT = 'rack_layout_v1';
  const LS_WIDGETS = 'rack_widgets_v1';

  // ---------- Elementos ----------
  const audio = new Audio();
  audio.preload = 'metadata';

  const $ = (sel) => document.querySelector(sel);
  const rack = $('#rack');
  const fileInput = $('#fileInput');
  const playlistEl = $('#playlistEl');
  const trackTitle = $('#trackTitle');
  const trackArtist = $('#trackArtist');
  const albumArt = $('#albumArt');
  const albumArtGlyph = $('#albumArtGlyph');
  const seekBar = $('#seekBar');
  const timeCurrent = $('#timeCurrent');
  const timeTotal = $('#timeTotal');
  const btnPlay = $('#btnPlay');
  const btnPrev = $('#btnPrev');
  const btnNext = $('#btnNext');
  const btnShuffle = $('#btnShuffle');
  const btnRepeat = $('#btnRepeat');
  const volumeBar = $('#volumeBar');
  const canvas = $('#visualizerCanvas');
  const ctx2d = canvas.getContext('2d');
  const eqBandsEl = $('#eqBands');
  const lyricsInput = $('#lyricsInput');
  const lyricsView = $('#lyricsView');
  const btnLyricsToggle = $('#btnLyricsToggle');

  // ---------- Web Audio graph ----------
  let audioCtx, sourceNode, analyser, filters = [], connected = false;
  function ensureAudioGraph(){
    if (connected) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    sourceNode = audioCtx.createMediaElementSource(audio);
    filters = state.eqBands.map((freq, i) => {
      const f = audioCtx.createBiquadFilter();
      f.type = 'peaking';
      f.frequency.value = freq;
      f.Q.value = 1.1;
      f.gain.value = state.eqGains[i];
      return f;
    });
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 128;

    let node = sourceNode;
    filters.forEach(f => { node.connect(f); node = f; });
    node.connect(analyser);
    analyser.connect(audioCtx.destination);
    connected = true;
    drawVisualizer();
  }

  // ---------- Playlist ----------
  function renderPlaylist(){
    playlistEl.innerHTML = '';
    if (state.playlist.length === 0){
      playlistEl.innerHTML = '<li class="playlist-empty">Tu lista está vacía. Toca "＋ Añadir".</li>';
      return;
    }
    state.playlist.forEach((track, i) => {
      const li = document.createElement('li');
      li.className = 'playlist-item' + (i === state.currentIndex ? ' active' : '');
      li.innerHTML = `<span class="idx">${String(i+1).padStart(2,'0')}</span><span class="pname">${track.name}</span><span class="premove" data-i="${i}">✕</span>`;
      li.addEventListener('click', (e) => {
        if (e.target.classList.contains('premove')){
          removeTrack(i);
          e.stopPropagation();
          return;
        }
        loadTrack(i, true);
      });
      playlistEl.appendChild(li);
    });
  }

  function removeTrack(i){
    if (i === state.currentIndex) { audio.pause(); }
    state.playlist.splice(i, 1);
    if (state.currentIndex > i) state.currentIndex--;
    else if (state.currentIndex === i) state.currentIndex = -1;
    renderPlaylist();
  }

  function addFiles(fileList){
    Array.from(fileList).forEach(file => {
      state.playlist.push({
        name: file.name.replace(/\.[^/.]+$/, ''),
        url: URL.createObjectURL(file),
        file,
        lyrics: ''
      });
    });
    renderPlaylist();
    if (state.currentIndex === -1 && state.playlist.length){
      loadTrack(0, false);
    }
  }

  function loadTrack(i, autoplay){
    if (i < 0 || i >= state.playlist.length) return;
    state.currentIndex = i;
    const track = state.playlist[i];
    audio.src = track.url;
    trackTitle.textContent = track.name;
    trackArtist.textContent = 'Pista ' + (i+1) + ' de ' + state.playlist.length;
    albumArtGlyph.textContent = '♪';
    lyricsInput.value = track.lyrics || '';
    renderPlaylist();
    ensureAudioGraph();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    if (autoplay){
      audio.play().catch(()=>{});
    }
  }

  function playPause(){
    ensureAudioGraph();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    if (state.currentIndex === -1 && state.playlist.length){
      loadTrack(0, true);
      return;
    }
    if (audio.paused){ audio.play().catch(()=>{}); } else { audio.pause(); }
  }

  function next(userTriggered){
    if (!state.playlist.length) return;
    let i;
    if (state.shuffle){
      i = Math.floor(Math.random() * state.playlist.length);
    } else {
      i = state.currentIndex + 1;
      if (i >= state.playlist.length){
        if (state.repeat === 'all'){ i = 0; } else { return; }
      }
    }
    loadTrack(i, true);
  }
  function prev(){
    if (!state.playlist.length) return;
    let i = state.currentIndex - 1;
    if (i < 0) i = state.repeat === 'all' ? state.playlist.length - 1 : 0;
    loadTrack(i, true);
  }

  // ---------- Controles de transporte ----------
  btnPlay.addEventListener('click', playPause);
  btnNext.addEventListener('click', () => next(true));
  btnPrev.addEventListener('click', prev);
  btnShuffle.addEventListener('click', () => {
    state.shuffle = !state.shuffle;
    btnShuffle.classList.toggle('active', state.shuffle);
  });
  btnRepeat.addEventListener('click', () => {
    state.repeat = state.repeat === 'off' ? 'all' : (state.repeat === 'all' ? 'one' : 'off');
    btnRepeat.classList.toggle('active', state.repeat !== 'off');
    btnRepeat.textContent = state.repeat === 'one' ? '🔂' : '⟳';
  });

  audio.addEventListener('play', () => { btnPlay.textContent = '⏸'; });
  audio.addEventListener('pause', () => { btnPlay.textContent = '▶'; });
  audio.addEventListener('ended', () => {
    if (state.repeat === 'one'){ audio.currentTime = 0; audio.play(); return; }
    next(false);
  });
  audio.addEventListener('timeupdate', () => {
    if (!isFinite(audio.duration)) return;
    seekBar.value = (audio.currentTime / audio.duration) * 100;
    timeCurrent.textContent = fmtTime(audio.currentTime);
    timeTotal.textContent = fmtTime(audio.duration);
    updateLyricsSync();
  });
  seekBar.addEventListener('input', () => {
    if (!isFinite(audio.duration)) return;
    audio.currentTime = (seekBar.value / 100) * audio.duration;
  });
  volumeBar.addEventListener('input', () => { audio.volume = volumeBar.value / 100; });
  audio.volume = 0.8;

  function fmtTime(s){
    if (!isFinite(s)) return '0:00';
    const m = Math.floor(s / 60), sec = Math.floor(s % 60);
    return m + ':' + String(sec).padStart(2, '0');
  }

  // ---------- Gestos en la carátula ----------
  let touchStartX = null;
  albumArt.addEventListener('touchstart', (e) => { touchStartX = e.touches[0].clientX; });
  albumArt.addEventListener('touchend', (e) => {
    if (touchStartX === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) > 50){ dx < 0 ? next(true) : prev(); }
    else { playPause(); }
    touchStartX = null;
  });
  albumArt.addEventListener('click', playPause);

  // ---------- Archivos ----------
  $('#btnAddFiles').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => addFiles(e.target.files));

  // Arrastrar y soltar archivos sobre la app
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  });

  // ---------- Visualizador ----------
  function resizeCanvas(){
    canvas.width = canvas.clientWidth * devicePixelRatio;
    canvas.height = canvas.clientHeight * devicePixelRatio;
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  function drawVisualizer(){
    requestAnimationFrame(drawVisualizer);
    if (!analyser) return;
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);
    const w = canvas.width, h = canvas.height;
    ctx2d.clearRect(0, 0, w, h);
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#e8a33d';
    const accent2 = getComputedStyle(document.documentElement).getPropertyValue('--accent-2').trim() || '#4fb8c4';
    const barCount = data.length;
    const gap = 3 * devicePixelRatio;
    const barW = (w - gap * (barCount - 1)) / barCount;
    for (let i = 0; i < barCount; i++){
      const v = data[i] / 255;
      const barH = Math.max(3, v * h * 0.95);
      const x = i * (barW + gap);
      const grad = ctx2d.createLinearGradient(0, h - barH, 0, h);
      grad.addColorStop(0, accent2);
      grad.addColorStop(1, accent);
      ctx2d.fillStyle = grad;
      ctx2d.fillRect(x, h - barH, barW, barH);
    }
  }

  // ---------- Ecualizador ----------
  function buildEqUI(){
    eqBandsEl.innerHTML = '';
    state.eqBands.forEach((freq, i) => {
      const wrap = document.createElement('div');
      wrap.className = 'eq-band';
      const label = freq >= 1000 ? (freq/1000) + 'k' : freq;
      wrap.innerHTML = `<input type="range" min="-12" max="12" step="1" value="${state.eqGains[i]}" data-i="${i}"><span class="eq-band-label">${label}</span>`;
      eqBandsEl.appendChild(wrap);
    });
    eqBandsEl.querySelectorAll('input').forEach(inp => {
      inp.addEventListener('input', () => {
        const i = +inp.dataset.i;
        state.eqGains[i] = +inp.value;
        if (filters[i]) filters[i].gain.value = +inp.value;
      });
    });
  }
  $('#btnEqReset').addEventListener('click', () => {
    state.eqGains = new Array(9).fill(0);
    buildEqUI();
    filters.forEach(f => f.gain.value = 0);
  });

  // ---------- Letras ----------
  function parseLRC(text){
    const lines = text.split('\n');
    const re = /\[(\d{2}):(\d{2}(?:\.\d+)?)\]/g;
    const out = [];
    lines.forEach(line => {
      const matches = [...line.matchAll(re)];
      if (matches.length){
        const content = line.replace(re, '').trim();
        matches.forEach(m => {
          const t = (+m[1]) * 60 + parseFloat(m[2]);
          out.push({ t, text: content });
        });
      } else if (line.trim()) {
        out.push({ t: null, text: line.trim() });
      }
    });
    return out.sort((a,b) => (a.t ?? 0) - (b.t ?? 0));
  }
  let parsedLyrics = [];
  lyricsInput.addEventListener('input', () => {
    if (state.currentIndex >= 0) state.playlist[state.currentIndex].lyrics = lyricsInput.value;
    parsedLyrics = parseLRC(lyricsInput.value);
    renderLyricsView();
  });
  function renderLyricsView(){
    lyricsView.innerHTML = parsedLyrics.map((l, i) => `<div class="line" data-i="${i}">${l.text || '&nbsp;'}</div>`).join('');
  }
  function updateLyricsSync(){
    if (!parsedLyrics.length) return;
    let activeIdx = -1;
    parsedLyrics.forEach((l, i) => { if (l.t !== null && l.t <= audio.currentTime) activeIdx = i; });
    lyricsView.querySelectorAll('.line').forEach((el, i) => el.classList.toggle('current', i === activeIdx));
    const activeEl = lyricsView.querySelector('.line.current');
    if (activeEl) activeEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  btnLyricsToggle.addEventListener('click', () => {
    const showing = !lyricsView.hidden;
    lyricsView.hidden = showing;
    lyricsInput.hidden = !showing;
    btnLyricsToggle.textContent = showing ? 'Ver letra' : 'Editar letra';
  });
  lyricsView.hidden = true;

  // ---------- Modo edición / arrastrar paneles ----------
  const btnEditMode = $('#btnEditMode');
  let editMode = false;
  btnEditMode.addEventListener('click', () => {
    editMode = !editMode;
    rack.classList.toggle('edit-mode', editMode);
    rack.querySelectorAll('.panel').forEach(p => p.setAttribute('draggable', editMode));
  });

  let dragEl = null;
  rack.addEventListener('dragstart', (e) => {
    const panel = e.target.closest('.panel');
    if (!panel) return;
    dragEl = panel;
    panel.classList.add('dragging');
  });
  rack.addEventListener('dragend', (e) => {
    const panel = e.target.closest('.panel');
    if (panel) panel.classList.remove('dragging');
    dragEl = null;
    saveLayout();
  });
  rack.addEventListener('dragover', (e) => {
    e.preventDefault();
    const after = getDragAfterElement(rack, e.clientY);
    if (!dragEl) return;
    if (after == null){ rack.appendChild(dragEl); } else { rack.insertBefore(dragEl, after); }
  });
  function getDragAfterElement(container, y){
    const els = [...container.querySelectorAll('.panel:not(.dragging)')];
    return els.reduce((closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset){
        return { offset, element: child };
      } else { return closest; }
    }, { offset: -Infinity }).element;
  }
  function saveLayout(){
    const order = [...rack.querySelectorAll('.panel')].map(p => p.dataset.widget);
    localStorage.setItem(LS_LAYOUT, JSON.stringify(order));
  }
  function restoreLayout(){
    try{
      const order = JSON.parse(localStorage.getItem(LS_LAYOUT));
      if (!Array.isArray(order)) return;
      order.forEach(name => {
        const el = rack.querySelector(`.panel[data-widget="${name}"]`);
        if (el) rack.appendChild(el);
      });
    } catch(e){}
  }

  // ---------- Visibilidad de módulos ----------
  const widgetToggles = $('#widgetToggles');
  function buildWidgetToggles(){
    widgetToggles.innerHTML = '';
    rack.querySelectorAll('.panel').forEach(p => {
      const name = p.dataset.widget;
      const label = p.querySelector('.panel-title').textContent;
      const row = document.createElement('label');
      row.innerHTML = `<input type="checkbox" data-w="${name}" checked> ${label}`;
      widgetToggles.appendChild(row);
    });
    widgetToggles.querySelectorAll('input').forEach(inp => {
      inp.addEventListener('change', () => {
        const el = rack.querySelector(`.panel[data-widget="${inp.dataset.w}"]`);
        el.style.display = inp.checked ? '' : 'none';
        saveWidgetVisibility();
      });
    });
  }
  function saveWidgetVisibility(){
    const state = {};
    widgetToggles.querySelectorAll('input').forEach(inp => { state[inp.dataset.w] = inp.checked; });
    localStorage.setItem(LS_WIDGETS, JSON.stringify(state));
  }
  function restoreWidgetVisibility(){
    try{
      const saved = JSON.parse(localStorage.getItem(LS_WIDGETS));
      if (!saved) return;
      Object.entries(saved).forEach(([name, visible]) => {
        const el = rack.querySelector(`.panel[data-widget="${name}"]`);
        if (el) el.style.display = visible ? '' : 'none';
        const inp = widgetToggles.querySelector(`input[data-w="${name}"]`);
        if (inp) inp.checked = visible;
      });
    } catch(e){}
  }

  // ---------- Ajustes / tema ----------
  const root = document.documentElement;
  const settingsOverlay = $('#settingsOverlay');
  $('#btnSettings').addEventListener('click', () => settingsOverlay.hidden = false);
  $('#btnCloseSettings').addEventListener('click', () => settingsOverlay.hidden = true);
  settingsOverlay.addEventListener('click', (e) => { if (e.target === settingsOverlay) settingsOverlay.hidden = true; });

  const themeInputs = {
    colorAccent: v => root.style.setProperty('--accent', v),
    colorAccent2: v => root.style.setProperty('--accent-2', v),
    colorBg: v => root.style.setProperty('--bg', v),
    colorPanel: v => { root.style.setProperty('--panel', v); root.style.setProperty('--panel-2', v); },
    colorText: v => root.style.setProperty('--text', v),
    fontDisplay: v => root.style.setProperty('--font-display', v),
    fontBody: v => root.style.setProperty('--font-body', v),
    radiusRange: v => root.style.setProperty('--radius', v + 'px'),
    colsRange: v => root.style.setProperty('--cols', v),
    bgDim: v => root.style.setProperty('--bg-dim', (v/100)),
  };
  Object.keys(themeInputs).forEach(id => {
    const el = document.getElementById(id);
    el.addEventListener('input', () => { themeInputs[id](el.value); saveTheme(); });
  });
  $('#glassToggle').addEventListener('change', (e) => {
    root.style.setProperty('--glass-blur', e.target.checked ? '14px' : '0px');
    root.style.setProperty('--glass-alpha', e.target.checked ? '0.6' : '1');
    saveTheme();
  });

  $('#bgImageInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      root.style.setProperty('--bg-image', `url(${reader.result})`);
      saveTheme(reader.result);
    };
    reader.readAsDataURL(file);
  });
  $('#btnClearBg').addEventListener('click', () => {
    root.style.setProperty('--bg-image', 'none');
    saveTheme(null);
  });

  function collectTheme(bgImageOverride){
    const t = {};
    Object.keys(themeInputs).forEach(id => { t[id] = document.getElementById(id).value; });
    t.glass = $('#glassToggle').checked;
    t.bgImage = bgImageOverride !== undefined ? bgImageOverride : (root.style.getPropertyValue('--bg-image') || 'none');
    return t;
  }
  function saveTheme(bgImageOverride){
    localStorage.setItem(LS_THEME, JSON.stringify(collectTheme(bgImageOverride)));
  }
  function applyTheme(t){
    if (!t) return;
    Object.keys(themeInputs).forEach(id => {
      if (t[id] !== undefined){ document.getElementById(id).value = t[id]; themeInputs[id](t[id]); }
    });
    $('#glassToggle').checked = !!t.glass;
    root.style.setProperty('--glass-blur', t.glass ? '14px' : '0px');
    root.style.setProperty('--glass-alpha', t.glass ? '0.6' : '1');
    if (t.bgImage && t.bgImage !== 'none'){
      root.style.setProperty('--bg-image', t.bgImage.startsWith('url') ? t.bgImage : `url(${t.bgImage})`);
    }
  }
  function restoreTheme(){
    try{
      const t = JSON.parse(localStorage.getItem(LS_THEME));
      applyTheme(t);
    } catch(e){}
  }

  $('#btnResetAll').addEventListener('click', () => {
    if (!confirm('¿Restablecer tema, diseño y módulos a los valores por defecto?')) return;
    localStorage.removeItem(LS_THEME);
    localStorage.removeItem(LS_LAYOUT);
    localStorage.removeItem(LS_WIDGETS);
    location.reload();
  });
  $('#btnExport').addEventListener('click', () => {
    const data = {
      theme: collectTheme(),
      layout: JSON.parse(localStorage.getItem(LS_LAYOUT) || 'null'),
      widgets: JSON.parse(localStorage.getItem(LS_WIDGETS) || 'null'),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'rack-tema.json';
    a.click();
  });
  $('#btnImport').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try{
        const data = JSON.parse(reader.result);
        if (data.theme) { applyTheme(data.theme); saveTheme(data.theme.bgImage); }
        if (data.layout) localStorage.setItem(LS_LAYOUT, JSON.stringify(data.layout));
        if (data.widgets) localStorage.setItem(LS_WIDGETS, JSON.stringify(data.widgets));
        restoreLayout();
        restoreWidgetVisibility();
      } catch(err){ alert('Archivo de tema no válido.'); }
    };
    reader.readAsText(file);
  });

  // ---------- Inicio ----------
  buildEqUI();
  buildWidgetToggles();
  restoreTheme();
  restoreLayout();
  restoreWidgetVisibility();
  renderPlaylist();

  // Registrar service worker para uso offline como PWA
  if ('serviceWorker' in navigator){
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('service-worker.js').catch(()=>{});
    });
  }
})();
