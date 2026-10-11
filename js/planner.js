/* RunIQ planner — generează un plan de antrenament pentru orice țintă. Algoritmic (nu LLM):
   perioadizare, volum cu descărcări, sesiuni de calitate pe fază, taper, curse intermediare, teste de calibrare. */
(function (g) {
  'use strict';
  var E = g.RunEngine;
  var DIST_KM = { '5k': 5, '10k': 10, 'hm': 21.0975, 'm': 42.195 };
  var DIST_RO = { '5k': '5 km', '10k': '10 km', 'hm': 'Semimaraton', 'm': 'Maraton' };
  var MIN_WEEKS = { '5k': 4, '10k': 6, 'hm': 8, 'm': 10 }, REC_WEEKS = { '5k': 8, '10k': 10, 'hm': 12, 'm': 16 };
  var PEAK = { '5k': { b: 24, i: 32, e: 45 }, '10k': { b: 28, i: 40, e: 55 }, 'hm': { b: 34, i: 48, e: 65 }, 'm': { b: 46, i: 62, e: 82 } };
  var LONG_PEAK = { '5k': { b: 10, i: 12, e: 14 }, '10k': { b: 12, i: 15, e: 18 }, 'hm': { b: 17, i: 20, e: 23 }, 'm': { b: 28, i: 32, e: 35 } };
  var RUNS_F = { 3: 0.8, 4: 1, 5: 1.12, 6: 1.2 };
  var TAPER = { 'm': [0.75, 0.6, 0.4], 'hm': [0.75, 0.5], '10k': [0.6], '5k': [0.6] };
  var LEVEL_HM = { b: 420, i: 360, e: 315 };               // ritm semi implicit (s/km) dacă nu ai un rezultat recent
  var LEVEL_KM = { b: 10, i: 24, e: 40 };
  var DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  var IDX = E.DAY_IDX;

  function r05(x) { return Math.round(x * 2) / 2; }
  function r1(x) { return Math.round(x * 10) / 10; }
  function lerp(a, b, t) { return a + (b - a) * Math.max(0, Math.min(1, t)); }
  function catOf(km) { return km <= 7.5 ? '5k' : km <= 15 ? '10k' : km < 30 ? 'hm' : 'm'; }
  function fmtKm(x) { return String(r1(x)).replace('.', ','); }
  function nextMonday(iso) { var d = E.parseISO(iso), k = (d.getDay() + 6) % 7; return k === 0 ? iso : E.iso(E.addDays(d, 7 - k)); }

  /* ---------- evaluarea ținței ---------- */
  function evaluate(inp) {
    var warnings = [], errors = [];
    var km = inp.km || DIST_KM[inp.dist], cat = catOf(km);
    var runs = inp.days.length, minKm = inp.minKm || 5;
    var start = nextMonday(inp.startDate);
    var rd = E.parseISO(inp.raceDate);
    var R = Math.floor(E.dayDiff(E.parseISO(start), rd) / 7) + 1;
    if (E.dayDiff(E.parseISO(start), rd) < 0) errors.push('Data cursei e înainte de start.');
    if (R < MIN_WEEKS[cat]) errors.push('Ai doar ' + R + ' săptămâni până la cursă. Pentru ' + DIST_RO[cat].toLowerCase() + ' trebuie cel puțin ' + MIN_WEEKS[cat] + '. Alege o dată mai târzie sau o distanță mai scurtă.');
    else if (R < REC_WEEKS[cat]) warnings.push('Timpul e scurt (' + R + ' săptămâni; recomandat ' + REC_WEEKS[cat] + '+). Planul e comprimat.');
    if (R > 70) errors.push('Cursa e prea departe (' + R + ' săptămâni). Alege o dată în următoarele ~70 de săptămâni.');
    if (runs < 3 || runs > 6) errors.push('Alege între 3 și 6 zile de alergare.');
    var wk = inp.weeklyKm > 0 ? inp.weeklyKm : null;
    // formă curentă
    var anchor, src, lvl;
    var volLvl = wk == null ? 'i' : wk < 18 ? 'b' : wk < 38 ? 'i' : 'e';
    if (inp.fit && inp.fit.sec > 0 && inp.fit.km > 0) {
      anchor = E.fitnessFromResult(inp.fit.km, inp.fit.sec); src = 'rezultat introdus: ' + fmtKm(inp.fit.km) + ' km în ' + E.fmtTime(inp.fit.sec);
      var fitLvl = anchor <= 330 ? 'e' : anchor <= 400 ? 'i' : 'b';          // semi ≲1:56 avansat, ≲2:20 intermediar
      lvl = inp.level || fitLvl;
    } else { lvl = inp.level || volLvl; anchor = LEVEL_HM[lvl]; src = 'estimare după nivel (' + { b: 'începător', i: 'intermediar', e: 'avansat' }[lvl] + '); introdu un rezultat recent pentru precizie'; }
    var V0 = Math.max(wk || LEVEL_KM[lvl], runs * minKm);
    var tw = TAPER[cat].length, B = R - tw;
    // țintă
    var goalHm, goalSec = inp.goalSec || 0, improve = E.IMPROVE_DEFAULT;
    var weeksForGain = Math.max(1, R - 1);
    var maxGain = improve * weeksForGain;
    if (goalSec > 0) goalHm = E.fitnessFromResult(km, goalSec);
    else { goalHm = anchor - 0.5 * maxGain; goalSec = Math.round(E.timeFromHm(goalHm, km)); }
    var needed = anchor - goalHm, ratio = needed / maxGain, level, verdict, suggest = null;
    if (needed <= 0) { level = 'deja'; verdict = 'Ținta e la nivelul tău actual sau sub el. Planul urmărește menținerea formei și o cursă bine pregătită.'; }
    else if (ratio <= 0.7) { level = 'realist'; verdict = 'Realist: îmbunătățirea cerută e sub ritmul de progres tipic (' + String(improve).replace('.', ',') + ' s/km pe săptămână).'; }
    else if (ratio <= 1.0) { level = 'ambitios'; verdict = 'Ambițios, dar posibil dacă faci aproape toate antrenamentele și eviți accidentările.'; }
    else if (ratio <= 1.4) { level = 'foarte'; verdict = 'Foarte ambițios: cere un progres peste media realistă. Fă un test la mijlocul planului și recalibrează.'; suggest = Math.round(E.timeFromHm(anchor - 0.9 * maxGain, km)); }
    else { level = 'nerealist'; verdict = 'Nerealist cu timpul și forma actuală. Un obiectiv mai sigur este mai jos.'; suggest = Math.round(E.timeFromHm(anchor - 0.9 * maxGain, km)); }
    // volum atins
    var peakTarget = PEAK[cat][lvl] * RUNS_F[runs];
    var reach = V0 * Math.pow(1.065, Math.max(0, B) * 0.8);
    var Vp = Math.max(Math.min(peakTarget, reach), V0 * 1.05, runs * minKm * 1.1);
    if (reach < peakTarget * 0.85 && B > 0) warnings.push('Din volumul actual (' + Math.round(V0) + ' km/săpt.) nu ajungi la volumul tipic pentru ' + DIST_RO[cat].toLowerCase() + ' în ' + B + ' săptămâni fără risc. Vârful planificat: ~' + Math.round(Vp) + ' km/săpt.');
    if (cat === 'm' && runs === 3) warnings.push('Maraton cu 3 alergări pe săptămână: posibil, dar cere lungi mari și disciplină; 4+ alergări sunt mai sigure.');
    if (inp.fit && inp.fit.date) { var ageDays = E.dayDiff(E.parseISO(inp.fit.date), E.parseISO(start)); if (ageDays > 180) warnings.push('Rezultatul introdus are peste 6 luni; forma reală poate fi alta. Fă un test în primele săptămâni.'); }
    return { errors: errors, warnings: warnings, km: km, cat: cat, runs: runs, minKm: minKm, start: start, R: R, B: B, tw: tw, lvl: lvl, anchor: anchor, src: src, V0: V0, Vp: Vp,
      goalHm: goalHm, goalSec: goalSec, improve: improve, needed: needed, level: level, verdict: verdict, suggestSec: suggest };
  }

  /* ---------- ritmuri aproximative (pentru dimensionarea sesiunilor) ---------- */
  function paceAt(ev, w) {
    var h = Math.max(ev.goalHm, ev.anchor - ev.improve * (w - 1));
    var p5 = E.riegelPace(h, 5);
    return { h: h, easy: h + 80, tempo: h - 3, interval: p5 + 4, rp: ev.km >= 35 ? h * 1.085 : E.riegelPace(h, ev.km) };
  }

  /* ---------- șabloane de calitate ---------- */
  function wuCd(early) { return early ? { wu: 1.5, cd: 1 } : { wu: 2, cd: 1.5 }; }
  function qStrides(budget, minKm, w) {
    var km = Math.max(minKm, r05(Math.min(budget, 8)));
    var n = Math.min(8, 4 + Math.floor(w / 3));
    return { kind: 'easy', label: 'Ușor + strides', km: km,
      tpl: 'Ușor, conversațional; la final ' + n + '×20" strides (rapid, relaxat), pauză 1\' mers.',
      steps: [{ t: 'work', d: r05(km - 0.3), u: 'km', z: 'easy', label: 'ușor' }, { t: 'work', n: n, d: 20, u: 's', z: 'strides', rec: { d: 60, u: 's', z: 'walk' } }] };
  }
  function qFartlek(budget, minKm, p, pc) {
    var n = Math.round(lerp(5, 10, p)), cc = wuCd(p < 0.3);
    var km = r05(cc.wu + cc.cd + n * (60 / pc.tempo) + n * (60 / pc.easy));
    return { kind: 'tempo', label: 'Fartlek ' + n + '×1\'', km: Math.max(minKm, km),
      tpl: n + '×1\' alert (efort ~10K), 1\' ușor între; încălzire ' + fmtKm(cc.wu) + ' km + relaxare ' + fmtKm(cc.cd) + ' km (incluse în km).',
      steps: [{ t: 'wu', d: cc.wu, u: 'km', z: 'easy' }, { t: 'work', n: n, d: 60, u: 's', z: 'tempo', rec: { d: 60, u: 's', z: 'easy' } }, { t: 'cd', d: cc.cd, u: 'km', z: 'easy' }] };
  }
  function qTempo(cat, budget, minKm, p, pc) {
    var D = Math.round(cat === 'hm' || cat === 'm' ? lerp(15, 40, p) : lerp(10, 25, p));
    var cc = wuCd(false), k = D <= 20 ? 1 : D <= 30 ? 2 : 3, block = Math.round(D / k);
    for (var guard = 0; guard < 30; guard++) {
      k = D <= 20 ? 1 : D <= 30 ? 2 : 3; block = Math.round(D / k);
      var km = cc.wu + cc.cd + (D * 60 / pc.tempo) + (k - 1) * (2 * 60 / pc.easy);
      if (km <= budget + 1.5 || D <= 10) break;
      D -= 2;
    }
    k = D <= 20 ? 1 : D <= 30 ? 2 : 3; block = Math.round(D / k);
    var tk = D * 60 / pc.tempo + (k - 1) * (2 * 60 / pc.easy);
    var km2 = r05(cc.wu + cc.cd + tk);
    return { kind: 'tempo', label: k === 1 ? 'Tempo ' + D + '\'' : 'Tempo ' + k + '×' + block + '\'', km: Math.max(minKm, km2),
      tpl: (k === 1 ? D + '\' continuu la ritm de tempo (greu, dar controlat)' : k + '×' + block + '\' la ritm de tempo, pauză 2\' jog') + '; încălzire ' + fmtKm(cc.wu) + ' km + relaxare ' + fmtKm(cc.cd) + ' km (incluse în km).',
      steps: [{ t: 'wu', d: cc.wu, u: 'km', z: 'easy' }, { t: 'work', n: k, d: block, u: 'min', z: 'tempo', rec: k > 1 ? { d: 2, u: 'min', z: 'jog' } : null }, { t: 'cd', d: cc.cd, u: 'km', z: 'easy' }] };
  }
  function qInterval(cat, budget, minKm, p, pc) {
    var ladder = (cat === '5k' || cat === '10k') ? [[6, 400, 60], [8, 400, 60], [5, 800, 90], [6, 800, 90], [5, 1000, 120], [6, 1000, 120], [4, 1200, 120], [5, 1200, 150]] : [[5, 800, 90], [6, 800, 90], [5, 1000, 120], [6, 1000, 120]];
    var it = ladder[Math.min(ladder.length - 1, Math.floor(p * ladder.length))], n = it[0], d = it[1], rec = it[2], cc = wuCd(false);
    var km = function () { return cc.wu + cc.cd + n * d / 1000 + n * (rec / 60) * 0.14; };
    while (km() > budget + 1.5 && n > 3) n--;
    return { kind: 'interval', label: 'Intervale ' + n + '×' + d + ' m', km: Math.max(minKm, r05(km())),
      tpl: n + '×' + d + ' m rapid (ritm de intervale), pauză ' + rec + '" jog; încălzire ' + fmtKm(cc.wu) + ' km + relaxare ' + fmtKm(cc.cd) + ' km (incluse în km).',
      steps: [{ t: 'wu', d: cc.wu, u: 'km', z: 'easy' }, { t: 'work', n: n, d: d, u: 'm', z: 'interval', rec: { d: rec, u: 's', z: 'jog' } }, { t: 'cd', d: cc.cd, u: 'km', z: 'easy' }] };
  }
  function qRace(cat, budget, minKm, p, pc) {
    var cc = wuCd(false), reps, d, rec, label;
    if (cat === '5k') { reps = Math.round(lerp(3, 5, p)); d = 1000; rec = 120; }
    else if (cat === '10k') { var o = [[4, 1600], [3, 2000], [4, 2000], [2, 3000]][Math.min(3, Math.floor(p * 4))]; reps = o[0]; d = o[1]; rec = 120; }
    else if (cat === 'hm') { var o2 = [[3, 3000], [3, 3000], [2, 5000], [1, 8000]][Math.min(3, Math.floor(p * 4))]; reps = o2[0]; d = o2[1]; rec = 150; }
    else { var o3 = [[2, 4000], [2, 5000], [1, 10000], [1, 12000]][Math.min(3, Math.floor(p * 4))]; reps = o3[0]; d = o3[1]; rec = 180; }
    var km = function () { return cc.wu + cc.cd + reps * d / 1000 + (reps - 1) * (rec / 60) * 0.14; };
    while (km() > budget + 2 && d > 1000 && reps > 1) { d -= (d > 3000 ? 1000 : 500); }
    label = reps === 1 ? fmtKm(d / 1000) + ' km la ritm de cursă' : reps + '×' + (d >= 1000 ? fmtKm(d / 1000) + ' km' : d + ' m') + ' la ritm de cursă';
    return { kind: 'rp', label: label.charAt(0).toUpperCase() + label.slice(1), km: Math.max(minKm, r05(km())),
      tpl: label + (reps > 1 ? ', pauză ' + rec + '" jog' : '') + '; încălzire ' + fmtKm(cc.wu) + ' km + relaxare ' + fmtKm(cc.cd) + ' km (incluse în km).',
      steps: [{ t: 'wu', d: cc.wu, u: 'km', z: 'easy' }, { t: 'work', n: reps, d: d, u: 'm', z: 'rp', rec: reps > 1 ? { d: rec, u: 's', z: 'jog' } : null }, { t: 'cd', d: cc.cd, u: 'km', z: 'easy' }] };
  }
  function qSharpen(cat, minKm) {
    var d = cat === '5k' ? 400 : cat === '10k' ? 800 : 1000, n = cat === 'm' ? 3 : 4, cc = wuCd(false);
    var km = cc.wu + cc.cd + n * d / 1000 + (n - 1) * 0.3;
    return { kind: 'rp', label: 'Ascuțire ' + n + '×' + d + ' m', km: Math.max(minKm, r05(km)),
      tpl: n + '×' + d + ' m la ritm de cursă, pauză 90" jog; scurt, ca să rămâi proaspăt; încălzire/relaxare incluse în km.',
      steps: [{ t: 'wu', d: cc.wu, u: 'km', z: 'easy' }, { t: 'work', n: n, d: d, u: 'm', z: 'rp', rec: { d: 90, u: 's', z: 'jog' } }, { t: 'cd', d: cc.cd, u: 'km', z: 'easy' }] };
  }

  /* ---------- plasarea zilelor ---------- */
  function pickQualityDays(days, longDay, q) {
    var li = IDX[longDay], out = [];
    var ok = function (d) { var i = IDX[d]; return d !== longDay && Math.abs(i - li) !== 1; };
    var cand = days.filter(ok);
    function score(d) { var dist = (li - IDX[d] + 7) % 7; return Math.abs(dist - 4.5); }
    cand.sort(function (a, b) { return score(a) - score(b) || IDX[a] - IDX[b]; });
    if (cand.length && q >= 1) out.push(cand[0]);
    if (q >= 2) { var c2 = cand.filter(function (d) { return Math.abs(IDX[d] - IDX[out[0]]) >= 2; }); if (c2.length) out.push(c2[0]); }
    return out;
  }

  /* ---------- construirea unei săptămâni ---------- */
  function buildWeek(ev, inp, S, w) {
    var cat = ev.cat;
    var vol = S.vol[w], phase = S.phase[w], type = S.type[w];
    var days = inp.days.slice().sort(function (a, b) { return IDX[a] - IDX[b]; }), n = days.length;
    var longDay = days.indexOf(inp.longDay) >= 0 ? inp.longDay : days[days.length - 1];
    var pc = paceAt(ev, w), minKm = ev.minKm;
    var early = w <= 2 && ev.lvl === 'b';
    var q = (type === 'taper' || type === 'race') ? 1 : (n >= 5 && (phase === 'build' || phase === 'spec') && type !== 'cut') ? 2 : 1;
    if (early) q = 1;
    var qd = pickQualityDays(days, longDay, q);
    var qBudget = Math.min(vol * (n >= 5 ? 0.17 : 0.22), 14);
    // calitate
    var sess = {};
    qd.forEach(function (d, k) {
      var idx = S.qIdx[phase] = (S.qIdx[phase] || 0) + 1, p = S.pFrac[w];
      var ses;
      if (type === 'taper' || type === 'race') ses = qSharpen(ev.cat, minKm);
      else if (early) ses = qStrides(qBudget, minKm, w);
      else if (phase === 'base') ses = (idx % 2 === 1) ? qStrides(qBudget, minKm, w) : qFartlek(qBudget, minKm, p, pc);
      else if (phase === 'build') {
        var seq = (ev.cat === '5k' || ev.cat === '10k') ? ['interval', 'tempo'] : ['tempo', 'tempo', 'interval'];
        var kindQ = seq[(idx - 1) % seq.length]; if (k === 1) kindQ = kindQ === 'tempo' ? 'interval' : 'tempo';
        ses = kindQ === 'interval' ? qInterval(ev.cat, qBudget, minKm, p, pc) : qTempo(ev.cat, qBudget, minKm, p, pc);
      } else {
        if (k === 0) ses = qRace(ev.cat, qBudget, minKm, p, pc);
        else ses = qTempo(ev.cat, qBudget, minKm, p, pc);
      }
      if (type === 'cut' && ses.kind !== 'easy') { /* descărcare: păstrăm calitatea dar o micșorăm */ ses = (ses.kind === 'interval') ? qInterval(ev.cat, qBudget * 0.8, minKm, Math.max(0, p - 0.25), pc) : ses; }
      sess[d] = ses;
    });
    // lung
    var wL = (n === 3 ? 0.42 : n === 4 ? 0.36 : n === 5 ? 0.32 : 0.28) + (cat === 'm' ? 0.10 : cat === 'hm' ? 0.04 : 0);
    var L = Math.min(vol * wL, S.longCap[w]); L = Math.max(minKm, r05(L));
    var long = { kind: 'long', label: '', km: L, tpl: 'Lung ' + fmtKm(L) + ' km, ușor', steps: null };
    if ((phase === 'spec') && type === 'build' && (ev.cat === 'hm' || ev.cat === 'm') && S.specLong[w]) {
      var Y = r05(Math.min(L * 0.5, ev.cat === 'm' ? lerp(6, 16, S.pFrac[w]) : lerp(3, 8, S.pFrac[w])));
      if (Y >= 3) { long.label = 'Lung cu ritm de cursă'; long.tpl = 'Lung ' + fmtKm(L) + ' km: primii ' + fmtKm(L - Y) + ' km ușor, ultimii ' + fmtKm(Y) + ' km la ritm de cursă ({RP}/km).'; long.steps = [{ t: 'work', d: r05(L - Y), u: 'km', z: 'long', label: 'ușor' }, { t: 'work', d: Y, u: 'km', z: 'rp' }]; }
    }
    sess[longDay] = long;
    // ușoare
    var easyDays = days.filter(function (d) { return !sess[d]; });
    var used = Object.keys(sess).reduce(function (s, d) { return s + sess[d].km; }, 0);
    var rem = Math.max(0, vol - used), li = IDX[longDay];
    var wts = easyDays.map(function (d) { return IDX[d] === (li + 1) % 7 ? 0.8 : 1; }), wsum = wts.reduce(function (a, b) { return a + b; }, 0) || 1;
    easyDays.forEach(function (d, i) {
      var km = Math.max(minKm, r05(rem * wts[i] / wsum));
      sess[d] = { kind: 'easy', label: '', km: km, tpl: 'Ușor, conversațional', steps: null };
    });
    // construire listă
    var list = days.map(function (d) {
      var s = sess[d]; var o = { day: d, type: s.label || E.KIND_RO[s.kind], kind: s.kind, km: s.km, tpl: s.tpl };
      if (s.label) o.label = s.label; if (s.steps) o.steps = s.steps;
      return o;
    });
    return list;
  }

  /* ---------- planul complet ---------- */
  function generate(inp) {
    var ev = evaluate(inp);
    if (ev.errors.length) return { errors: ev.errors, warnings: ev.warnings, eval: ev };
    var R = ev.R, B = ev.B, tw = ev.tw, cat = ev.cat, n = ev.runs;
    var startD = E.parseISO(ev.start);
    var raceDate = inp.raceDate;
    var S = { vol: [], phase: [], type: [], pFrac: [], longCap: [], specLong: [], qIdx: {} };
    // curse intermediare (în afara cursei finale)
    var tune = (inp.tune || []).filter(function (t) { return t.date < raceDate && E.dayDiff(startD, E.parseISO(t.date)) >= 0; });
    var tuneWeek = {}; tune.forEach(function (t) { tuneWeek[Math.floor(E.dayDiff(startD, E.parseISO(t.date)) / 7) + 1] = t; });
    // faze
    var fracBase = cat === 'hm' ? 0.35 : cat === 'm' ? 0.35 : 0.3, fracSpec = cat === 'm' ? 0.3 : 0.25;
    var nBase = B >= 10 ? Math.max(3, Math.round(B * fracBase)) : Math.max(2, Math.round(B * 0.25));
    var nSpec = B >= 10 ? Math.max(3, Math.round(B * fracSpec)) : Math.max(2, Math.round(B * 0.3));
    if (nBase + nSpec > B - 1) { nBase = Math.max(1, Math.floor((B - 1) * 0.4)); nSpec = Math.max(1, B - 1 - nBase); }
    var phases = [];
    for (var w = 1; w <= R; w++) {
      var ph = w > B ? 'taper' : w <= nBase ? 'base' : w > B - nSpec ? 'spec' : 'build';
      S.phase[w] = ph;
      var start = ph === 'base' ? 1 : ph === 'build' ? nBase + 1 : ph === 'spec' ? B - nSpec + 1 : B + 1;
      var len = ph === 'base' ? nBase : ph === 'build' ? B - nSpec - nBase : ph === 'spec' ? nSpec : tw;
      S.pFrac[w] = len > 1 ? (w - start) / (len - 1) : 1;
    }
    // volum: tendință liniară limitată la +10%/săpt., descărcări la fiecare a 4-a
    var trend = [], prevT = ev.V0;
    for (var w2 = 1; w2 <= B; w2++) {
      var T = B > 1 ? ev.V0 + (ev.Vp - ev.V0) * (w2 - 1) / (B - 1) : ev.V0;
      T = w2 === 1 ? ev.V0 : Math.min(T, prevT * 1.10); prevT = T; trend[w2] = T;
    }
    var peakReal = 0;
    for (var w3 = 1; w3 <= R; w3++) {
      var v, type = 'build';
      if (w3 > B) { v = ev.Vp * TAPER[cat][w3 - B - 1]; type = w3 === R ? 'race' : 'taper'; }
      else {
        v = trend[w3];
        if (B >= 7 && w3 > 1 && w3 % 4 === 0 && w3 < B - 1) { v = v * 0.78; type = 'cut'; }
        else peakReal = Math.max(peakReal, v);
      }
      var tw3 = tuneWeek[w3];
      if (tw3) { v *= 0.88; if (type === 'build') type = 'build'; }
      var prevTune = tuneWeek[w3 - 1];
      if (prevTune && type !== 'taper' && type !== 'race') v *= (prevTune.km >= 15 ? 0.7 : prevTune.km >= 8 ? 0.88 : 1);
      S.vol[w3] = Math.max(n * ev.minKm, v); S.type[w3] = type;
    }
    // lung: plafon progresiv
    var lp = LONG_PEAK[cat][ev.lvl] * (n === 3 ? 1.0 : 1.0), L0 = Math.max(inp.longestKm || 0, ev.minKm * 1.3), lastL = Math.min(L0, lp), specCount = 0;
    for (var w4 = 1; w4 <= R; w4++) {
      if (S.type[w4] === 'cut') S.longCap[w4] = Math.max(ev.minKm, lastL * 0.78);
      else if (w4 > B) S.longCap[w4] = Math.max(ev.minKm, lp * (S.type[w4] === 'race' ? 0.4 : TAPER[cat][w4 - B - 1] + 0.1));
      else { var up = Math.min(lp, lastL + Math.max(1.5, lastL * 0.1)); S.longCap[w4] = up; lastL = up; }
      if (S.phase[w4] === 'spec' && S.type[w4] === 'build') { specCount++; S.specLong[w4] = specCount % 2 === 0 || specCount === 1 && S.pFrac[w4] > 0.4; }
    }
    // construcție săptămâni
    var weeks = [], milestones = [], peakKmReal = 0, peakLongReal = 0;
    var pName = { base: 'Bază', build: 'Dezvoltare', spec: 'Specific ' + DIST_RO[cat].toLowerCase(), taper: 'Taper' };
    var testEvery = 8, nextTest = 6;
    for (var w5 = 1; w5 <= R; w5++) {
      var sessions = buildWeek(ev, inp, S, w5), wkType = S.type[w5];
      var monday = E.addDays(startD, (w5 - 1) * 7);
      var dateOf = function (d) { return E.iso(E.addDays(monday, IDX[d])); };
      var notes = [];
      // curse intermediare și finală
      var races = [];
      if (tuneWeek[w5]) races.push({ date: tuneWeek[w5].date, km: tuneWeek[w5].km, label: tuneWeek[w5].label || ('Cursă ' + fmtKm(tuneWeek[w5].km) + ' km'), final: false });
      if (w5 === R) races.push({ date: raceDate, km: ev.km, label: inp.raceName || ('Cursa țintă: ' + DIST_RO[cat].toLowerCase()), final: true });
      // test automat de calibrare
      if (R >= 14 && w5 === nextTest && w5 < R - 3 && !races.length && !tuneWeek[w5 + 1] && !tuneWeek[w5 - 1] && S.type[w5] !== 'cut') {
        var qd = sessions.filter(function (s) { return s.kind === 'tempo' || s.kind === 'interval' || s.kind === 'rp'; })[0] || sessions.filter(function (s) { return s.kind === 'easy'; })[0];
        if (qd) { races.push({ date: dateOf(qd.day), km: 5, label: 'Test 5 km', test: true }); }
        nextTest += testEvery;
      }
      races.forEach(function (rc) {
        var rd = E.parseISO(rc.date), dayName = DAYS[(rd.getDay() + 6) % 7];
        var wu = rc.km >= 15 ? 1.5 : rc.test ? 3 : 2.5, kmTot = r05(rc.km + (rc.final && rc.km >= 35 ? 0 : wu));
        var ses = sessions.filter(function (s) { return s.day === dayName; })[0];
        var raceSes = { day: dayName, type: rc.test ? 'Test 5 km' : 'Cursă', kind: 'race', km: kmTot,
          tpl: rc.test ? 'TEST 5 km (' + fmtKm(wu) + ' km încălzire + 5 km test), efort maxim constant' : (rc.final ? 'CURSA ȚINTĂ' : 'CURSĂ') + ' ' + fmtKm(rc.km) + ' km' + (rc.km >= 35 ? '' : ' (+ ~' + fmtKm(wu) + ' km încălzire)') + ' · ' + rc.label,
          pt: rc.test ? 'cât poți, constant' : 'țintă ≈ {RP}/km' };
        if (ses) sessions[sessions.indexOf(ses)] = raceSes;
        else {
          sessions.push(raceSes);
          // păstrăm numărul de alergări: scoatem cea mai scurtă sesiune ușoară
          var easies = sessions.filter(function (s) { return s.kind === 'easy' && s !== raceSes; }).sort(function (a, b) { return a.km - b.km; });
          if (easies.length && sessions.length > n) sessions.splice(sessions.indexOf(easies[0]), 1);
        }
        // în ziua/zilele dinaintea cursei: doar ușor
        sessions.forEach(function (s) {
          if (s === raceSes || s.kind === 'race') return;
          var gap = E.dayDiff(E.parseISO(dateOf(s.day)), rd);
          if (gap > 0 && gap <= (rc.km >= 15 || rc.final ? 2 : 1) && s.kind !== 'easy') { s.kind = 'easy'; s.type = E.KIND_RO.easy; s.km = Math.max(ev.minKm, Math.min(s.km, 6)); s.tpl = 'Ușor, scurt, ca să fii proaspăt la cursă'; delete s.steps; delete s.label; }
          else if (gap > 0 && gap <= 2 && s.kind === 'easy') { s.km = Math.max(ev.minKm, Math.min(s.km, 6)); }
          if (gap < 0 && rc.final) s.__drop = true;
          if (gap < 0 && !rc.final && rc.km >= 15 && Math.abs(gap) <= 2) { s.km = ev.minKm; if (s.kind !== 'easy') { s.kind = 'easy'; s.type = E.KIND_RO.easy; s.tpl = 'Recuperare după cursă, foarte ușor'; delete s.steps; delete s.label; } }
        });
        sessions = sessions.filter(function (s) { return !s.__drop; });
        milestones.push({ week: w5, date: rc.date, label: rc.label, target: rc.test ? 'referință pentru ritmuri (recalibrează forma)' : 'țintă ≈ ' + E.fmtTime(E.timeFromHm(paceAt(ev, w5).h, rc.km)) + (rc.final ? ' (obiectiv: ' + E.fmtTime(ev.goalSec) + ')' : '') });
      });
      sessions.sort(function (a, b) { return IDX[a.day] - IDX[b.day]; });
      if (races.length && w5 !== R) {              // cursa intermediară ține loc de volum: reducem sesiunile ușoare
        var tot0 = sessions.reduce(function (s, x) { return s + x.km; }, 0), excess = tot0 - S.vol[w5];
        sessions.filter(function (s) { return s.kind === 'easy'; }).sort(function (a, b) { return b.km - a.km; }).forEach(function (s) {
          if (excess <= 0) return; var cut = Math.min(excess, s.km - ev.minKm); if (cut > 0) { s.km = r05(s.km - cut); excess -= cut; }
        });
      }
      var total = r1(sessions.reduce(function (s, x) { return s + x.km; }, 0));
      peakKmReal = Math.max(peakKmReal, wkType === 'build' || wkType === 'cut' ? total : 0);
      sessions.forEach(function (s) { if (s.kind === 'long') peakLongReal = Math.max(peakLongReal, s.km); });
      // note
      var ph = S.phase[w5], first = (w5 === 1) || (S.phase[w5 - 1] !== ph);
      if (w5 === 1) notes.push('Start: ritm ușor, conversațional. Nu forța; prima săptămână stabilește ritmul planului.');
      if (first && ph === 'build') notes.push('Începe faza de dezvoltare: apar sesiuni de calitate mai serioase.');
      if (first && ph === 'spec') notes.push('Faza specifică: ritmuri apropiate de cele din cursă.');
      if (wkType === 'cut') notes.push('Descărcare: volum redus cu ~20%, ca să asimilezi antrenamentul.');
      if (wkType === 'taper') notes.push('Taper: volum mai mic, intensitate păstrată. Nu recupera nimic acum.');
      if (w5 === R) notes.push('Săptămâna cursei. Ziua de dinaintea cursei liberă sau foarte ușoară; somn, mâncare cunoscută, nimic nou. Primii 2–3 km cu 5–8 s/km mai lent decât ritmul țintă.');
      if (tuneWeek[w5]) notes.push('Cursă intermediară: ' + (tuneWeek[w5].label || fmtKm(tuneWeek[w5].km) + ' km') + '; tratează-o ca un test al formei.');
      var testRace = races.filter(function (r) { return r.test; })[0]; if (testRace) notes.push('Test de 5 km: după el recalibrezi ritmurile din plan.');
      weeks.push({ week: w5, range: E.weekRange ? undefined : '', phase: pName[ph] + (wkType === 'cut' ? ' (descărcare)' : wkType === 'race' ? ' · cursa' : ''), targetKm: total, sessions: sessions, coachNote: notes.join(' ') });
      weeks[weeks.length - 1].range = (function () { var b = E.addDays(monday, 6); return monday.getDate() + ' ' + E.MONTHS[monday.getMonth()] + ' – ' + b.getDate() + ' ' + E.MONTHS[b.getMonth()]; })();
    }
    var improve = Math.max(0.2, Math.min(E.IMPROVE_DEFAULT, ev.needed > 0 ? ev.needed / Math.max(1, R - 1) * 1.05 : 0.2));
    var goalLabel = (inp.km && !inp.dist ? fmtKm(inp.km) + ' km' : DIST_RO[cat]) + (inp.goalSec ? ' în ' + E.fmtTime(inp.goalSec) : ' (terminare)') + ' · ' + A_fmtDate(raceDate);
    var plan = {
      id: 'gen-' + Date.now(), name: (inp.name || (DIST_RO[cat] + (inp.goalSec ? ' ' + E.fmtTime(inp.goalSec) : ''))), start: ev.start, zones: 'std', improve: improve,
      weeks: weeks, milestones: milestones.sort(function (a, b) { return a.date < b.date ? -1 : 1; }),
      goal: { label: goalLabel, km: ev.km, timeSec: ev.goalSec, hmp: ev.goalHm, mp: ev.goalHm * 1.085, raceDate: raceDate, dist: cat },
      defaultFit: { hmpSec: ev.anchor, week: 1, src: ev.src },
      coachContext: 'Obiectiv: ' + goalLabel + '. Nivel: ' + { b: 'începător', i: 'intermediar', e: 'avansat' }[ev.lvl] + '; volum la start ~' + Math.round(ev.V0) + ' km/săpt.; ' + n + ' alergări pe săptămână (' + inp.days.join(', ') + '), lungul ' + inp.longDay + '. Forma de pornire: ' + ev.src + '.' + (inp.notes ? ' Note ale utilizatorului: ' + inp.notes : ''),
      input: inp
    };
    return { plan: plan, eval: ev, errors: [], warnings: ev.warnings,
      summary: { weeks: R, peakKm: Math.round(peakKmReal), peakLong: Math.round(peakLongReal), phases: [['Bază', nBase], ['Dezvoltare', Math.max(0, B - nBase - nSpec)], ['Specific', nSpec], ['Taper/cursă', tw]], races: plan.milestones.length } };
  }
  function A_fmtDate(iso) { var d = E.parseISO(iso); return d.getDate() + ' ' + E.MONTHS[d.getMonth()] + ' ' + d.getFullYear(); }

  g.RunPlanner = { generate: generate, evaluate: evaluate, DIST_KM: DIST_KM, DIST_RO: DIST_RO, nextMonday: nextMonday, catOf: catOf };
})(typeof window !== 'undefined' ? window : globalThis);
