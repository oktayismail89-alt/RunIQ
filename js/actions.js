/* RunIQ actions: navigare, foi, înregistrare alergări, coach, setări */
(function (g) {
  'use strict';
  var A = g.A, E = g.RunEngine, AI = g.RunAI, esc = A.esc, $ = A.$, I = A.I;
  var TABS = [['today', 'Azi', I.today], ['plan', 'Plan', I.plan], ['log', 'Jurnal', I.log], ['progress', 'Progres', I.chart], ['coach', 'Coach', I.coach]];
  A.tab = 'today';
  var busy = false;

  function render(keepScroll) {
    var y = window.scrollY;
    $('view').innerHTML = A.views[A.tab]();
    $('nav').innerHTML = TABS.map(function (t) { return '<button class="' + (t[0] === A.tab ? 'on' : '') + '" onclick="A.go(\'' + t[0] + '\')">' + t[2] + t[1] + '</button>'; }).join('');
    if (keepScroll) window.scrollTo(0, y);
  }
  A.render = render;
  A.go = function (tab) {
    A.tab = tab; render(); window.scrollTo(0, 0);
    if (tab === 'plan') setTimeout(function () {
      var w = E.clampWeek(E.weekOf(A.todayISO())), el = $('wk' + w), vs = $('volscroll');
      if (vs) vs.scrollLeft = Math.max(0, (w - 1) * 18 - 120);
      if (el && w > 1 && E.weekOf(A.todayISO()) >= 1) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 70);
    }, 30);
    if (tab === 'coach') setTimeout(function () { window.scrollTo(0, document.body.scrollHeight); }, 30);
  };
  A.toggleWeek = function (w) {
    var el = $('wk' + w), open = !el.classList.contains('open');
    el.classList.toggle('open', open); A.openWeeks[w] = open;
  };

  /* ---------- foi ---------- */
  function sheet(html) { $('sheet').innerHTML = '<div class="grab"></div>' + html; $('scrim').classList.add('on'); }
  function closeSheet() { $('scrim').classList.remove('on'); }
  A.closeSheet = closeSheet;
  function pills(id, n, sel, labels) {
    var h = '<div class="pills" id="' + id + '">';
    for (var i = 1; i <= n; i++) h += '<button type="button" data-v="' + i + '" class="' + (i === sel ? 'on' : '') + '" onclick="A.pick(\'' + id + '\',' + i + ')">' + (labels ? labels[i] : i) + '</button>';
    return h + '</div>';
  }
  A.pick = function (id, v) { Array.prototype.forEach.call($(id).children, function (b) { b.classList.toggle('on', +b.dataset.v === v); }); };
  function pv(id) { var b = $(id).querySelector('.on'); return b ? +b.dataset.v : 0; }
  function val(id) { var e = $(id); return e ? e.value.trim() : ''; }
  function timeSec(s) { if (!s) return 0; if (s.indexOf(':') < 0) return Math.round(parseFloat(s.replace(',', '.')) * 60) || 0; return E.parseTime(s); }
  function raceKmFor(date) {
    var w = E.weekOf(date); if (w < 1 || w > 52) return 0;
    var b = E.baseWeek(w).sessions.filter(function (s) { return E.sessionDate(w, s.day) === date && s.kind === 'race'; })[0];
    if (!b) return 0; var m = String(b.tpl).match(/(\d+(?:,\d+)?)\s*km/); return m ? parseFloat(m[1].replace(',', '.')) : 0;
  }

  /* ---------- înregistrare / editare alergare ---------- */
  function runForm(r, isEdit) {
    r = r || { date: A.todayISO(), km: '', sec: 0, hr: '', cad: '', feel: 3, notes: '' };
    return '<h2>' + (isEdit ? 'Editează alergarea' : 'Înregistrează alergarea') + '</h2>' +
      '<label>Data</label><input type="date" id="f-date" value="' + r.date + '">' +
      '<div class="g2"><div><label>Distanță (km)</label><input id="f-km" inputmode="decimal" placeholder="6.0" value="' + (r.km || '') + '"></div><div><label>Timp</label><input id="f-time" placeholder="40:30 sau 1:05:00" value="' + (r.sec ? E.fmtTime(r.sec) : '') + '"></div></div>' +
      '<div class="g2"><div><label>Puls mediu</label><input id="f-hr" inputmode="numeric" placeholder="opțional" value="' + (r.hr || '') + '"></div><div><label>Cadență</label><input id="f-cad" inputmode="numeric" placeholder="opțional" value="' + (r.cad || '') + '"></div></div>' +
      '<label>Cum a fost?</label>' + pills('f-feel', 5, r.feel || 3, A.FEEL) + '<div class="tiny" style="margin-top:4px">1 = foarte ușor · 5 = epuizant</div>' +
      '<label>Note</label><textarea id="f-notes" rows="2" placeholder="Orice contează: vreme, dureri, cum au fost picioarele">' + esc(r.notes || '') + '</textarea>' +
      (isEdit ? '' : '<details><summary>Import din Strava (link public)</summary><div class="row" style="margin-top:8px"><input id="f-strava" placeholder="https://www.strava.com/activities/…"><button class="btn sm ghost" type="button" onclick="A.strava()">Importă</button></div><div class="tiny" id="strava-st" style="margin-top:6px"></div></details>');
  }
  A.openLog = function (date) {
    var r = date ? { date: date, km: '', sec: 0, hr: '', cad: '', feel: 3, notes: '' } : null;
    if (r) { var w = E.weekOf(date), s = w >= 1 && w <= 52 && E.effectiveWeek(A.S, w).sessions.filter(function (x) { return x.date === date; })[0]; if (s && s.kind !== 'rest') r.km = s.km; }
    sheet(runForm(r, false) + '<div style="margin-top:18px"><button class="btn block" id="f-save" onclick="A.saveRun()">Salvează</button></div>');
  };
  function readForm() {
    var km = parseFloat(val('f-km').replace(',', '.'));
    if (!(km > 0)) { A.toast('Completează distanța'); return null; }
    return { date: val('f-date') || A.todayISO(), km: Math.round(km * 100) / 100, sec: timeSec(val('f-time')), hr: parseInt(val('f-hr')) || 0, cad: parseInt(val('f-cad')) || 0, feel: pv('f-feel') || 3, notes: val('f-notes') };
  }
  A.saveRun = async function () {
    var d = readForm(); if (!d) return;
    var run = Object.assign({ id: 'r' + Date.now() + Math.floor(Math.random() * 1000), ts: Date.now() }, d);
    A.S.runs.push(run); A.save();
    var btn = $('f-save'); btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Coach-ul analizează…';
    var res;
    try { res = await AI.adapt(A.S, { run: run, reason: 'alergare nouă', today: A.todayISO() }); } catch (e) { res = { error: e.message, changes: [], source: 'reguli' }; }
    A.save(); render();
    var rk = raceKmFor(run.date);
    var pace = run.sec > 0 ? E.fmtPace(run.sec / run.km) + '/km' : '';
    var h = '<h2>Alergare salvată ✓</h2><div class="kv"><div><b>' + A.fmtKm(run.km) + ' km</b><span>distanță</span></div><div><b>' + (pace || '–') + '</b><span>ritm mediu</span></div></div>';
    if (res.runFeedback) h += '<div class="note ok" style="margin-top:12px">' + esc(res.runFeedback) + '</div>';
    if (res.assessment) h += '<p style="margin-top:12px">' + esc(res.assessment) + '</p>';
    if (res.alert) h += '<div class="note bad" style="margin-top:12px">⚠️ ' + esc(res.alert) + '</div>';
    if (res.changes && res.changes.length) h += '<div style="margin-top:12px;display:flex;flex-direction:column;gap:8px">' + res.changes.map(function (c) { return '<div class="note warn"><b>Săpt. ' + c.week + '</b> ajustată: ' + A.fmtKm(c.total) + ' km (plan ' + A.fmtKm(c.base) + ')' + (c.problems.length ? '<br><span class="small">' + esc(c.problems[0]) + '</span>' : '') + '</div>'; }).join('') + '</div>';
    else if (res.source === 'gemini') h += '<p class="muted small" style="margin-top:12px">Planul rămâne neschimbat.</p>';
    if (res.shift) h += '<div class="note warn" style="margin-top:12px">Ritmurile au fost încetinite cu ' + res.shift + ' s/km: forma ta actuală e mai slabă decât presupunea aplicația.</div>';
    if (res.error) h += '<div class="note info small" style="margin-top:12px">Gemini indisponibil (' + esc(res.error) + '). Am aplicat doar regulile din aplicație.</div>';
    else if (!A.S.apiKey) h += '<div class="note info small" style="margin-top:12px">Fără cheie Gemini nu primești feedback AI. Ajustările pe reguli rămân active.</div>';
    h += '<div style="margin-top:16px;display:flex;gap:8px;flex-wrap:wrap">' + (rk ? '<button class="btn" onclick="A.openCalib(' + rk + ',\'' + run.date + '\')">Recalibrează ritmurile după acest rezultat</button>' : '') + '<button class="btn ghost" onclick="A.closeSheet()">Gata</button></div>';
    sheet(h);
  };
  A.editRun = function (id) {
    var r = A.S.runs.filter(function (x) { return x.id === id; })[0]; if (!r) return;
    sheet(runForm(r, true) + '<div class="row" style="margin-top:18px"><button class="btn grow" onclick="A.updateRun(\'' + id + '\')">Salvează</button><button class="btn danger" onclick="A.deleteRun(\'' + id + '\')">Șterge</button></div>');
  };
  A.updateRun = function (id) {
    var d = readForm(); if (!d) return; var r = A.S.runs.filter(function (x) { return x.id === id; })[0];
    Object.assign(r, d); A.save(); closeSheet(); render(); A.toast('Actualizat');
  };
  A.deleteRun = function (id) {
    if (!confirm('Ștergi alergarea?')) return;
    A.S.runs = A.S.runs.filter(function (x) { return x.id !== id; }); A.save(); closeSheet(); render(); A.toast('Șters');
  };
  A.strava = async function () {
    var url = val('f-strava'), st = $('strava-st'), m = url.match(/strava\.com\/activities\/(\d+)/);
    if (!m) { st.textContent = 'Lipește un link de forma strava.com/activities/…'; return; }
    st.textContent = 'Se încarcă…';
    try {
      var resp = await fetch('https://api.allorigins.win/get?url=' + encodeURIComponent('https://www.strava.com/activities/' + m[1]));
      var data = await resp.json(), html = data.contents || '';
      var meta = function (n) { var x = html.match(new RegExp('<meta[^>]+(?:name|property)=["\']' + n + '["\'][^>]+content=["\']([^"\']+)["\']', 'i')); return x ? x[1] : ''; };
      var desc = meta('og:description') || meta('description'), dm = desc.match(/(\d+[.,]?\d*)\s*km/i), tm = desc.match(/(\d{1,2}:\d{2}(?::\d{2})?)/);
      if (!dm) throw new Error('Activitatea nu e publică sau nu am putut-o citi');
      $('f-km').value = dm[1].replace(',', '.'); if (tm) $('f-time').value = tm[1];
      st.textContent = 'Importat: ' + dm[1] + ' km' + (tm ? ' în ' + tm[1] : '') + '. Verifică valorile.';
    } catch (e) { st.textContent = 'Eroare: ' + e.message; }
  };

  /* ---------- recalibrare ---------- */
  A.openCalib = function (km, date) {
    var S = A.S, d = date || A.todayISO();
    sheet('<h2>Recalibrează forma</h2><p class="muted small" style="margin-bottom:6px">Introdu un rezultat recent dintr-o cursă sau un test făcut la efort maxim. Ritmurile din plan se refac din el. Nu pot deveni mai rapide decât ținta (semi 5:13).</p>' +
      '<label>Distanța rezultatului</label><select id="c-km" onchange="A.calibPrev()"><option value="5">5 km</option><option value="10">10 km</option><option value="21.0975">Semimaraton</option><option value="42.195">Maraton</option></select>' +
      '<div class="g2"><div><label>Timp</label><input id="c-time" placeholder="ex. 29:30" oninput="A.calibPrev()"></div><div><label>Data</label><input type="date" id="c-date" value="' + d + '"></div></div>' +
      '<div id="c-prev" class="note info" style="margin-top:14px">Introdu timpul.</div>' +
      '<div class="row" style="margin-top:16px"><button class="btn grow" id="c-ok" onclick="A.applyCalib()" disabled>Aplică</button><button class="btn ghost" onclick="A.resetCalib()">Estimarea inițială</button></div>');
    if (km) { var sel = $('c-km'), best = [5, 10, 21.0975, 42.195].reduce(function (b, x) { return Math.abs(x - km) < Math.abs(b - km) ? x : b; }, 5); sel.value = String(best); }
  };
  A.calibPrev = function () {
    var km = parseFloat($('c-km').value), sec = timeSec(val('c-time')), box = $('c-prev');
    if (!sec) { box.textContent = 'Introdu timpul.'; $('c-ok').disabled = true; return; }
    var h = E.fitnessFromResult(km, sec), pv = A.S.fitness || E.DEFAULT_FIT;
    var capped = h < E.GOAL.hmp;
    box.innerHTML = 'Semi echivalent: <b>' + E.fmtTime(h * 21.0975) + '</b> (' + E.fmtPace(h) + '/km)' + (capped ? '<br>Mai rapid decât ținta, ritmurile se opresc la 5:13.' : '') + '<br>Înainte: ' + E.fmtTime(pv.hmpSec * 21.0975) + '. Ușor: ' + E.fmtPace(Math.max(h, E.GOAL.hmp) + 67) + '–' + E.fmtPace(Math.max(h, E.GOAL.hmp) + 107) + '/km.';
    $('c-ok').disabled = false;
  };
  A.applyCalib = function () {
    var km = parseFloat($('c-km').value), sec = timeSec(val('c-time')), date = val('c-date') || A.todayISO();
    if (!sec) return;
    var h = E.fitnessFromResult(km, sec);
    A.S.fitness = { hmpSec: Math.max(E.GOAL.hmp, h), week: E.clampWeek(E.weekOf(date)), src: (km < 15 ? Math.round(km) + ' km' : km < 30 ? 'semi' : 'maraton') + ' ' + E.fmtTime(sec) + ' (' + A.fmtDate(date) + ')' };
    A.save(); closeSheet(); render(); A.toast('Ritmuri recalibrate');
  };
  A.resetCalib = function () { A.S.fitness = null; A.save(); closeSheet(); render(); A.toast('Revenit la estimarea inițială'); };

  /* ---------- adaptare ---------- */
  A.adaptNow = async function () {
    if (busy) return; busy = true;
    var btns = document.querySelectorAll('#btn-adapt'); btns.forEach(function (b) { b.disabled = true; b.innerHTML = '<span class="spin"></span> Se verifică…'; });
    try {
      var res = await AI.adapt(A.S, { reason: 'verificare cerută de utilizator', today: A.todayISO() });
      A.save(); render(true);
      A.toast(res.changes.length ? 'Plan ajustat: ' + res.changes.map(function (c) { return 'săpt. ' + c.week; }).join(', ') : res.error ? 'Gemini indisponibil, doar reguli: plan neschimbat' : 'Planul rămâne neschimbat');
    } catch (e) { A.toast('Eroare: ' + e.message); render(true); }
    busy = false;
  };
  A.revertAll = function () {
    if (!confirm('Revii la planul de bază pentru toate săptămânile ajustate?')) return;
    A.S.adjust = {}; A.save(); render(true); A.toast('Plan de bază restaurat');
  };
  A.dismissWelcome = function () { A.S.welcomed = true; A.save(); render(true); };

  /* ---------- chat ---------- */
  A.ask = async function (text) {
    var inp = $('chatin'), q = (typeof text === 'string' ? text : inp ? inp.value : '').trim();
    if (!q || busy) return; busy = true; if (inp) inp.value = '';
    A.S.chat.push({ role: 'user', text: q, ts: Date.now() }); render();
    var list = $('chatlist'); list.insertAdjacentHTML('beforeend', '<div class="msg a" id="typing"><span class="spin"></span></div>'); window.scrollTo(0, document.body.scrollHeight);
    try {
      var ans = await AI.chat(A.S, A.S.chat.slice(0, -1), q, A.todayISO());
      A.S.chat.push({ role: 'model', text: ans.trim(), ts: Date.now() });
    } catch (e) { A.S.chat.push({ role: 'model', text: 'Nu am putut răspunde: ' + e.message, ts: Date.now() }); }
    A.S.chat = A.S.chat.slice(-40); A.save(); busy = false; render(); window.scrollTo(0, document.body.scrollHeight);
  };

  /* ---------- greutate / dureri ---------- */
  A.openWeight = function () {
    sheet('<h2>Greutate</h2><label>Kilograme</label><input id="w-kg" inputmode="decimal" placeholder="75.0"><div style="margin-top:16px"><button class="btn block" onclick="A.saveWeight()">Salvează</button></div>');
  };
  A.saveWeight = function () {
    var kg = parseFloat(val('w-kg').replace(',', '.')); if (!(kg > 30 && kg < 250)) { A.toast('Valoare nevalidă'); return; }
    A.S.body.push({ ts: Date.now(), kg: Math.round(kg * 10) / 10 }); A.save(); closeSheet(); render(true); A.toast('Salvat');
  };
  A.openNiggle = function () {
    var areas = ['Gambă', 'Tendon Ahile', 'Genunchi', 'Șold', 'Talpă / fascită', 'Coapsă', 'Spate', 'Altceva'];
    sheet('<h2>Durere / semnal</h2><label>Zona</label><select id="n-area">' + areas.map(function (a) { return '<option>' + a + '</option>'; }).join('') + '</select>' +
      '<label>Cât de rău?</label>' + pills('n-sev', 3, 1, ['', '1 · ușor', '2 · mediu', '3 · sever']) +
      '<div class="tiny" style="margin-top:6px">Nivelul 2+ scoate calitatea și reduce volumul; nivelul 3 limitează fiecare alergare și permite odihnă.</div>' +
      '<label>Note</label><textarea id="n-notes" rows="2"></textarea><div style="margin-top:16px"><button class="btn block" onclick="A.saveNiggle()">Salvează și adaptează planul</button></div>');
    $('n-sev').querySelectorAll('button').forEach(function (b) { b.style.fontSize = '13px'; });
  };
  A.saveNiggle = async function () {
    A.S.niggles.push({ id: 'n' + Date.now(), ts: Date.now(), area: val('n-area'), sev: pv('n-sev') || 1, notes: val('n-notes'), active: true });
    A.save(); closeSheet(); await A.afterNiggle(); 
  };
  A.resolveNiggle = async function (id) {
    var n = A.S.niggles.filter(function (x) { return x.id === id; })[0]; if (n) n.active = false; A.save(); await A.afterNiggle();
  };
  A.afterNiggle = async function () {
    render(true);
    if (E.weekOf(A.todayISO()) >= 1) { try { await AI.adapt(A.S, { reason: 'durere raportată sau rezolvată', today: A.todayISO() }); A.save(); render(true); A.toast('Planul a fost reverificat'); } catch (e) { } }
  };

  /* ---------- setări ---------- */
  A.openSettings = function () {
    var S = A.S;
    sheet('<h2>Setări</h2><label>Cheie API Gemini</label><input id="s-key" type="password" autocomplete="off" placeholder="AIza…" value="' + esc(S.apiKey || '') + '"><div class="tiny" style="margin-top:5px">Se păstrează doar în acest browser. Obține una gratuit din Google AI Studio.</div>' +
      '<div class="row" style="margin-top:12px"><button class="btn grow" onclick="A.saveKey()">Salvează cheia</button><button class="btn ghost" onclick="A.testKey()">Testează</button></div><div class="tiny" id="s-st" style="margin-top:8px"></div>' +
      '<label>Date</label><div class="row" style="flex-wrap:wrap"><button class="btn sm ghost" onclick="A.exportData()">Exportă JSON</button><label class="btn sm ghost" style="margin:0;text-transform:none;letter-spacing:0;font-size:13px;color:var(--ink)">Importă<input type="file" accept="application/json" style="display:none" onchange="A.importData(this)"></label><button class="btn sm danger" onclick="A.resetAll()">Șterge tot</button></div>' +
      '<div class="tiny" style="margin-top:16px">RunIQ 4.0 · plan de bază fix, ajustat de Gemini în limite validate în cod.</div>');
  };
  A.saveKey = function () { A.S.apiKey = val('s-key'); A.save(); $('s-st').textContent = 'Salvat.'; render(true); };
  A.testKey = async function () {
    A.S.apiKey = val('s-key'); var st = $('s-st'); st.textContent = 'Se testează…';
    try { await AI.gemini(A.S, { models: ['gemini-2.5-flash-lite'], system: 'Răspunde scurt.', user: 'Spune "ok".', maxTokens: 20, thinking: 0 }); st.textContent = '✓ Cheia funcționează.'; A.save(); render(true); }
    catch (e) { st.textContent = 'Eroare: ' + e.message; }
  };
  A.exportData = function () {
    var b = new Blob([JSON.stringify(A.S, null, 2)], { type: 'application/json' }), a = document.createElement('a');
    a.href = URL.createObjectURL(b); a.download = 'runiq-' + A.todayISO() + '.json'; a.click();
  };
  A.importData = function (inp) {
    var f = inp.files[0]; if (!f) return; var rd = new FileReader();
    rd.onload = function () { try { var d = JSON.parse(rd.result); if (d.v !== 4) throw new Error('format necunoscut'); localStorage.setItem('runiq_v4', JSON.stringify(d)); A.load(); closeSheet(); render(); A.toast('Importat'); } catch (e) { A.toast('Fișier invalid: ' + e.message); } };
    rd.readAsText(f);
  };
  A.resetAll = function () { if (!confirm('Ștergi toate datele (alergări, greutate, chat)? Cheia API rămâne.')) return; var k = A.S.apiKey; localStorage.removeItem('runiq_v4'); A.load(); A.S.apiKey = k; A.save(); closeSheet(); render(); };

  /* ---------- pornire ---------- */
  async function autoAdapt() {
    var t = A.todayISO(), w0 = E.weekOf(t); if (w0 < 2 || w0 > 52) return;
    var la = A.S.lastAdapt; if (la && la.week === w0) return;
    try { await AI.adapt(A.S, { reason: 'săptămână nouă (verificare automată)', today: t }); A.save(); render(true); } catch (e) { }
  }
  function boot() {
    $('logo').innerHTML = I.logo; $('btn-settings').innerHTML = I.gear;
    $('btn-settings').onclick = A.openSettings;
    $('scrim').addEventListener('click', function (e) { if (e.target === $('scrim')) closeSheet(); });
    A.load(); A.save(); render(); autoAdapt();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(window);
