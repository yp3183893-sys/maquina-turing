/* Autor: Miguel Ignacio Palafox Félix - Grupo 301 - Tarea de Máquina de Turing
 * parser.js — Lee y valida el archivo .txt con la descripción formal M = (Q, Σ, T, δ, q0, B, F).
 * No usa XMLHttpRequest ni módulos ES, así que funciona abriendo el index.html directo (file://).
 */
window.TM = window.TM || {};

(function (TM) {
  'use strict';

  // Separador raro para armar la llave de cada transición sin que choque con símbolos normales.
  var SEP = '\u001f';

  function keyOf(from, read) {
    return from + SEP + read;
  }

  // Acepto R/L/S y también palabras comunes por si alguien escribe "derecha", etc.
  function normDir(raw) {
    var d = String(raw == null ? '' : raw).trim().toUpperCase();
    if (d === 'R' || d === 'D' || d === 'RIGHT' || d === 'DERECHA' || d === '→') return 'R';
    if (d === 'L' || d === 'I' || d === 'LEFT' || d === 'IZQUIERDA' || d === '←') return 'L';
    if (d === 'S' || d === 'N' || d === 'STAY' || d === 'QUIETO' || d === 'NADA' || d === '·') return 'S';
    return null;
  }

  function splitMembers(value) {
    return String(value).split(',').map(function (s) { return s.trim(); })
      .filter(function (s) { return s.length > 0; });
  }

  function readSet(value, lineNo, errors, label) {
    var v = String(value).trim();
    if (v.charAt(0) === '{') {
      if (v.charAt(v.length - 1) !== '}') {
        errors.push('Línea ' + lineNo + ': las llaves de ' + label + ' no cierran.');
        return [];
      }
      v = v.slice(1, -1);
    }
    return splitMembers(v);
  }

  function readScalar(value, lineNo, errors, label) {
    var v = String(value).trim();
    if (v.charAt(0) === '{' && v.charAt(v.length - 1) === '}') v = v.slice(1, -1).trim();
    if (!v.length) {
      errors.push('Línea ' + lineNo + ': ' + label + ' está vacío.');
      return null;
    }
    return v;
  }

  // Separadores que acepto entre el lado izquierdo y el derecho de una transición.
  var SEPARADORES = [
    { s: '=', l: 1 }, { s: '->', l: 2 }, { s: '=>', l: 2 }, { s: '→', l: 1 }, { s: '⇒', l: 1 }
  ];

  // Me quedo con lo que está entre el primer "(" y el último ")".
  // Hago esto en vez de usar un patrón rígido para que también funcione cuando
  // los símbolos de la cinta son paréntesis, por ejemplo: δ(q0,()=(q0,(,R)
  function innerOf(str) {
    var a = str.indexOf('(');
    var b = str.lastIndexOf(')');
    if (a === -1 || b === -1 || b < a) return str.length ? str : null;
    return str.slice(a + 1, b);
  }

  // Parte la palabra de entrada en símbolos: primero intenta los símbolos largos de Σ.
  function tokenize(word, sigma) {
    var syms = sigma.slice().sort(function (a, b) { return b.length - a.length; });
    var out = [];
    var i = 0;
    while (i < word.length) {
      var hit = null;
      for (var k = 0; k < syms.length; k++) {
        var s = syms[k];
        if (s && word.substr(i, s.length) === s) { hit = s; break; }
      }
      if (hit === null) hit = word.charAt(i); // símbolo desconocido, se valida después
      out.push(hit);
      i += hit.length;
    }
    return out;
  }

  function parse(text) {
    var errors = [];
    var warnings = [];
    var def = {
      states: [],
      sigma: [],
      tape: [],
      initial: null,
      blank: null,
      finals: [],
      transitions: {},   // llave "estado|símbolo" -> regla
      list: []           // reglas en el orden del archivo
    };

    var lines = String(text == null ? '' : text).split(/\r\n|\r|\n/);

    for (var i = 0; i < lines.length; i++) {
      var lineNo = i + 1;
      var line = lines[i].trim();
      if (!line) continue;
      if (line.charAt(0) === '#' || line.indexOf('//') === 0) continue;  // comentario/título completo

      var cut = line.indexOf('//');       // comentario al final de la línea
      if (cut > -1) line = line.slice(0, cut).trim();
      if (!line) continue;

      var flat = line.replace(/\s+/g, '');   // quito espacios para no batallar con el formato

      // --- ¿es una definición tipo clave={...} o clave=valor? ---
      var keyMatch = flat.match(/^([A-Za-z0-9Σσ_]+)=/);
      if (keyMatch) {
        var rawKey = keyMatch[1];
        var value = flat.slice(keyMatch[0].length);
        var nk = rawKey.replace(/_/g, '').toLowerCase();

        if (nk === 'q') { def.states = readSet(value, lineNo, errors, 'Q'); continue; }
        if (nk === 'q0') { def.initial = readScalar(value, lineNo, errors, 'q0'); continue; }
        if (nk === 'sigma' || nk === 'σ' || nk === 's') { def.sigma = readSet(value, lineNo, errors, 'Σ'); continue; }
        if (nk === 't') { def.tape = readSet(value, lineNo, errors, 'T'); continue; }
        if (nk === 'b') { def.blank = readScalar(value, lineNo, errors, 'B'); continue; }
        if (nk === 'f') { def.finals = readSet(value, lineNo, errors, 'F'); continue; }

        errors.push('Línea ' + lineNo + ': no reconozco la clave "' + rawKey + '".');
        continue;
      }

      // --- transición:  δ(q,X)=(p,Y,D)  ó  δ (q,X) -> (p,Y,D) ---
      var sep = null;
      SEPARADORES.forEach(function (c) {
        var idx = flat.indexOf(c.s);
        if (idx > -1 && (sep === null || idx < sep.idx || (idx === sep.idx && c.l > sep.len))) {
          sep = { idx: idx, len: c.l };
        }
      });
      if (!sep) {
        errors.push('Línea ' + lineNo + ': no es una definición ni una transición válida.');
        continue;
      }

      var ladoA = innerOf(flat.slice(0, sep.idx));
      var ladoB = innerOf(flat.slice(sep.idx + sep.len));
      if (ladoA === null || ladoB === null) {
        errors.push('Línea ' + lineNo + ': no es una definición ni una transición válida.');
        continue;
      }

      var lhs = splitMembers(ladoA);
      var rhs = splitMembers(ladoB);
      if (lhs.length !== 2) {
        errors.push('Línea ' + lineNo + ': del lado izquierdo se espera (estado,símbolo).');
        continue;
      }
      if (rhs.length !== 3) {
        errors.push('Línea ' + lineNo + ': del lado derecho se espera (estado,símbolo,dirección).');
        continue;
      }

      var from = lhs[0], read = lhs[1], to = rhs[0], write = rhs[1], dirRaw = rhs[2];
      var dir = normDir(dirRaw);
      if (!dir) {
        errors.push('Línea ' + lineNo + ': dirección "' + dirRaw + '" inválida (usa R, L o S).');
        continue;
      }

      var k = keyOf(from, read);
      if (Object.prototype.hasOwnProperty.call(def.transitions, k)) {
        warnings.push('Línea ' + lineNo + ': la transición δ(' + from + ',' + read + ') está repetida; conservo la primera.');
        continue;
      }

      var rule = { idx: def.list.length, from: from, read: read, to: to, write: write, move: dir, key: k, line: lineNo };
      def.transitions[k] = rule;
      def.list.push(rule);
    }

    // ---------------- Revisión de la 7-tupla ----------------
    if (!def.states.length) errors.push('Falta la definición de Q (conjunto de estados).');
    if (def.initial === null) errors.push('Falta el estado inicial (q0=...).');
    if (def.blank === null) {
      // Si el archivo no trae B=, uso "%" por default y aviso (en vez de rechazarlo).
      def.blank = '%';
      warnings.push('El archivo no define B=...; uso "%" como símbolo en blanco.');
    }
    if (!def.list.length) errors.push('No hay transiciones δ definidas.');

    // Completo Q con los estados que aparecen en las transiciones.
    def.list.forEach(function (r) {
      if (def.states.indexOf(r.from) === -1) {
        def.states.push(r.from);
        warnings.push('El estado "' + r.from + '" aparece en δ pero no en Q; lo agrego.');
      }
      if (def.states.indexOf(r.to) === -1) {
        def.states.push(r.to);
        warnings.push('El estado "' + r.to + '" aparece en δ pero no en Q; lo agrego.');
      }
    });

    if (def.initial !== null && def.states.indexOf(def.initial) === -1) {
      def.states.push(def.initial);
      warnings.push('El estado inicial "' + def.initial + '" no estaba en Q; lo agrego.');
    }

    // Completo T con Σ, con B y con los símbolos que salen en las transiciones.
    if (!def.tape.length) {
      def.tape = def.sigma.slice();
      warnings.push('No se definió T; uso Σ ∪ {B}.');
    }
    if (def.blank !== null && def.tape.indexOf(def.blank) === -1) {
      def.tape.push(def.blank);
      warnings.push('El símbolo blanco "' + def.blank + '" no estaba en T; lo agrego.');
    }
    def.sigma.forEach(function (s) {
      if (def.tape.indexOf(s) === -1) {
        def.tape.push(s);
        warnings.push('El símbolo "' + s + '" de Σ no estaba en T; lo agrego.');
      }
    });
    def.list.forEach(function (r) {
      if (def.tape.indexOf(r.read) === -1) {
        def.tape.push(r.read);
        warnings.push('Línea ' + r.line + ': el símbolo leído "' + r.read + '" no estaba en T; lo agrego.');
      }
      if (def.tape.indexOf(r.write) === -1) {
        def.tape.push(r.write);
        warnings.push('Línea ' + r.line + ': el símbolo escrito "' + r.write + '" no estaba en T; lo agrego.');
      }
    });

    def.finals.forEach(function (f) {
      if (def.states.indexOf(f) === -1) {
        def.states.push(f);
        warnings.push('El estado final "' + f + '" no estaba en Q; lo agrego.');
      }
    });
    if (!def.finals.length) warnings.push('F está vacío: la máquina se detendrá pero nunca aceptará.');
    if (!def.sigma.length) warnings.push('Σ está vacío: no se validarán los símbolos de la palabra.');

    return {
      ok: errors.length === 0,
      value: def,
      errors: errors,
      warnings: warnings
    };
  }

  TM.Parser = { parse: parse, keyOf: keyOf, normDir: normDir, tokenize: tokenize };
})(window.TM);
