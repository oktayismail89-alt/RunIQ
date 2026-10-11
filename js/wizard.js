/* RunIQ wizard: „Plan nou" pentru orice țintă. Formularul e citit în `readForm`, calculul îl face RunPlanner. */
(function (g) {
  'use strict';
  var A = g.A, E = g.RunEngine, P = g.RunPlanner, esc = A.esc, $ = A.$;
  var DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], DRO = ['Lun', 'Mar', 'Mie', 'Joi', 'Vin', 'Sâm', 'Dum'];
  var DISTS = [['5k', '5 km'], ['10k', '10 km'], ['hm', 'Semi'], ['m', 'Maraton'], ['x', 'Altă']];
  var st = null, last = null;

  function defaults() {
    var today = A.todayISO();
    return { name: '', dist: 'hm', customKm: '', goal: '', raceDate: '', raceName: '', tune: [], fitKm: '10', fitTime: '', fitDate: '', level: '',
      days: ['Mon', 'Tue', 'Fri', 'Sun'], longDay: 'Sun', minKm: '5', weeklyKm: '', longest: '', start: P.nextMonday(today), notes: '' };
  }
  function chips(id, items, sel, multi, fn) {
    return '<div class="cbs" id="' + id + '">' + items.map(function (it) {
      var on = multi ? sel.indexOf(it[0]) >= 0 : sel === it[0];
      return '<button type="button" class="cb' + (on ? ' on' : '') + '" data-v="' + it[0] + '" onclick="' + fn + '(\'' + it[0] + '\')">' + it[1] + '</button>';
    }).join('') + '</div>';
  }
  function opts(items, sel) { return items.map(function (it) { return '<option value="' + it[0] + '"' + (it[0] === sel ? ' selected' : '') + '>' + it[1] + '</option>'; }).join(''); }

  function form() {
    var s = st;
    var tune = s.tune.map(function (t, i) {
      return '<div class="trow"><input type="date" id="t-d' + i + '" value="' + esc(t.date) + '"><input id="t-k' + i + '" inputmode="decimal" placeholder="km" value="' + esc(t.km) + '" style="max-width:70px"><input id="t-l' + i + '" placeholder="nume" value="' + esc(t.label) + '"><button type="button" class="btn sm ghost" onclick="A.wizDelTune(' + i + ')">✕</button></div>';
    }).join('');
    return '<h2>Plan nou</h2><div class="tiny" style="margin-bottom:6px">Alegi ținta, planul se construiește algoritmic și îți spun sincer dacă e realistă.</div>' +
      '<label>Nume (opțional)</label><input id="w-name" value="' + esc(s.name) + '" placeholder="ex. Semi București">' +
      '<label>Distanța cursei</label>' + chips('w-dist', DISTS, s.dist, false, 'A.wizDist') +
      '<div id="w-custom" style="' + (s.dist === 'x' ? '' : 'display:none') + '"><label>Distanță (km)</label><input id="w-ckm" inputmode="decimal" value="' + esc(s.customKm) + '" placeholder="ex. 15"></div>' +
      '<div class="g2"><div><label>Data cursei</label><input type="date" id="w-race" value="' + esc(s.raceDate) + '"></div><div><label>Timp țintă</label><input id="w-goal" placeholder="gol = confortabil" value="' + esc(s.goal) + '"></div></div>' +
      '<label>Numele cursei (opțional)</label><input id="w-rname" value="' + esc(s.raceName) + '">' +
      '<label>Curse intermediare</label>' + tune + '<div><button type="button" class="btn sm ghost" onclick="A.wizAddTune()">+ Adaugă cursă</button></div>' +
      '<label>Forma actuală (un rezultat recent)</label>' +
      '<div class="g2"><div><input id="w-fkm" inputmode="decimal" placeholder="km, ex. 10" value="' + esc(s.fitKm) + '"></div><div><input id="w-ftime" placeholder="timp, ex. 52:30" value="' + esc(s.fitTime) + '"></div></div>' +
      '<div class="tiny">Lasă timpul gol dacă nu ai un rezultat recent; folosesc nivelul.</div>' +
      '<label>Nivel</label><select id="w-level">' + opts([['', 'Automat'], ['b', 'Începător'], ['i', 'Intermediar'], ['e', 'Avansat']], s.level) + '</select>' +
      '<label>Zile de alergare (3–6)</label>' + chips('w-days', DAYS.map(function (d, i) { return [d, DRO[i]]; }), s.days, true, 'A.wizDay') +
      '<div class="g2"><div><label>Ziua lungului</label><select id="w-long">' + opts(DAYS.map(function (d, i) { return [d, DRO[i]]; }), s.longDay) + '</select></div><div><label>Minim km / alergare</label><select id="w-min">' + opts([3, 4, 5, 6, 7, 8].map(function (n) { return [String(n), String(n)]; }), s.minKm) + '</select></div></div>' +
      '<div class="g2"><div><label>Km / săptămână acum</label><input id="w-wk" inputmode="decimal" value="' + esc(s.weeklyKm) + '" placeholder="ex. 25"></div><div><label>Cel mai lung recent</label><input id="w-lg" inputmode="decimal" value="' + esc(s.longest) + '" placeholder="ex. 12"></div></div>' +
      '<label>Start (se aliniază la luni)</label><input type="date" id="w-start" value="' + esc(s.start) + '">' +
      '<label>Note pentru coach</label><textarea id="w-notes" rows="2" placeholder="accidentări, program, teren">' + esc(s.notes) + '</textarea>' +
      '<div id="w-out" style="margin-top:14px"></div>' +
      '<div class="row" style="margin-top:14px"><button class="btn" type="button" onclick="A.wizCalc()">Calculează</button><button class="btn ghost" type="button" onclick="A.closeSheet()">Anulează</button></div>';
  }
  function readForm() {
    var s = st, v = A.val;
    s.name = v('w-name'); s.customKm = v('w-ckm'); s.goal = v('w-goal'); s.raceDate = v('w-race'); s.raceName = v('w-rname');
    s.fitKm = v('w-fkm'); s.fitTime = v('w-ftime'); s.level = v('w-level'); s.longDay = v('w-long'); s.minKm = v('w-min');
    s.weeklyKm = v('w-wk'); s.longest = v('w-lg'); s.start = v('w-start'); s.notes = v('w-notes');
    s.tune = s.tune.map(function (t, i) { return { date: v('t-d' + i), km: v('t-k' + i), label: v('t-l' + i) }; });
  }
  function num(x) { return parseFloat(String(x).replace(',', '.')) || 0; }
  function toInput() {
    var s = st, inp = { name: s.name, days: DAYS.filter(function (d) { return s.days.indexOf(d) >= 0; }), longDay: s.longDay, minKm: num(s.minKm) || 5,
      weeklyKm: num(s.weeklyKm), longestKm: num(s.longest), raceDate: s.raceDate, raceName: s.raceName, startDate: s.start || A.todayISO(), notes: s.notes, level: s.level || undefined };
    if (s.dist === 'x') inp.km = num(s.customKm); else inp.dist = s.dist;
    if (s.goal) inp.goalSec = A.timeSec(s.goal);
    var fsec = s.fitTime ? A.timeSec(s.fitTime) : 0;
    if (fsec > 0 && num(s.fitKm) > 0) inp.fit = { km: num(s.fitKm), sec: fsec, date: s.fitDate || A.todayISO() };
    inp.tune = s.tune.filter(function (t) { return t.date && num(t.km) > 0; }).map(function (t) { return { date: t.date, km: num(t.km), label: t.label || (t.km + ' km') }; });
    return inp;
  }

  A.openWizard = function () { if (!st) st = defaults(); A.sheet(form()); };
  A.wizDist = function (v) { readForm(); st.dist = v; A.sheet(form()); };
  A.wizDay = function (d) {
    readForm(); var i = st.days.indexOf(d);
    if (i >= 0) st.days.splice(i, 1); else st.days.push(d);
    A.sheet(form());
  };
  A.wizAddTune = function () { readForm(); if (st.tune.length >= 5) { A.toast('Maxim 5 curse'); return; } st.tune.push({ date: '', km: '10', label: '' }); A.sheet(form()); };
  A.wizDelTune = function (i) { readForm(); st.tune.splice(i, 1); A.sheet(form()); };

  A.wizCalc = function () {
    readForm();
    var out = $('w-out'), inp = toInput();
    if (!inp.raceDate) { out.innerHTML = '<div class="note bad">Alege data cursei.</div>'; return; }
    if (!(inp.km || inp.dist)) { out.innerHTML = '<div class="note bad">Completează distanța.</div>'; return; }
    if (inp.goalSec === 0 && st.goal) { out.innerHTML = '<div class="note bad">Timp țintă invalid (ex. 1:50:00).</div>'; return; }
    var r;
    try { r = P.generate(inp); } catch (e) { out.innerHTML = '<div class="note bad">Eroare la generare: ' + esc(e.message) + '</div>'; return; }
    last = r;
    if (r.errors && r.errors.length) { out.innerHTML = r.errors.map(function (m) { return '<div class="note bad" style="margin-bottom:8px">' + esc(m) + '</div>'; }).join(''); last = null; return; }
    var ev = r.eval, cls = { deja: 'ok', realist: 'ok', ambitios: 'info', foarte: 'warn', nerealist: 'bad' }[ev.level] || 'info', sm = r.summary;
    var h = '<div class="note ' + cls + '"><b>' + esc(ev.level.toUpperCase()) + '</b> · ' + esc(ev.verdict) + '<div class="tiny" style="margin-top:6px">Țintă: ' + E.fmtTime(ev.goalSec) + ' · pornești de la: ' + esc(ev.src) + '</div></div>';
    if (ev.suggestSec) h += '<div class="note warn" style="margin-top:8px">Timp mai realist: <b>' + E.fmtTime(ev.suggestSec) + '</b> <button type="button" class="btn sm" style="margin-left:8px" onclick="A.wizUseTime(' + ev.suggestSec + ')">Folosește</button></div>';
    (r.warnings || []).forEach(function (m) { h += '<div class="note warn" style="margin-top:8px">' + esc(m) + '</div>'; });
    h += '<div class="kv" style="margin-top:10px"><div><b>' + sm.weeks + '</b><span>săptămâni</span></div><div><b>' + sm.peakKm + ' km</b><span>vârf săptămânal</span></div><div><b>' + sm.peakLong + ' km</b><span>cel mai lung</span></div><div><b>' + sm.races + '</b><span>curse / teste</span></div></div>';
    h += '<div class="tiny" style="margin-top:8px">' + sm.phases.filter(function (p) { return p[1] > 0; }).map(function (p) { return p[0] + ' ' + p[1] + ' săpt.'; }).join(' · ') + '</div>';
    var ws = r.plan.weeks.slice(0, 3).map(function (w, i) {
      var tot = w.sessions.reduce(function (a, s) { return a + s.km; }, 0);
      return '<div class="tiny">Săpt. ' + (i + 1) + ': ' + Math.round(tot) + ' km · ' + w.sessions.map(function (s) { return DRO[DAYS.indexOf(s.day)] + ' ' + s.km; }).join(', ') + '</div>';
    }).join('');
    h += '<div style="margin-top:8px">' + ws + '</div>';
    h += '<div class="note info" style="margin-top:10px">Crearea înlocuiește planul curent (îl poți reveni din tab-ul Plan). Alergările din jurnal rămân.</div>';
    h += '<div class="row" style="margin-top:10px"><button class="btn" type="button" onclick="A.wizCreate()">Creează planul</button></div>';
    out.innerHTML = h;
    out.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };
  A.wizUseTime = function (sec) { readForm(); st.goal = E.fmtTime(sec); A.sheet(form()); A.wizCalc(); };

  A.wizCreate = function () {
    if (!last || !last.plan) return;
    var S = A.S, r = last;
    S.archive = { plan: S.plan || null, adjust: S.adjust || {}, fitness: S.fitness || null, fitnessStart: S.fitnessStart || null, ts: Date.now() };
    S.plan = r.plan; S.adjust = {};
    S.fitness = { hmpSec: r.eval.anchor, week: 1, src: r.eval.src }; S.fitnessStart = r.eval.anchor;
    S.dismissed = {}; S.lastAdapt = null;
    E.usePlan(S); A.save(); A.closeSheet(); st = null; last = null;
    A.openWeeks = {}; A.tab = 'plan'; A.render(); window.scrollTo(0, 0);
    A.toast('Plan creat');
  };
  A.restorePlan = function () {
    var S = A.S, a = S.archive; if (!a) return;
    if (!confirm('Revii la planul anterior? Planul curent va fi păstrat ca arhivă.')) return;
    S.archive = { plan: S.plan || null, adjust: S.adjust || {}, fitness: S.fitness || null, fitnessStart: S.fitnessStart || null, ts: Date.now() };
    S.plan = a.plan; S.adjust = a.adjust || {}; S.fitness = a.fitness; S.fitnessStart = a.fitnessStart;
    S.dismissed = {}; S.lastAdapt = null;
    E.usePlan(S); A.save(); A.openWeeks = {}; A.render(); A.toast('Plan restaurat');
  };
})(window);
