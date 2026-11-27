/* Autor: Miguel Ignacio Palafox Félix - Grupo 301 - Tarea de Máquina de Turing
 * app.js — Interfaz gráfica (todo se ve en pantalla, nada de consola).
 * Aquí solo pinto lo que me dice el núcleo (TM.Parser y TM.Engine).
 */
(function (TM) {
  'use strict';

  function $(id) { return document.getElementById(id); }

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  var DIR_WORD = { R: 'la derecha', L: 'la izquierda', S: 'quedarse en el mismo lugar' };

  var state = {
    def: null,
    cfg: null,
    source: '(ninguno)',
    playing: false,
    timer: null,
    speed: 300,
    maxSteps: 1000,
    rendered: 0
  };

  function isTerminal(cfg) {
    return !!cfg && (cfg.status === 'accepted' || cfg.status === 'halted' || cfg.status === 'limit');
  }

  /* Mensajes (errores y avisos) */
  function showMessages(errors, warnings) {
    var box = $('messages');
    errors = errors || [];
    warnings = warnings || [];
    box.innerHTML = '';
    if (!errors.length && !warnings.length) { box.classList.add('hidden'); return; }
    box.classList.remove('hidden');

    if (errors.length) {
      var e = document.createElement('div');
      e.className = 'msg error';
      e.innerHTML = '<b>No se pudo cargar la definición:</b><ul>' +
        errors.map(function (m) { return '<li>' + esc(m) + '</li>'; }).join('') + '</ul>';
      box.appendChild(e);
    }
    if (warnings.length) {
      var w = document.createElement('div');
      w.className = 'msg warn';
      w.innerHTML = '<b>Avisos (se arreglaron solitos):</b><ul>' +
        warnings.map(function (m) { return '<li>' + esc(m) + '</li>'; }).join('') + '</ul>';
      box.appendChild(w);
    }
  }

  /* Carga de la definición */
  function loadText(text, sourceName) {
    var res = TM.Parser.parse(text);
    if (!res.ok) {
      state.def = null;
      state.cfg = null;
      stopPlay();
      showMessages(res.errors, res.warnings);
      renderAll();
      return;
    }
    state.def = res.value;
    state.source = sourceName || '(memoria)';
    $('blankInput').value = res.value.blank || '';
    $('wordInput').value = '';   // cada definición tiene su propio Σ, borro la palabra anterior
    showMessages([], res.warnings);
    resetSim();
  }

  function readFile(file) {
    var reader = new FileReader();
    reader.onload = function () { loadText(String(reader.result), file.name); };
    reader.onerror = function () { showMessages(['No pude leer el archivo "' + file.name + '".'], []); };
    reader.readAsText(file, 'utf-8');
  }

  /* Simulación */
  function resetSim() {
    stopPlay();
    if (!state.def) { state.cfg = null; renderAll(); return; }

    var word = $('wordInput').value.replace(/\s+/g, '');
    var blank = $('blankInput').value.trim() || state.def.blank;

    var warns = [];
    if (blank !== state.def.blank) {
      warns.push('Estás usando "' + blank + '" como símbolo blanco, pero la definición trae B=' + state.def.blank + '.');
    }

    var res = TM.Engine.create(state.def, word, { blank: blank });
    if (!res.ok) {
      state.cfg = null;
      stopPlay();
      showMessages([res.error], warns);
      renderAll();
      return;
    }
    state.cfg = res.value;
    showMessages([], warns);
    renderAll();
  }

  function doStep() {
    if (!state.def || !state.cfg || isTerminal(state.cfg)) { updateControls(); return; }
    var res = TM.Engine.step(state.def, state.cfg, state.maxSteps);
    state.cfg = res.value;

    var h = state.cfg.history;
    while (state.rendered < h.length) {
      appendHistoryRow(h[state.rendered]);
      state.rendered++;
    }
    renderTape();
    renderStatus();
    highlightTransition();
    updateControls();
  }

  function runToEnd() {
    if (!state.def || !state.cfg || isTerminal(state.cfg)) return;
    stopPlay();
    var res = TM.Engine.run(state.def, state.cfg, state.maxSteps);
    state.cfg = res.value;
    renderHistoryAll();
    renderTape();
    renderStatus();
    highlightTransition();
    updateControls();
  }

  function setPlayLabel() {
    $('btnPlay').textContent = state.playing ? 'Pausar' : 'Ejecutar';
    $('btnPlay').classList.toggle('primary', !state.playing);
  }

  function startTimer() {
    if (state.timer) clearInterval(state.timer);
    state.timer = setInterval(function () {
      if (!state.cfg || isTerminal(state.cfg)) { stopPlay(); return; }
      doStep();
      if (!state.cfg || isTerminal(state.cfg)) stopPlay();
    }, Math.max(20, state.speed));
  }

  function togglePlay() {
    if (state.playing) { stopPlay(); return; }
    if (!state.cfg || isTerminal(state.cfg)) return;
    state.playing = true;
    setPlayLabel();
    updateControls();
    startTimer();
  }

  function stopPlay() {
    if (state.timer) { clearInterval(state.timer); state.timer = null; }
    state.playing = false;
    setPlayLabel();
    updateControls();
  }

  /* Pintar formalización */
  function formalSet(tag, label, arr) {
    var chips = (arr && arr.length)
      ? arr.map(function (s) { return '<span class="chip mono">' + esc(s) + '</span>'; }).join('')
      : '<span class="muted">—</span>';
    return '<div class="formal-row"><span class="tag">' + tag + '</span>' +
      '<div class="formal-body"><span class="formal-label">' + label + '</span>' +
      '<div class="chips">' + chips + '</div></div></div>';
  }

  function formalScalar(tag, label, v) {
    return '<div class="formal-row"><span class="tag">' + tag + '</span>' +
      '<div class="formal-body"><span class="formal-label">' + label + '</span>' +
      '<div class="chips"><span class="chip mono">' + esc(v == null ? '—' : v) + '</span></div></div></div>';
  }

  function renderFormal() {
    var box = $('formalBody');
    var d = state.def;
    if (!d) { box.innerHTML = '<p class="muted">Sin definición cargada.</p>'; return; }
    box.innerHTML =
      formalSet('Q', 'Estados', d.states) +
      formalSet('Σ', 'Alfabeto de entrada', d.sigma) +
      formalSet('T', 'Alfabeto de cinta', d.tape) +
      formalSet('F', 'Estados finales', d.finals) +
      formalScalar('q₀', 'Estado inicial', d.initial) +
      formalScalar('B', 'Símbolo blanco', d.blank);
  }

  /* Tabla de transiciones */
  function renderTransitions() {
    var body = $('transBody');
    body.innerHTML = '';
    if (!state.def || !state.def.list.length) {
      body.innerHTML = '<tr class="placeholder"><td colspan="5">Sin transiciones.</td></tr>';
      return;
    }
    state.def.list.forEach(function (r) {
      var tr = document.createElement('tr');
      tr.dataset.idx = r.idx;
      tr.innerHTML =
        '<td class="mono">' + esc(r.from) + '</td>' +
        '<td class="mono">' + esc(r.read) + '</td>' +
        '<td class="mono">' + esc(r.to) + '</td>' +
        '<td class="mono">' + esc(r.write) + '</td>' +
        '<td class="mono">' + esc(r.move) + '</td>';
      body.appendChild(tr);
    });
  }

  function highlightTransition() {
    var idx = null;
    var cfg = state.cfg;
    if (cfg && cfg.action && (cfg.status === 'running' || cfg.status === 'accepted')) idx = cfg.action.idx;

    var rows = document.querySelectorAll('#transBody tr');
    for (var i = 0; i < rows.length; i++) {
      var on = idx !== null && rows[i].dataset.idx === String(idx);
      rows[i].classList.toggle('active', on);
      if (on && rows[i].scrollIntoView) rows[i].scrollIntoView({ block: 'nearest' });
    }
  }

  /* Historial */
  function appendHistoryRow(h) {
    var body = $('historyBody');
    var ph = body.querySelector('.placeholder');
    if (ph) ph.remove();

    var tr = document.createElement('tr');
    tr.innerHTML =
      '<td class="mono">' + h.n + '</td>' +
      '<td class="mono">' + esc(h.from) + '</td>' +
      '<td class="mono">' + esc(h.read) + '</td>' +
      '<td class="mono trans">δ(' + esc(h.from) + ',' + esc(h.read) + ') = (' +
        esc(h.to) + ',' + esc(h.write) + ',' + esc(h.move) + ')</td>' +
      '<td class="mono">' + esc(h.to) + '</td>';
    body.appendChild(tr);

    var prevLast = body.querySelector('tr.last');
    if (prevLast) prevLast.classList.remove('last');
    tr.classList.add('last');

    var wrap = body.closest ? body.closest('.table-wrap') : null;
    if (wrap && wrap.scrollTo) wrap.scrollTo({ top: wrap.scrollHeight });
  }

  function renderHistoryAll() {
    var body = $('historyBody');
    body.innerHTML = '';
    state.rendered = 0;
    var cfg = state.cfg;
    if (!cfg || !cfg.history.length) {
      body.innerHTML = '<tr class="placeholder"><td colspan="5">Todavía no hay pasos ejecutados.</td></tr>';
      return;
    }
    for (var i = 0; i < cfg.history.length; i++) appendHistoryRow(cfg.history[i]);
    state.rendered = cfg.history.length;
  }

  /* Cinta */
  function renderTape() {
    var strip = $('tape');
    strip.innerHTML = '';
    var cfg = state.cfg;
    if (!cfg) {
      strip.innerHTML = '<div class="tape-empty">Sin cinta. Carga una definición y una palabra.</div>';
      return;
    }

    var min = cfg.head, max = cfg.head;
    cfg.tape.forEach(function (v, k) { if (k < min) min = k; if (k > max) max = k; });

    var writtenIdx = -1;
    if (cfg.action && cfg.history.length) writtenIdx = cfg.history[cfg.history.length - 1].head;

    var pad = 6;
    var frag = document.createDocumentFragment();
    for (var i = min - pad; i <= max + pad; i++) {
      var has = cfg.tape.has(i);
      var val = has ? cfg.tape.get(i) : cfg.blank;

      var cell = document.createElement('div');
      cell.className = 'cell';
      if (!has || val === cfg.blank) cell.classList.add('is-blank');
      if (i === cfg.head) cell.classList.add('head');
      if (i === writtenIdx) cell.classList.add('written');

      var arrow = document.createElement('div');
      arrow.className = 'arrow';
      arrow.textContent = '▲';

      var box = document.createElement('div');
      box.className = 'box';
      box.textContent = val === '' ? '␣' : val;

      var idx = document.createElement('div');
      idx.className = 'idx';
      idx.textContent = i;

      cell.appendChild(arrow);
      cell.appendChild(box);
      cell.appendChild(idx);
      frag.appendChild(cell);
    }
    strip.appendChild(frag);

    // Dejo el cabezal centrado en la tira.
    var headCell = strip.querySelector('.cell.head');
    if (headCell) {
      var vp = strip.parentElement;
      vp.scrollLeft = headCell.offsetLeft - vp.clientWidth / 2 + headCell.offsetWidth / 2;
    }
  }

  /* Estado / última acción */
  function renderStatus() {
    var badge = $('statusBadge');
    var textEl = $('statusText');
    var actionEl = $('lastAction');
    var counter = $('stepCounter');
    var cfg = state.cfg;

    if (!cfg) {
      badge.textContent = 'Sin simulación';
      badge.className = 'badge';
      counter.textContent = 'Paso 0';
      textEl.textContent = 'Carga una definición para comenzar.';
      actionEl.textContent = '—';
      return;
    }

    counter.textContent = 'Paso ' + cfg.steps;

    if (cfg.status === 'ready') {
      badge.textContent = 'Lista para iniciar';
      badge.className = 'badge ready';
      textEl.textContent = 'Todo listo. Cabezal en la casilla ' + cfg.head + ', estado "' + cfg.state + '".';
    } else if (cfg.status === 'running') {
      badge.textContent = 'En ejecución…';
      badge.className = 'badge running';
      textEl.textContent = 'Estado actual: "' + cfg.state + '". Cabezal en la casilla ' + cfg.head + '.';
    } else if (cfg.status === 'accepted') {
      badge.textContent = 'ACEPTA';
      badge.className = 'badge accept';
      textEl.textContent = 'La máquina ACEPTA: llegó al estado final "' + cfg.state + '" en ' + cfg.steps + ' pasos.';
    } else if (cfg.status === 'halted') {
      var readSym = TM.Engine.readTape(cfg, cfg.head);
      badge.textContent = 'RECHAZA / SE DETIENE';
      badge.className = 'badge reject';
      textEl.textContent = 'Sin transición δ(' + cfg.state + ',' + readSym + '): la máquina se detiene y la palabra NO fue aceptada.';
    } else if (cfg.status === 'limit') {
      badge.textContent = 'LÍMITE EXCEDIDO';
      badge.className = 'badge limit';
      textEl.textContent = 'Se alcanzó el límite de ' + state.maxSteps + ' pasos sin aceptar ni detenerse (posible bucle infinito).';
    }

    if (cfg.action) {
      var a = cfg.action;
      actionEl.textContent = 'Paso ' + cfg.steps + ': leyó "' + a.read + '", escribió "' + a.write +
        '", movió el cabezal a ' + (DIR_WORD[a.move] || a.move) + ' → nuevo estado "' + a.to +
        '". Cabezal en la casilla ' + cfg.head + '.';
    } else if (cfg.status === 'halted') {
      actionEl.textContent = 'Se detuvo: no existe transición para el estado "' + cfg.state +
        '" con el símbolo "' + TM.Engine.readTape(cfg, cfg.head) + '".';
    } else if (cfg.status === 'ready') {
      actionEl.textContent = 'Estado inicial "' + cfg.state + '". Presiona "Paso a paso" o "Ejecutar".';
    } else {
      actionEl.textContent = '—';
    }
  }

  /* Control de botones */
  function updateControls() {
    var hasDef = !!state.def;
    var hasCfg = !!state.cfg;
    var term = isTerminal(state.cfg);

    $('btnStep').disabled = !hasCfg || term || state.playing;
    $('btnEnd').disabled = !hasCfg || term || state.playing;
    $('btnPlay').disabled = !hasCfg || term;
    $('btnReset').disabled = !hasDef;
    $('wordInput').disabled = state.playing;
    $('blankInput').disabled = state.playing;
  }

  function renderAll() {
    $('fileName').textContent = state.source || '(ninguno)';
    renderFormal();
    renderTransitions();
    renderHistoryAll();
    renderTape();
    renderStatus();
    highlightTransition();
    updateControls();
  }

  /* Eventos */
  function bind() {
    $('btnFile').addEventListener('click', function () { $('fileInput').click(); });

    $('fileInput').addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0];
      if (f) readFile(f);
      e.target.value = ''; // permito volver a subir el mismo archivo
    });

    $('btnExample').addEventListener('click', function () {
      loadText(TM.EXAMPLES.complemento2, 'testMT.txt (ejemplo precargado)');
    });

    var dz = $('dropzone');
    ['dragenter', 'dragover'].forEach(function (ev) {
      dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add('over'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove('over'); });
    });
    dz.addEventListener('drop', function (e) {
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) readFile(f);
    });

    $('btnStep').addEventListener('click', function () { stopPlay(); doStep(); });
    $('btnPlay').addEventListener('click', togglePlay);
    $('btnReset').addEventListener('click', resetSim);
    $('btnEnd').addEventListener('click', runToEnd);

    $('speed').addEventListener('input', function () {
      state.speed = Number(this.value) || 300;
      $('speedLabel').textContent = state.speed + ' ms/paso';
      if (state.playing) startTimer();
    });

    $('maxSteps').addEventListener('change', function () {
      var v = parseInt(this.value, 10);
      state.maxSteps = (isNaN(v) || v < 1) ? 1000 : v;
      this.value = state.maxSteps;
    });

    // Al cambiar la palabra o el blanco, reinicio la simulación (es lo más claro para el usuario).
    ['wordInput', 'blankInput'].forEach(function (id) {
      $(id).addEventListener('change', function () { if (!state.playing) resetSim(); });
      $(id).addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !state.playing) { e.preventDefault(); resetSim(); }
      });
    });
  }

  function init() {
    bind();
    $('speedLabel').textContent = state.speed + ' ms/paso';
    // Cargo el ejemplo de Complemento a 2 al abrir, para que se pueda probar de volada.
    loadText(TM.EXAMPLES.complemento2, 'testMT.txt (ejemplo precargado)');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window.TM);
