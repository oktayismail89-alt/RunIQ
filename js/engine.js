/* RunIQ engine — logică pură, fără DOM. Planul de bază + ajustări validate în cod.
   Gemini PROPUNE; tot ce ajunge în plan trece prin validate(). */
(function (g) {
  'use strict';
  var DAY_IDX = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  var DAY_RO = { Mon: 'Luni', Tue: 'Marți', Wed: 'Miercuri', Thu: 'Joi', Fri: 'Vineri', Sat: 'Sâmbătă', Sun: 'Duminică' };
  var RANK = { easy: 0, long: 0, hmp: 1, rp: 1, tempo: 2, interval: 3, race: 9, rest: -1 };
  var KIND_RO = { easy: 'Alergare ușoară', long: 'Alergare lungă', tempo: 'Tempo', interval: 'Intervale', hmp: 'Ritm de semi', rp: 'Ritm de cursă', race: 'Cursă / test', rest: 'Odihnă' };
  var IMPROVE_DEFAULT = 1.4;                       // s/km pe săptămână, progresie realistă
  var PLAN = null;                                  // planul activ (setat de usePlan)

  /* planul inițial al lui Oktay rămâne ca presetare (zone "legacy", exact ca până acum) */
  function presetPlan() {
    return {
      id: 'preset-oktay', name: 'Semi 1:50 + Maraton sub 4:00', start: '2026-10-12', zones: 'legacy', improve: IMPROVE_DEFAULT,
      weeks: g.FIXED_PLAN.weeks, milestones: g.FIXED_PLAN.milestones,
      goal: { label: 'Semi 1:50 (mai 2027) · Maraton sub 4:00 (10 oct 2027)', km: 42.195, timeSec: 14400, hmp: 313, mp: 341, raceDate: '2027-10-10', dist: 'm' },
      defaultFit: { hmpSec: 355, week: 1, src: 'estimare (semi 2:05 în primăvară, 5:56/km)' },
      coachContext: 'Oktay: revine după pauză din mai 2026, 75 kg, 170 cm, semi PB 1:57 (2023), semiuri de 2:05 în primăvara 2026. Obiective: semi ~1:50 (acceptabil 1:55) în mai 2027 și maraton sub 4:00 (acceptabil 4:15) pe 10 oct 2027.'
    };
  }
  function setPlan(p) { PLAN = p; }
  function usePlan(S) { PLAN = (S && S.plan) || presetPlan(); return PLAN; }
  function plan() { return PLAN || usePlan(null); }
  function nWeeks() { return plan().weeks.length; }
  function startISO() { return plan().start; }
  function goal() { return plan().goal; }
  function defaultFit() { return plan().defaultFit; }
  var MIN_KM = 5;

  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseISO(s) { var a = s.split('-'); return new Date(+a[0], +a[1] - 1, +a[2]); }
  function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
  function dayDiff(a, b) { return Math.round((b - a) / 86400000); }
  function weekOf(dateISO) {
    var w = Math.floor(dayDiff(parseISO(plan().start), parseISO(dateISO)) / 7) + 1;
    return w;                                      // poate fi <1 sau >nWeeks (în afara planului)
  }
  function clampWeek(w) { return Math.max(1, Math.min(nWeeks(), w)); }
  function sessionDate(week, day) { return iso(addDays(parseISO(plan().start), (week - 1) * 7 + DAY_IDX[day])); }
  function weekRange(week) {
    var a = addDays(parseISO(plan().start), (week - 1) * 7), b = addDays(a, 6);
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
  function riegelPace(hPace, km) { return hPace * Math.pow(km / 21.0975, 0.06); }   // ritm/km la distanța km, dat ritmul de semi
  function hmpAt(S, week) {
    var f = S.fitness || defaultFit(), P = plan();
    var v = f.hmpSec - (P.improve || IMPROVE_DEFAULT) * Math.max(0, week - f.week);
    return Math.max(P.goal.hmp, v);
  }
  function racePace(S, week) {              // ritm la distanța țintă, pe forma la acea săptămână
    var h = hmpAt(S, week), km = plan().goal.km;
    if (km >= 35) return Math.max(plan().goal.mp || 0, h * 1.085);
    return riegelPace(h, km);
  }
  function zones(S, week) {
    var h = hmpAt(S, week), P = plan();
    if (P.zones === 'legacy') {
      return { hmp: h, mp: Math.max(P.goal.mp, h + 28), rp: h, easy: [h + 67, h + 107], tempo: [h + 22, h + 32], interval: [h - 3, h + 7] };
    }
    var p5 = riegelPace(h, 5), p10 = riegelPace(h, 10);
    return { hmp: h, mp: h * 1.085, rp: racePace(S, week), p5k: p5, p10k: p10, easy: [h + 60, h + 100], tempo: [h - 8, h + 2], interval: [p5, p5 + 8] };
  }
  function range(a) { return fmtPace(a[0]) + '–' + fmtPace(a[1]); }
  function paceText(S, week, kind) {
    var z = zones(S, week);
    if (kind === 'easy' || kind === 'long') return range(z.easy) + '/km';
    if (kind === 'tempo') return range(z.tempo) + '/km';
    if (kind === 'interval') return range(z.interval) + '/km';
    if (kind === 'hmp') return fmtPace(z.hmp) + '/km';
    if (kind === 'rp') return fmtPace(z.rp) + '/km';
    return '';
  }
  function zoneText(S, week, zn) {           // pentru pașii structurați
    var z = zones(S, week);
    if (zn === 'strides') return 'rapid, relaxat';
    if (zn === 'jog') return 'foarte lent';
    if (zn === 'walk') return 'mers';
    if (zn === 'mp') return fmtPace(z.mp) + '/km';
    if (zn === 'hmp') return fmtPace(z.hmp) + '/km';
    if (zn === 'rp') return fmtPace(z.rp) + '/km';
    if (zn === 'p10k') return fmtPace(z.p10k || z.hmp) + '/km';
    return paceText(S, week, zn);
  }
  // rezultat de test/cursă -> forma curentă (semi). Exponent mai prudent pentru distanțe scurte.
  function fitnessFromResult(km, sec) {
    if (km >= 35) return sec / 2.18 / 21.0975;                // maraton ≈ 2,18 × semi la nivel recreațional
    var e = km < 7 ? 1.07 : 1.06;
    return sec * Math.pow(21.0975 / km, e) / 21.0975;
  }
  function timeFromHm(hmSec, km) {                              // invers: ritm de semi -> timp la distanța km
    if (km >= 35) return hmSec * 21.0975 * 2.18 * (km / 42.195);
    var e = km < 7 ? 1.07 : 1.06;
    return hmSec * 21.0975 * Math.pow(km / 21.0975, e);
  }

  /* ---------- plan efectiv = bază + ajustări ---------- */
  function baseWeek(w) { return plan().weeks[clampWeek(w) - 1]; }
  function fillTokens(S, week, t) {
    var z = zones(S, week);
    return String(t || '').replace(/\{HMP\}/g, fmtPace(z.hmp)).replace(/\{MP\}/g, fmtPace(z.mp)).replace(/\{RP\}/g, fmtPace(z.rp));
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
    var bw = baseWeek(w), adj = (S.adjust || {})[w], moves = (adj && adj.moves) || {};
    var sessions = bw.sessions.map(function (b) {
      var a = adj && adj.sessions && adj.sessions.filter(function (x) { return x.day === b.day; })[0];
      var kind = a ? a.kind : b.kind, km = a ? a.km : b.km;
      var day = moves[b.day] || b.day;
      var changed = !!a && (kind !== b.kind || km !== b.km);
      return {
        day: day, baseDay: b.day, moved: day !== b.day, date: sessionDate(w, day), kind: kind, km: km, baseKm: b.km, baseKind: b.kind, changed: changed,
        label: b.kind === 'race' ? b.type : (b.label && kind === b.kind ? b.label : KIND_RO[kind]),
        pace: b.kind === 'race' ? fillTokens(S, w, b.pt || '') : paceText(S, w, kind),
        detail: describe(S, w, b, kind, km, changed && a.note ? a.note : ''),
        steps: b.steps && !changed ? b.steps.map(function (st) { return { t: st.t, n: st.n || 1, d: st.d, u: st.u, z: st.z, label: st.label || '', pace: zoneText(S, w, st.z), rec: st.rec ? { d: st.rec.d, u: st.rec.u, z: st.rec.z, pace: zoneText(S, w, st.rec.z) } : null }; }) : null
      };
    });
    sessions.sort(function (x, y) { return x.date < y.date ? -1 : x.date > y.date ? 1 : 0; });
    var total = sessions.reduce(function (s, x) { return s + x.km; }, 0);
    return {
      week: w, range: weekRange(w), phase: bw.phase, coachNote: bw.coachNote || '', sessions: sessions,
      total: Math.round(total * 10) / 10, baseTotal: bw.targetKm,
      adjusted: !!(adj && sessions.some(function (x) { return x.changed || x.moved; })),
      volumeAdjusted: sessions.some(function (x) { return x.changed; }),
      adjNote: adj ? adj.note : '', adjTs: adj ? adj.ts : 0, adjSrc: adj ? adj.src : ''
    };
  }

  /* ---------- mutarea unei sesiuni în alta zi a aceleiași săptămâni ---------- */
  function isHard(kind) { return kind === 'long' || kind === 'race' || (RANK[kind] !== undefined && RANK[kind] >= 1); }
  function validateMove(S, week, fromDay, toDay, today, doneDates) {
    doneDates = doneDates || {};
    var ew = effectiveWeek(S, week);
    var s = ew.sessions.filter(function (x) { return x.day === fromDay; })[0];
    if (!s) return { ok: false, reason: 'nu există sesiune în ziua aleasă' };
    if (s.baseKind === 'race') return { ok: false, reason: 'cursele și testele nu se mută' };
    if (s.kind === 'rest') return { ok: false, reason: 'e zi de odihnă' };
    if (toDay === fromDay) return { ok: false, reason: 'aceeași zi' };
    if (s.date < today || doneDates[s.date]) return { ok: false, reason: 'sesiunea e în trecut sau deja făcută' };
    var toDate = sessionDate(week, toDay);
    if (toDate < today) return { ok: false, reason: 'ziua aleasă a trecut' };
    if (ew.sessions.some(function (x) { return x.day === toDay; })) return { ok: false, reason: 'ziua e ocupată' };
    var hard = isHard(s.kind), ti = DAY_IDX[toDay];
    if (s.kind === 'long' && toDay !== 'Sat' && toDay !== 'Sun') return { ok: false, reason: 'lungul rămâne în weekend' };
    var others = ew.sessions.filter(function (x) { return x !== s; });
    for (var i = 0; i < others.length; i++) {
      var x = others[i], xi = DAY_IDX[x.day];
      if (Math.abs(xi - ti) === 1 && hard && isHard(x.kind)) return { ok: false, reason: 'ar fi două sesiuni grele consecutive' };
      if (x.baseKind === 'race' && xi - ti === 1) return { ok: false, reason: 'ziua dinaintea cursei rămâne liberă' };
      if (x.kind === 'long' && xi - ti === 1 && hard) return { ok: false, reason: 'prea aproape de lung' };
    }
    return { ok: true, session: s, toDate: toDate };
  }
  function freeDays(S, week, fromDay, today, doneDates) {
    return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].filter(function (d) { return validateMove(S, week, fromDay, d, today, doneDates).ok; });
  }
  function applyMove(S, week, fromDay, toDay, today, doneDates, note) {
    var v = validateMove(S, week, fromDay, toDay, today, doneDates);
    if (!v.ok) return v;
    S.adjust = S.adjust || {};
    var adj = S.adjust[week] = S.adjust[week] || { sessions: [], moves: {}, note: '', ts: Date.now(), src: 'mutare' };
    adj.moves = adj.moves || {};
    var base = v.session.baseDay;
    if (toDay === base) delete adj.moves[base]; else adj.moves[base] = toDay;
    adj.ts = Date.now();
    if (note) adj.note = adj.note ? adj.note + ' · ' + note : note;
    cleanup(S, week);
    return v;
  }
  function cleanup(S, week) {   // elimină ajustarea goală
    var adj = (S.adjust || {})[week]; if (!adj) return;
    var hasMoves = adj.moves && Object.keys(adj.moves).length;
    var hasSess = adj.sessions && adj.sessions.some(function (x) { var b = baseWeek(week).sessions.filter(function (q) { return q.day === x.day; })[0]; return b && (x.kind !== b.kind || x.km !== b.km); });
    if (!hasMoves && !hasSess) delete S.adjust[week];
  }
  function undoMove(S, week, baseDay) {
    var adj = (S.adjust || {})[week]; if (!adj || !adj.moves) return; delete adj.moves[baseDay]; cleanup(S, week);
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
      var c = cur.sessions.filter(function (x) { return x.baseDay === b.day; })[0];
      var date = c.date;
      var frozen = date < ctx.today || (date === ctx.today && ctx.doneDates[date]);
      var p = (proposal || []).filter(function (x) { return x && (x.day === b.day || x.day === c.day); })[0];
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
    DAY_RO: DAY_RO, KIND_RO: KIND_RO, MIN_KM: MIN_KM, IMPROVE_DEFAULT: IMPROVE_DEFAULT,
    presetPlan: presetPlan, setPlan: setPlan, usePlan: usePlan, plan: plan, nWeeks: nWeeks, startISO: startISO, goal: goal, defaultFit: defaultFit,
    iso: iso, parseISO: parseISO, addDays: addDays, dayDiff: dayDiff, weekOf: weekOf, clampWeek: clampWeek, sessionDate: sessionDate,
    weekRange: weekRange, fmtPace: fmtPace, fmtTime: fmtTime, parseTime: parseTime, MONTHS: MONTHS, riegelPace: riegelPace,
    hmpAt: hmpAt, racePace: racePace, timeFromHm: timeFromHm, zones: zones, paceText: paceText, zoneText: zoneText, fitnessFromResult: fitnessFromResult,
    baseWeek: baseWeek, effectiveWeek: effectiveWeek, runsInWeek: runsInWeek, weekStats: weekStats, lastRuns: lastRuns,
    ctxFor: ctxFor, validate: validate, fillTokens: fillTokens, validateMove: validateMove, freeDays: freeDays, applyMove: applyMove, undoMove: undoMove, cleanup: cleanup, isHard: isHard, DAY_IDX: DAY_IDX
  };
})(typeof window !== 'undefined' ? window : globalThis);
