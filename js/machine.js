/* Autor: Miguel Ignacio Palafox Félix - Grupo 301 - Tarea de Máquina de Turing
 * machine.js — Núcleo de la Máquina de Turing (no sabe nada de la interfaz).
 * La cinta es un Map<índice, símbolo>, así que crece sin bronca hacia la izquierda (índices negativos)
 * y hacia la derecha. Cada función devuelve un resultado tipo Result: { ok, value?, error? }.
 */
window.TM = window.TM || {};

(function (TM) {
  'use strict';

  var MOVE = { R: 1, L: -1, S: 0 };

  function readTape(cfg, index) {
    return cfg.tape.has(index) ? cfg.tape.get(index) : cfg.blank;
  }

  function withPatch(cfg, patch) {
    var out = {};
    for (var k in cfg) if (Object.prototype.hasOwnProperty.call(cfg, k)) out[k] = cfg[k];
    for (var p in patch) if (Object.prototype.hasOwnProperty.call(patch, p)) out[p] = patch[p];
    return out;
  }

  // Arma la configuración inicial: palabra en casillas 0..n-1 y el cabezal en la casilla 0.
  function create(def, word, options) {
    var opts = options || {};
    var blank = opts.blank != null && opts.blank !== '' ? opts.blank : def.blank;
    if (blank == null || blank === '') return { ok: false, error: 'No hay símbolo en blanco definido.' };

    var sigma = def.sigma || [];
    var tokens = TM.Parser.tokenize(String(word == null ? '' : word), sigma.length ? sigma : [blank]);

    for (var i = 0; i < tokens.length; i++) {
      if (sigma.length && sigma.indexOf(tokens[i]) === -1) {
        return { ok: false, error: 'El símbolo "' + tokens[i] + '" de la palabra no pertenece a Σ = {' + sigma.join(',') + '}.' };
      }
      if (tokens[i] === blank) {
        return { ok: false, error: 'La palabra contiene el símbolo blanco "' + blank + '".' };
      }
    }

    var tape = new Map();
    for (var j = 0; j < tokens.length; j++) tape.set(j, tokens[j]);

    var cfg = {
      tape: tape,
      head: 0,
      state: def.initial,
      steps: 0,
      status: def.finals.indexOf(def.initial) !== -1 ? 'accepted' : 'ready',
      history: [],
      action: null,
      blank: blank
    };
    return { ok: true, value: cfg };
  }

  // Un solo paso de la máquina. Devuelve { ok, value: cfgNueva, done }.
  function step(def, cfg, maxSteps) {
    if (cfg.status === 'accepted' || cfg.status === 'halted') {
      return { ok: true, value: cfg, done: true };
    }
    if (def.finals.indexOf(cfg.state) !== -1) {
      return { ok: true, value: withPatch(cfg, { status: 'accepted' }), done: true };
    }
    if (cfg.steps >= maxSteps) {
      return { ok: true, value: withPatch(cfg, { status: 'limit', action: null }), done: true };
    }

    var read = readTape(cfg, cfg.head);
    var rule = def.transitions[TM.Parser.keyOf(cfg.state, read)];

    // Se detiene sin transición: la palabra no fue aceptada.
    if (!rule) {
      return { ok: true, value: withPatch(cfg, { status: 'halted', action: null }), done: true };
    }

    var tape = new Map(cfg.tape);
    tape.set(cfg.head, rule.write);                     // escribe
    var nextHead = cfg.head + (MOVE[rule.move] || 0);   // se mueve
    var history = cfg.history.concat([{
      n: cfg.steps + 1,
      from: cfg.state,
      read: read,
      to: rule.to,
      write: rule.write,
      move: rule.move,
      head: cfg.head
    }]);

    var accepted = def.finals.indexOf(rule.to) !== -1;
    var next = {
      tape: tape,
      head: nextHead,
      state: rule.to,
      steps: cfg.steps + 1,
      status: accepted ? 'accepted' : 'running',
      history: history,
      action: rule,
      blank: cfg.blank
    };
    return { ok: true, value: next, done: accepted };
  }

  // Corre hasta que acepte, se detenga o truene el límite de pasos.
  function run(def, cfg, maxSteps) {
    var current = cfg;
    var guard = 0;
    while (true) {
      if (current.status === 'accepted' || current.status === 'halted' || current.status === 'limit') break;
      var r = step(def, current, maxSteps);
      current = r.value;
      if (r.done) break;
      guard++;
      if (guard > 5000000) break; // seguro contra cualquier locura
    }
    return { ok: true, value: current };
  }

  TM.Engine = {
    create: create,
    step: step,
    run: run,
    readTape: readTape,
    MOVE: MOVE
  };
})(window.TM);
