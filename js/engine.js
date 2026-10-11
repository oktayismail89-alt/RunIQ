/* RunIQ engine — logică pură, fără DOM. Planul de bază + ajustări validate în cod.
   Gemini PROPUNE; tot ce ajunge în plan trece prin validate(). */
(function (g) {
  'use strict';
  var START = '2026-10-12';                       // luni, săptămâna 1
  var DAY_IDX = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  var DAY_RO = { Mon: 'Luni', Tue: 'Marți', Wed: 'Miercuri', Thu: 'Joi', Fri: 'Vineri', Sat: 'Sâmbătă', Sun: 'Duminică' };
  var RANK = { easy: 0, long: 0, hmp: 1, tempo: 2, interval: 3, race: 9, rest: -1 };
  var KIND_RO = { easy: 'Alergare ușoară', long: 'Alergare lungă', tempo: 'Tempo', interval: 'Intervale', hmp: 'Ritm de semi', race: 'Cursă / test', rest: 'Odihnă' };
  var GOAL = { hmp: 313, mp: 341 };               // 5:13/km = semi 1:50 ; 5:41/km = maraton 3:59:48
  var DEFAULT_FIT = { hmpSec: 355, week: 1, src: 'estimare (semi 2:05 în primăvară, 5:56/km)' };
  var IMPROVE_PER_WEEK = 1.4;                      // s/km pe săptămână, progresie realistă
  var MIN_KM = 5;

  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseISO(s) { var a = s.split('-'); return new Date(+a[0], +a[1] - 1, +a[2]); }
  function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
  function dayDiff(a, b) { return Math.round((b - a) / 86400000); }
  function weekOf(dateISO) {
    var w = Math.floor(dayDiff(parseISO(START), parseISO(dateISO)) / 7) + 1;
    return w;                                      // poate fi <1 sau >52 (în afara planului)
  }
  function clampWeek(w) { return Math.max(1, Math.min(g.FIXED_PLAN.weeks.length, w)); }
  function sessionDate(week, day) { return iso(addDays(parseISO(START), (week - 1) * 7 + DAY_IDX[day])); }
  function weekRange(week) {
    var a = addDays(parseISO(START), (week - 1) * 7), b = addDays(a, 6);
    return a.getDate() + ' ' + MONTHS[a.getMonth()] + ' – ' + b.getDate() + ' ' + MONTHS[b.getMonth()];
  }
  var MONTHS = ['ian', 'feb', 'mar', 'apr', 'mai', 'iun', 'iul', 'aug', 'sep', 'oct', 'nov', 'dec'];

  function fmtPace(sec) { sec = Math.round(sec); return Math.floor(sec / 60) + ':' + pad(sec % 60); }
  function fmtTime(sec) {
    sec = Math.round(sec); var h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
    return h ? h + ':' + pad(m) + ':' + pad(s) : m + ':' + pad(s);
  }
  function parseTime(str) {
    if (!str) return 0; var p = String(str).trim().split(':').map(Number);
    if (p.some(isNaN)) return 0;
    return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p.length === 2 ? p[0] * 60 + p[1] : 0;
  }
  function round05(x) { return Math.round(x * 2) / 2; }

  /* ---------- ritmuri: urmează forma ta reală, nu un tabel de obiective ---------- */
  function hmpAt(S, week) {
    var f = S.fitness || DEFAULT_FIT;
    var v = f.hmpSec - IMPROVE_PER_WEEK * Math.max(0, week - f.week);
    return Math.max(GOAL.hmp, v);
  }
  function zones(S, week) {
    var h = hmpAt(S, week), easyLo = h + 67, easyHi = h + 107;
    return {
      hmp: h, mp: Math.max(GOAL.mp, h + 28),
      easy: [easyLo, easyHi], tempo: [h + 22, h + 32], interval: [h - 3, h + 7]
    };
  }
  function range(a) { return fmtPace(a[0]) + '–' + fmtPace(a[1]); }
  function paceText(S, week, kind) {
    var z = zones(S, week);
    if (kind === 'easy' || kind === 'long') return range(z.easy) + '/km';
    if (kind === 'tempo') return range(z.tempo) + '/km';
    if (kind === 'interval') return range(z.interval) + '/km';
    if (kind === 'hmp') return fmtPace(z.hmp) + '/km';
    return '';
  }
  // rezultat de test/cursă -> forma curentă (semi). Exponent mai prudent pentru distanțe scurte.
  function fitnessFromResult(km, sec) {
    var e = km < 7 ? 1.07 : 1.06;
    var hm = sec * Math.pow(21.0975 / km, e);
    return hm / 21.0975;
  }

  /* ---------- plan efectiv = bază + ajustări ---------- */
  function baseWeek(w) { return g.FIXED_PLAN.weeks[clampWeek(w) - 1]; }
  function fillTokens(S, week, t) {
    var z = zones(S, week);
    return String(t || '').replace(/\{HMP\}/g, fmtPace(z.hmp)).replace(/\{MP\}/g, fmtPace(z.mp));
  }
  function describe(S, week, b, kind, km, note) {
    var tpl = fillTokens(S, week, b.tpl);
    var d;
    if (kind === b.kind) {
      d = tpl;
      if (kind === 'long') d = d.replace(/Lung\s+\d+(?:[.,]\d+)?\s*km/, 'Lung ' + km + ' km');
    } else if (kind === 'rest') d = 'Zi liberă. Dacă simți durerea, mergi la un kinetoterapeut.';
    else if (kind === 'easy') d = 'Ușor, conversațional. Înlocuiește sesiunea de calitate din plan.';
    else d = tpl;
    return (note ? note + ' · ' : '') + d;
  }
  function effectiveWeek(S, w) {
    var bw = baseWeek(w), adj = (S.adjust || {})[w];
    var sessions = bw.sessions.map(function (b) {
      var a = adj && adj.sessions && adj.sessions.filter(function (x) { return x.day === b.day; })[0];
      var kind = a ? a.kind : b.kind, km = a ? a.km : b.km;
      var changed = !!a && (kind !== b.kind || km !== b.km);
      return {
        day: b.day, date: sessionDate(w, b.day), kind: kind, km: km, baseKm: b.km, baseKind: b.kind, changed: changed,
        label: b.kind === 'race' ? b.type : KIND_RO[kind],
        pace: b.kind === 'race' ? fillTokens(S, w, b.pt || '') : paceText(S, w, kind),
        detail: describe(S, w, b, kind, km, changed && a.note ? a.note : ''), 
      };
    });
    var total = sessions.reduce(function (s, x) { return s + x.km; }, 0);
    return {
      week: w, range: weekRange(w), phase: bw.phase, coachNote: bw.coachNote || '', sessions: sessions,
      total: Math.round(total * 10) / 10, baseTotal: bw.targetKm, adjusted: !!(adj && sessions.some(function (x) { return x.changed; })),
      adjNote: adj ? adj.note : '', adjTs: adj ? adj.ts : 0, adjSrc: adj ? adj.src : ''
    };
  }

  /* ---------- statistici din alergări ---------- */
  function runsInWeek(S, w) { return (S.runs || []).filter(function (r) { return weekOf(r.date) === w; }); }
  function weekStats(S, w) {
    var rs = runsInWeek(S, w), ew = effectiveWeek(S, w);
    var km = rs.reduce(function (s, r) { return s + r.km; }, 0);
    var easy = rs.filter(function (r) { return r.sec > 0 && r.km >= 4; });
    var feel = rs.map(function (r) { return r.feel; }).filter(Boolean);
    var hr = rs.map(function (r) { return r.hr; }).filter(Boolean);
    function avg(a) { return a.length ? a.reduce(function (s, x) { return s + x; }, 0) / a.length : 0; }
    return {
      week: w, planned: ew.total, base: ew.baseTotal, actual: Math.round(km * 10) / 10, count: rs.length,
      avgPace: easy.length ? avg(easy.map(function (r) { return r.sec / r.km; })) : 0, avgHr: Math.round(avg(hr)), avgFeel: avg(feel)
    };
  }
  function lastRuns(S, n) {
    return (S.runs || []).slice().sort(function (a, b) { return b.ts - a.ts; }).slice(0, n);
  }
  function E_weekOf(d) { return weekOf(d); }
  function ctxFor(S, week, todayISO) {
    // doar săptămâni ÎNCHEIATE contează pentru plafoane (săptămâna în curs e incompletă prin definiție)
    var ended = E_weekOf(todayISO) - 1;
    var prev = week > 1 && week - 1 <= ended ? weekStats(S, week - 1) : null, prev2 = week > 2 && week - 2 <= ended ? weekStats(S, week - 2) : null;
    var rec = lastRuns(S, 3), feel = rec.map(function (r) { return r.feel; }).filter(Boolean);
    var feelAvg = feel.length ? feel.reduce(function (s, x) { return s + x; }, 0) / feel.length : 0;
    var nig = (S.niggles || []).filter(function (n) { return n.active; }).reduce(function (m, n) { return Math.max(m, n.sev || 1); }, 0);
    var ahead = !!(prev && prev2 && prev.planned > 0 && prev2.planned > 0 &&
      prev.actual >= prev.planned && prev2.actual >= prev2.planned && feelAvg > 0 && feelAvg <= 3);
    var doneDates = {}; (S.runs || []).forEach(function (r) { doneDates[r.date] = true; });
    return {
      week: week, curWeek: weekOf(todayISO), today: todayISO, prev: prev, ahead: ahead, niggleSev: nig, feelAvg: feelAvg, doneDates: doneDates,
      reduce: nig >= 3 ? 0.5 : nig === 2 ? 0.8 : feelAvg >= 4.5 ? 0.9 : 1,
      noQuality: nig >= 2 || feelAvg >= 4.5 || !!(prev && prev.count > 0 && prev.actual < 0.7 * prev.planned)
    };
  }

  /* ---------- validatorul: singurul drum spre plan ---------- */
  function validate(S, week, proposal, ctx) {
    var bw = baseWeek(week), problems = [];
    var cur = effectiveWeek(S, week);
    var out = [];
    var baseTotal = bw.targetKm;
    // plafon total
    var maxTotal = baseTotal * (ctx.ahead ? 1.08 : 1) * ctx.reduce;
    if (ctx.prev && week > 1) {
      // nicio alergare înregistrată = posibil neînregistrat; tăiem doar moderat
      var floorPrev = ctx.prev.count === 0 ? 0.8 * ctx.prev.planned : Math.max(ctx.prev.actual, 0.6 * ctx.prev.planned);
      var capPrev = Math.max(MIN_KM * bw.sessions.length, 1.10 * floorPrev);
      if (capPrev < maxTotal) { maxTotal = capPrev; problems.push('plafonat la +10% față de ce ai alergat efectiv săptămâna trecută'); }
    }
    bw.sessions.forEach(function (b) {
      var c = cur.sessions.filter(function (x) { return x.day === b.day; })[0];
      var date = sessionDate(week, b.day);
      var frozen = date < ctx.today || (date === ctx.today && ctx.doneDates[date]);
      var p = (proposal || []).filter(function (x) { return x && x.day === b.day; })[0];
      var s = { day: b.day, kind: c.kind, km: c.km, note: '' , frozen: false, fixed: false};
      if (b.kind === 'race') { out.push({ day: b.day, kind: 'race', km: b.km, note: '', fixed: true }); return; }
      if (frozen) { out.push({ day: b.day, kind: c.kind, km: c.km, note: '', frozen: true }); return; }
      var kind = p && RANK[p.kind] !== undefined ? p.kind : (ctx.niggleSev >= 3 && week === ctx.curWeek ? 'rest' : b.kind);
      var km = p && isFinite(+p.km) ? +p.km : b.km;
      if (kind === 'race') kind = b.kind;
      if (kind === 'rest') {
        if (ctx.niggleSev >= 2) { km = 0; }
        else { kind = 'easy'; km = Math.max(MIN_KM, Math.min(km, b.km)); problems.push('odihna nu e permisă fără o durere activă de nivel ≥2; am pus o alergare ușoară de 5 km'); }
      }
      if (kind !== 'rest') {
        if (RANK[kind] > RANK[b.kind] || (kind === 'long' && b.kind !== 'long')) { problems.push(DAY_RO[b.day] + ': intensitate mai mare decât în plan, refuzată'); kind = b.kind; }
        if (ctx.noQuality && RANK[kind] >= 1) { kind = 'easy'; problems.push(DAY_RO[b.day] + ': fără calitate cât timp ai durere/oboseală mare'); }
        var cap = b.km * (ctx.ahead ? 1.1 : 1);
        if (ctx.niggleSev >= 3) cap = Math.min(cap, 6);
        km = Math.min(km, cap); km = Math.max(MIN_KM, round05(km));
      }
      var nt = (p && p.note ? String(p.note) : '').slice(0, 140);
      out.push({ day: b.day, kind: kind, km: km, note: nt });
    });
    // plafon total: scalăm doar sesiunile libere, cu minim 5 km
    function total() { return out.reduce(function (s, x) { return s + x.km; }, 0); }
    if (total() > maxTotal + 0.01) {
      var fixed = out.filter(function (x) { return x.fixed || x.frozen; }).reduce(function (s, x) { return s + x.km; }, 0);
      var flex = out.filter(function (x) { return !x.fixed && !x.frozen && x.kind !== 'rest'; });
      var excess = flex.reduce(function (s, x) { return s + Math.max(0, x.km - MIN_KM); }, 0);
      var room = maxTotal - fixed - MIN_KM * flex.length;
      var f = excess > 0 ? Math.max(0, Math.min(1, room / excess)) : 0;
      flex.forEach(function (x) { var nk = Math.max(MIN_KM, round05(MIN_KM + (x.km - MIN_KM) * f)); if (nk < x.km && !x.note) x.note = 'volum redus'; x.km = nk; });
    }
    var t = Math.round(total() * 10) / 10;
    var same = out.every(function (x, i) { var b = bw.sessions[i]; return x.kind === b.kind && x.km === b.km; });
    return { sessions: out, problems: problems, total: t, sameAsBase: same, maxTotal: Math.round(maxTotal * 10) / 10 };
  }

  g.RunEngine = {
    START: START, DAY_RO: DAY_RO, KIND_RO: KIND_RO, GOAL: GOAL, DEFAULT_FIT: DEFAULT_FIT, MIN_KM: MIN_KM,
    iso: iso, parseISO: parseISO, addDays: addDays, dayDiff: dayDiff, weekOf: weekOf, clampWeek: clampWeek, sessionDate: sessionDate,
    weekRange: weekRange, fmtPace: fmtPace, fmtTime: fmtTime, parseTime: parseTime, MONTHS: MONTHS,
    hmpAt: hmpAt, zones: zones, paceText: paceText, fitnessFromResult: fitnessFromResult,
    baseWeek: baseWeek, effectiveWeek: effectiveWeek, runsInWeek: runsInWeek, weekStats: weekStats, lastRuns: lastRuns,
    ctxFor: ctxFor, validate: validate, fillTokens: fillTokens
  };
})(typeof window !== 'undefined' ? window : globalThis);
