/* RunIQ views */
(function (g) {
  'use strict';
  var A = g.A, E = g.RunEngine, esc = A.esc, I = A.I;
  var openWeeks = {};

  function runsOn(date) { return A.S.runs.filter(function (r) { return r.date === date; }); }
  function sumKm(rs) { return rs.reduce(function (s, r) { return s + r.km; }, 0); }
  function paceOf(r) { return r.sec > 0 && r.km > 0 ? E.fmtPace(r.sec / r.km) : '–'; }
  function status(s, today) {
    var rs = runsOn(s.date);
    if (rs.length) return { st: 'done', km: sumKm(rs), runs: rs };
    if (s.date < today) return { st: 'missed' };
    if (s.date === today) return { st: 'today' };
    return { st: 'future' };
  }
  function nextSession(from, today) {
    for (var w = from; w <= Math.min(52, from + 2); w++) {
      var ew = E.effectiveWeek(A.S, w), s = ew.sessions.filter(function (x) { return x.date > today; })[0];
      if (s) return { s: s, w: w };
    }
    return null;
  }
  function nextMilestone(today) {
    var m = g.FIXED_PLAN.milestones.filter(function (x) { return x.date >= today; })[0];
    return m || null;
  }
  function restText(today) {
    var d = E.parseISO(today).getDay();
    if (d === 3) return 'Forță 20 de minute: genuflexiuni, fandări, punți de fesieri, ridicări pe vârfuri, plank.';
    if (d === 6) return 'Zi liberă. Dacă urmează cursa sau lungul de duminică: culcă-te devreme, hidratează-te.';
    return 'Zi liberă. Recuperarea face parte din antrenament.';
  }
  function head(title, sub) { return '<div><h1>' + title + '</h1>' + (sub ? '<div class="sub" style="margin-top:3px">' + sub + '</div>' : '') + '</div>'; }

  /* ================= AZI ================= */
  function today() {
    var S = A.S, t = A.todayISO(), w0 = E.weekOf(t), h = '';
    if (w0 > 52) {
      return head('Plan încheiat', 'Ai terminat cele 52 de săptămâni.') + '<div class="hero done"><div class="kicker">Felicitări</div><div class="big">Maraton ✔</div><p>Poți exporta jurnalul din Setări.</p></div>';
    }
    var week = E.clampWeek(w0), ew = E.effectiveWeek(S, week), st = E.weekStats(S, week);
    h += head(A.fmtDate(t, true), w0 < 1 ? 'Planul începe luni, ' + A.fmtDate(E.START) : 'Săptămâna ' + week + ' din 52 · ' + esc(ew.phase));

    if (w0 < 1) {
      var left = E.dayDiff(E.parseISO(t), E.parseISO(E.START));
      var first = ew.sessions[0];
      h += '<div class="hero rest"><div class="kicker">Start în</div><div class="big">' + left + '<small>' + (left === 1 ? 'zi' : 'zile') + '</small></div>' +
        '<p>Prima alergare: <b>' + A.fmtDate(first.date, true) + '</b>, ' + A.fmtKm(first.km) + ' km ușor, ritm ' + esc(first.pace) + '.</p>' +
        '<div class="chips"><span class="chip">3 ieșiri în săptămânile 1–2</span><span class="chip">apoi 4/săpt.</span></div></div>';
    } else {
      var ts = ew.sessions.filter(function (x) { return x.date === t; })[0];
      if (ts) {
        var sx = status(ts, t);
        if (sx.st !== 'done' && ts.kind === 'rest') {
          h += '<div class="hero rest"><div class="kicker">Azi · odihnă (ajustat)</div><div class="big" style="font-size:32px">Zi liberă</div><p>' + esc(ts.detail) + '</p><div class="chips"><span class="chip">plan: ' + A.fmtKm(ts.baseKm) + ' km</span></div><div style="margin-top:14px"><button class="btn white sm" onclick="A.openLog(\'' + t + '\')">Am alergat totuși</button></div></div>';
        } else if (sx.st === 'done') {
          var r0 = sx.runs[0];
          h += '<div class="hero done"><div class="kicker">Făcut azi ✓</div><div class="big">' + A.fmtKm(sx.km) + '<small>km</small></div><p>' + paceOf(r0) + '/km' + (r0.hr ? ' · ' + r0.hr + ' bpm' : '') + ' · ' + A.FEEL[r0.feel] + ' ' + A.FEEL_TXT[r0.feel] + '. Planul era ' + A.fmtKm(ts.km) + ' km.</p></div>';
        } else {
          h += '<div class="hero"><div class="kicker">Azi · ' + esc(ts.label) + '</div><div class="big">' + A.fmtKm(ts.km) + '<small>km</small></div>' +
            '<p>' + esc(ts.detail) + '</p><div class="chips">' + (ts.pace ? '<span class="chip">⏱ ' + esc(ts.pace) + '</span>' : '') +
            (ts.changed ? '<span class="chip">ajustat (plan: ' + A.fmtKm(ts.baseKm) + ' km)</span>' : '') +
            (ts.kind === 'race' ? '<span class="chip">🏁 cursă / test</span>' : '') + '</div>' +
            '<div style="margin-top:16px"><button class="btn white block" onclick="A.openLog(\'' + t + '\')">' + I.check.replace('<svg', '<svg width="18" height="18"') + ' Am alergat</button></div></div>';
        }
      } else {
        var nx = nextSession(week, t);
        h += '<div class="hero rest"><div class="kicker">Zi liberă</div><div class="big" style="font-size:32px">Recuperare</div><p>' + restText(t) + '</p>' +
          (nx ? '<div class="chips"><span class="chip">Următoarea: ' + A.fmtDate(nx.s.date, true) + ' · ' + A.fmtKm(nx.s.km) + ' km</span></div>' : '') + '</div>';
      }
    }

    // săptămâna
    if (w0 >= 1) {
      var pct = Math.min(100, Math.round(st.actual / Math.max(1, ew.total) * 100));
      h += '<div class="card"><div class="row between"><h2 style="margin:0">Săptămâna asta</h2><span class="badge ' + (ew.adjusted ? 'warn' : 'blue') + '">' + (ew.adjusted ? 'ajustată · ' : '') + A.fmtKm(ew.total) + ' km</span></div>' +
        '<div class="small muted" style="margin:6px 0 10px">' + ew.range + ' · ' + A.fmtKm(st.actual) + ' din ' + A.fmtKm(ew.total) + ' km</div><div class="bar ' + (pct >= 100 ? 'ok' : '') + '"><i style="width:' + pct + '%"></i></div>' +
        '<div class="days" style="grid-template-columns:repeat(' + ew.sessions.length + ',1fr)">' + ew.sessions.map(function (s) {
          var x = status(s, t), cls = x.st === 'done' ? 'done' : x.st === 'today' ? 'today' : x.st === 'missed' ? 'missed' : '';
          if (s.kind === 'race' && x.st !== 'done') cls += ' race';
          return '<div class="day ' + cls + '"><b>' + A.DSHORT[s.day] + '</b><span>' + (x.st === 'done' ? A.fmtKm(x.km) : A.fmtKm(s.km)) + '</span><small>' + (x.st === 'done' ? '✓ făcut' : s.kind === 'race' ? 'cursă' : s.kind === 'long' ? 'lung' : s.kind === 'rest' ? 'liber' : s.kind === 'easy' ? 'ușor' : esc(E.KIND_RO[s.kind].toLowerCase())) + '</small></div>';
        }).join('') + '</div></div>';
    }

    // coach / ajustări
    h += coachCard(week, w0);

    // forma + cursă
    var fit = fitnessCard(), nm = nextMilestone(t);
    if (nm) {
      var dl = E.dayDiff(E.parseISO(t), E.parseISO(nm.date));
      h += '<div class="card"><div class="row"><div class="grow"><div class="tiny" style="text-transform:uppercase;letter-spacing:.06em;font-weight:700">Următorul obiectiv</div><h2 style="margin:4px 0 2px">' + esc(nm.label) + '</h2>' +
        '<div class="small muted">' + A.fmtDate(nm.date, true) + ' · ' + esc(nm.target) + '</div></div><div style="text-align:right"><div style="font-size:30px;font-weight:800;color:var(--accent);line-height:1">' + dl + '</div><div class="tiny">' + (dl === 1 ? 'zi' : 'zile') + '</div></div></div></div>';
    }
    return h + fit;
  }

  function coachCard(week, w0) {
    var S = A.S, la = S.lastAdapt, h = '';
    var adj = [];
    [week, week + 1].forEach(function (w) { if (w >= 1 && w <= 52) { var e = E.effectiveWeek(S, w); if (e.adjusted) adj.push(e); } });
    if (!S.apiKey && !S.welcomed) {
      return '<div class="card"><h2>Coach AI</h2><div class="note info">Planul funcționează și fără AI. Cu o cheie Gemini, coach-ul îți analizează fiecare alergare și ajustează săptămâna curentă și următoarea, în limitele planului.</div><div style="margin-top:12px" class="row"><button class="btn sm" onclick="A.openSettings()">Adaugă cheia</button><button class="btn sm ghost" onclick="A.dismissWelcome()">Mai târziu</button></div></div>';
    }
    if (!la && !adj.length && !S.apiKey) return '';
    h += '<div class="card"><div class="row between"><h2 style="margin:0">Coach</h2>' + (la ? '<span class="badge ' + (la.source === 'gemini' ? 'acc' : '') + '">' + (la.source === 'gemini' ? 'Gemini' : 'reguli') + ' · ' + esc(A.fmtDate(la.date)) + '</span>' : '') + '</div>';
    if (la && la.alert) h += '<div class="note bad" style="margin-top:10px">⚠️ ' + esc(la.alert) + '</div>';
    if (la && la.assessment) h += '<p style="margin-top:10px">' + esc(la.assessment) + '</p>';
    else if (!adj.length) h += '<p class="muted small" style="margin-top:10px">Planul e neschimbat. Ajustările apar aici după alergările tale.</p>';
    if (adj.length) {
      h += '<div style="margin-top:10px;display:flex;flex-direction:column;gap:8px">' + adj.map(function (e) {
        var d = Math.round((e.total - e.baseTotal) * 10) / 10;
        return '<div class="note warn"><b>Săpt. ' + e.week + ':</b> ' + A.fmtKm(e.total) + ' km în loc de ' + A.fmtKm(e.baseTotal) + ' (' + (d > 0 ? '+' : '') + A.fmtKm(d) + ')' + (e.adjNote ? '<br><span class="small">' + esc(e.adjNote) + '</span>' : '') + '</div>';
      }).join('') + '</div><div style="margin-top:10px"><button class="btn sm line" onclick="A.revertAll()">Revino la planul de bază</button></div>';
    }
    if (w0 >= 1) h += '<div style="margin-top:12px"><button class="btn sm ghost" id="btn-adapt" onclick="A.adaptNow()">Verifică planul acum</button></div>';
    return h + '</div>';
  }

  function fitnessCard() {
    var S = A.S, t = A.todayISO(), week = E.clampWeek(E.weekOf(t)), f = S.fitness || E.DEFAULT_FIT;
    var now = E.hmpAt(S, week), start = E.DEFAULT_FIT.hmpSec, goal = E.GOAL.hmp;
    var pct = Math.max(0, Math.min(100, Math.round((start - f.hmpSec) / (start - goal) * 100)));
    return '<div class="card"><div class="row between"><h2 style="margin:0">Forma ta (semi)</h2><button class="btn sm ghost" onclick="A.openCalib()">Recalibrează</button></div>' +
      '<div class="row" style="margin:12px 0 8px;align-items:flex-end"><div style="font-size:32px;font-weight:800;letter-spacing:-.02em">' + E.fmtTime(f.hmpSec * 21.0975) + '</div><div class="muted small" style="padding-bottom:5px">acum → <b>1:50:00</b> țintă</div></div>' +
      '<div class="bar"><i style="width:' + pct + '%"></i></div><div class="tiny" style="margin-top:7px">Sursă: ' + esc(f.src) + '. Ritmurile din plan urmează forma asta și se strâng spre țintă cu ~1,4 s/km pe săptămână; testele le recalibrează.</div></div>';
  }

  /* ================= PLAN ================= */
  function plan() {
    var S = A.S, t = A.todayISO(), w0 = E.weekOf(t), cur = E.clampWeek(w0), h = '';
    h += head('Plan', '52 de săptămâni · luni, marți, vineri, duminică');
    var items = [], anyAdj = false;
    for (var w = 1; w <= 52; w++) {
      var ew = E.effectiveWeek(S, w), st = E.weekStats(S, w); if (ew.adjusted) anyAdj = true;
      items.push({ label: String(w), base: ew.baseTotal, plan: ew.total, act: st.actual, cur: w === cur && w0 >= 1 });
    }
    h += '<div class="card"><h2>Volum pe săptămâni</h2><div class="hscroll" id="volscroll">' + A.volumeChart(items, { every: 4 }) + '</div>' +
      '<div class="legend"><span><i style="background:var(--accent)"></i>plan (curent)</span><span><i style="background:var(--ok)"></i>alergat</span><span><i style="background:var(--ink2)"></i>planul de bază, dacă a fost ajustat</span></div>' +
      '<div class="row" style="margin-top:12px;flex-wrap:wrap">' + (w0 >= 1 ? '<button class="btn sm" id="btn-adapt" onclick="A.adaptNow()">Adaptează planul acum</button>' : '') + (anyAdj ? '<button class="btn sm line" onclick="A.revertAll()">Revino la planul de bază</button>' : '') + '</div></div>';
    // ritmuri
    var z = E.zones(S, cur);
    h += '<div class="card"><div class="row between"><h2 style="margin:0">Ritmuri · săpt. ' + cur + '</h2><button class="btn sm ghost" onclick="A.openCalib()">Recalibrează</button></div>' +
      '<div class="kv" style="margin-top:12px"><div><b>' + E.paceText(S, cur, 'easy').replace('/km', '') + '</b><span>ușor / lung</span></div><div><b>' + E.paceText(S, cur, 'tempo').replace('/km', '') + '</b><span>tempo</span></div>' +
      '<div><b>' + E.paceText(S, cur, 'interval').replace('/km', '') + '</b><span>intervale</span></div><div><b>' + E.fmtPace(z.hmp) + ' · ' + E.fmtPace(z.mp) + '</b><span>semi · maraton</span></div></div>' +
      '<div class="tiny" style="margin-top:10px">Calculate de aplicație din forma ta curentă. Pentru țintă la cursă: semi 5:13, maraton 5:41.</div></div>';
    // obiective
    h += '<div class="card"><h2>Obiective și curse</h2>' + g.FIXED_PLAN.milestones.map(function (m) {
      var left = E.dayDiff(E.parseISO(t), E.parseISO(m.date)), past = left < 0;
      return '<div class="row" style="padding:9px 0;border-top:1px solid var(--line);opacity:' + (past ? .5 : 1) + '"><div style="min-width:58px"><div class="bold" style="color:var(--accent)">' + E.parseISO(m.date).getDate() + ' ' + E.MONTHS[E.parseISO(m.date).getMonth()] + '</div><div class="tiny">' + (past ? 'trecut' : left === 0 ? 'azi' : left + ' zile') + '</div></div><div class="grow"><div class="bold">' + esc(m.label) + '</div><div class="small muted">' + esc(m.target) + '</div></div></div>';
    }).join('') + '</div>';
    // săptămâni
    h += '<div style="display:flex;flex-direction:column;gap:10px">';
    for (var k = 1; k <= 52; k++) h += weekCard(k, cur, w0, t);
    return h + '</div>';
  }
  function weekCard(w, cur, w0, t) {
    var S = A.S, ew = E.effectiveWeek(S, w), st = E.weekStats(S, w);
    var isCur = w === cur && w0 >= 1, past = w0 >= 1 && w < cur, open = openWeeks[w] !== undefined ? openWeeks[w] : isCur;
    var pct = past && ew.total ? Math.round(st.actual / ew.total * 100) : null;
    var h = '<div class="week ' + (isCur ? 'cur ' : '') + (past ? 'past ' : '') + (open ? 'open' : '') + '" id="wk' + w + '"><header onclick="A.toggleWeek(' + w + ')"><div class="wnum">' + w + '</div><div class="grow"><div class="bold">' + ew.range + (isCur ? ' <span class="badge acc">acum</span>' : '') + '</div><div class="small muted">' + esc(ew.phase) + '</div></div><div style="text-align:right"><div class="bold">' + A.fmtKm(ew.total) + ' km</div>' +
      (ew.adjusted ? '<span class="badge warn">ajustat</span>' : pct !== null && st.count ? '<span class="badge ' + (pct >= 90 ? 'ok' : pct >= 70 ? 'warn' : 'bad') + '">' + pct + '%</span>' : '') + '</div></header><div class="body">';
    if (ew.coachNote) h += '<div class="note info small" style="margin-bottom:6px">' + esc(ew.coachNote) + '</div>';
    if (ew.adjusted && ew.adjNote) h += '<div class="note warn small" style="margin-bottom:6px"><b>Ajustat:</b> ' + esc(ew.adjNote) + '</div>';
    ew.sessions.forEach(function (s) {
      var x = status(s, t);
      h += '<div class="sess ' + (s.changed ? 'changed' : '') + '"><div class="d">' + A.DSHORT[s.day] + '<i>' + E.parseISO(s.date).getDate() + ' ' + E.MONTHS[E.parseISO(s.date).getMonth()] + '</i></div><div class="grow"><div class="t">' + esc(s.label) + (x.st === 'done' ? ' <span class="badge ok">făcut ' + A.fmtKm(x.km) + ' km</span>' : x.st === 'missed' && w0 >= 1 ? ' <span class="badge">ratat</span>' : '') + '</div>' +
        '<div class="small muted">' + (s.pace ? '<b>' + esc(s.pace) + '</b> · ' : '') + esc(s.detail) + '</div></div><div class="km">' + A.fmtKm(s.km) + (s.changed ? '<div class="tiny" style="text-decoration:line-through">' + A.fmtKm(s.baseKm) + '</div>' : '') + '</div></div>';
    });
    return h + '</div></div>';
  }

  /* ================= JURNAL ================= */
  function log() {
    var S = A.S, rs = S.runs.slice().sort(function (a, b) { return b.ts - a.ts; });
    var tot = sumKm(rs), longest = rs.reduce(function (m, r) { return Math.max(m, r.km); }, 0);
    var h = head('Jurnal', rs.length ? rs.length + ' alergări înregistrate' : 'Nicio alergare încă') + '<button class="btn block" onclick="A.openLog()">' + I.plus.replace('<svg', '<svg width="18" height="18"') + ' Înregistrează o alergare</button>';
    if (!rs.length) return h + '<div class="card empty">După prima alergare apare aici, iar coach-ul o analizează.</div>';
    h += '<div class="kv"><div><b>' + A.fmtKm(tot) + ' km</b><span>total</span></div><div><b>' + A.fmtKm(longest) + ' km</b><span>cea mai lungă</span></div></div>';
    h += '<div class="card" style="padding:6px 16px">' + rs.map(function (r) {
      return '<div class="runitem" onclick="A.editRun(\'' + r.id + '\')"><div class="big">' + A.fmtKm(r.km) + '<small style="font-size:12px;color:var(--ink2);font-weight:600"> km</small></div><div class="grow"><div class="bold">' + A.fmtDate(r.date, true) + '</div><div class="small muted">' + paceOf(r) + '/km' + (r.sec ? ' · ' + E.fmtTime(r.sec) : '') + (r.hr ? ' · ' + r.hr + ' bpm' : '') + (r.notes ? ' · ' + esc(r.notes.slice(0, 40)) : '') + '</div></div><div style="font-size:22px">' + (A.FEEL[r.feel] || '') + '</div></div>';
    }).join('') + '</div>';
    return h;
  }

  /* ================= PROGRES ================= */
  function progress() {
    var S = A.S, t = A.todayISO(), w0 = E.weekOf(t), cur = E.clampWeek(w0), h = head('Progres', 'ce ai făcut față de plan');
    var rs = S.runs, tot = sumKm(rs);
    var paced = rs.filter(function (r) { return r.sec > 0 && r.km >= 3; });
    var ap = paced.length ? paced.reduce(function (s, r) { return s + r.sec / r.km; }, 0) / paced.length : 0;
    h += '<div class="kv"><div><b>' + A.fmtKm(tot) + ' km</b><span>total din 12 oct</span></div><div><b>' + rs.length + '</b><span>alergări</span></div><div><b>' + (ap ? E.fmtPace(ap) : '–') + '</b><span>ritm mediu</span></div><div><b>' + (S.body.length ? S.body[S.body.length - 1].kg + ' kg' : '–') + '</b><span>greutate</span></div></div>';
    var items = [], pts = [];
    for (var w = 1; w <= cur && w0 >= 1; w++) {
      var st = E.weekStats(S, w), ew = E.effectiveWeek(S, w);
      items.push({ label: String(w), base: ew.baseTotal, plan: ew.total, act: st.actual, cur: w === cur });
      if (st.avgPace) pts.push({ x: w, y: st.avgPace, label: 'S' + w });
    }
    h += '<div class="card"><h2>Kilometri: plan vs. alergat</h2>' + (items.length ? '<div class="hscroll">' + A.volumeChart(items, { every: 1, bw: 22 }) + '</div>' : '<div class="empty small">Apare după începerea planului.</div>') + '</div>';
    h += '<div class="card"><h2>Ritm mediu pe săptămână</h2>' + A.lineChart(pts, { invert: true, minSpan: 20, fmt: function (v) { return E.fmtPace(v); } }) + '<div class="tiny">Mai sus = mai rapid. Contează tendința, nu o săptămână.</div></div>';
    var bp = S.body.map(function (b, i) { return { x: i, y: b.kg, label: A.fmtDate(E.iso(new Date(b.ts))).split(' ')[0] + ' ' + A.fmtDate(E.iso(new Date(b.ts))).split(' ')[1] }; });
    h += '<div class="card"><div class="row between"><h2 style="margin:0">Greutate</h2><button class="btn sm ghost" onclick="A.openWeight()">+ Adaugă</button></div><div style="margin-top:8px">' + (bp.length > 1 ? A.lineChart(bp, { minSpan: 2, color: 'var(--blue)', fmt: function (v) { return v.toFixed(1); } }) : '<div class="empty small">' + (bp.length ? 'Ultima: ' + bp[0].y + ' kg. Adaugă încă o măsurătoare pentru grafic.' : 'Adaugă prima măsurătoare.') + '</div>') + '</div></div>';
    var ng = S.niggles.slice().sort(function (a, b) { return b.ts - a.ts; });
    h += '<div class="card"><div class="row between"><h2 style="margin:0">Dureri / semnale</h2><button class="btn sm ghost" onclick="A.openNiggle()">+ Adaugă</button></div>' +
      (ng.length ? ng.map(function (n) { return '<div class="row" style="padding:10px 0;border-top:1px solid var(--line)"><span class="badge ' + (n.sev >= 3 ? 'bad' : n.sev === 2 ? 'warn' : 'ok') + '">' + ['', 'ușor', 'mediu', 'sever'][n.sev] + '</span><div class="grow"><div class="bold">' + esc(n.area) + '</div><div class="small muted">' + A.fmtDate(E.iso(new Date(n.ts))) + (n.notes ? ' · ' + esc(n.notes) : '') + '</div></div>' + (n.active ? '<button class="btn sm ghost" onclick="A.resolveNiggle(\'' + n.id + '\')">Rezolvat</button>' : '<span class="tiny">rezolvat</span>') + '</div>'; }).join('') : '<div class="empty small">Nimic înregistrat. Durerile active reduc automat planul.</div>') + '</div>';
    return h;
  }

  /* ================= COACH ================= */
  var SUGG = ['Cum stau față de plan?', 'Mă doare gamba. Ce fac?', 'Pot muta alergarea de azi?', 'Ce mănânc înainte de lung?'];
  function coach() {
    var S = A.S, h = head('Coach', S.apiKey ? 'întreabă orice despre antrenament' : 'adaugă cheia Gemini în Setări');
    if (!S.apiKey) return h + '<div class="card"><div class="note info">Chat-ul folosește Gemini. Fără cheie, planul și ajustările pe reguli funcționează în continuare.</div><div style="margin-top:12px"><button class="btn" onclick="A.openSettings()">Adaugă cheia</button></div></div>';
    h += '<div class="chat" id="chatlist">' + (S.chat.length ? S.chat.map(function (m) { return '<div class="msg ' + (m.role === 'user' ? 'u' : 'a') + '">' + esc(m.text) + '</div>'; }).join('') : '<div class="card empty small">Încă nimic. Începe cu o întrebare:</div>') + '</div>';
    h += '<div class="suggest">' + SUGG.map(function (q) { return '<button onclick="A.ask(this.textContent)">' + esc(q) + '</button>'; }).join('') + '</div>';
    h += '<div class="chatbar"><input id="chatin" placeholder="Scrie un mesaj…" enterkeyhint="send" onkeydown="if(event.key===\'Enter\')A.ask()"><button class="btn" style="padding:0 16px" onclick="A.ask()" aria-label="Trimite">' + I.send.replace('<svg', '<svg width="20" height="20"') + '</button></div>';
    return h;
  }

  A.views = { today: today, plan: plan, log: log, progress: progress, coach: coach };
  A.openWeeks = openWeeks;
})(window);
