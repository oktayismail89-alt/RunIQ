/* RunIQ core: stare, utilitare, iconițe, grafice SVG */
(function (g) {
  'use strict';
  var E = g.RunEngine;
  var KEY = 'runiq_v4';
  var A = g.A = {};                                  // API global pentru onclick
  var S = A.S = null;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function $(id) { return document.getElementById(id); }
  function todayISO() { return E.iso(new Date()); }
  var WD = ['Duminică', 'Luni', 'Marți', 'Miercuri', 'Joi', 'Vineri', 'Sâmbătă'];
  var DSHORT = { Mon: 'Lun', Tue: 'Mar', Wed: 'Mie', Thu: 'Joi', Fri: 'Vin', Sat: 'Sâm', Sun: 'Dum' };
  function fmtDate(iso, withWd) {
    var d = E.parseISO(iso);
    return (withWd ? WD[d.getDay()] + ', ' : '') + d.getDate() + ' ' + E.MONTHS[d.getMonth()] + (d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : '');
  }
  function fmtKm(x) { return (Math.round(x * 10) / 10).toString().replace('.', ','); }
  var FEEL = ['', '😄', '🙂', '😐', '😓', '🥵'];
  var FEEL_TXT = ['', 'foarte ușor', 'ușor', 'ok', 'greu', 'epuizant'];

  /* ---------- stare ---------- */
  function fresh() { return { v: 4, apiKey: '', fitness: null, runs: [], adjust: {}, body: [], niggles: [], chat: [], lastAdapt: null, welcomed: false }; }
  function migrate() {
    var st = fresh();
    try {
      var old = JSON.parse(localStorage.getItem('runiq_v3') || 'null');
      if (old) {
        st.apiKey = (old.profile && old.profile.apiKey) || '';
        (old.runs || []).forEach(function (r) {
          var ts = r.ts || Date.now(), d = new Date(ts);
          st.runs.push({ id: 'm' + ts, ts: ts, date: E.iso(d), km: +r.dist || 0, sec: E.parseTime(r.dur), hr: r.hr || 0, cad: r.cadence || 0, feel: r.feel || 3, notes: r.notes || '' });
        });
        (old.bodyStats || []).forEach(function (b) { if (b.weight) st.body.push({ ts: b.ts || Date.now(), kg: b.weight }); });
        (old.niggles || []).forEach(function (n) { st.niggles.push({ id: 'n' + (n.ts || Date.now()), ts: n.ts || Date.now(), area: n.area, sev: n.severity || 1, notes: n.notes || '', active: n.active !== false }); });
        st.migrated = true;
      }
    } catch (e) { }
    return st;
  }
  function load() {
    var st = null;
    try { st = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { }
    if (!st || st.v !== 4) st = migrate();
    ['runs', 'body', 'niggles', 'chat'].forEach(function (k) { if (!Array.isArray(st[k])) st[k] = []; });
    if (!st.adjust) st.adjust = {};
    A.S = S = st;
    return st;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { } }
  var toastT;
  function toast(msg) {
    var t = $('toast'); t.textContent = msg; t.classList.add('on');
    clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('on'); }, 2600);
  }

  /* ---------- iconițe ---------- */
  function ic(d, extra) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"' + (extra || '') + '>' + d + '</svg>'; }
  var I = {
    today: ic('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    plan: ic('<rect x="3" y="4" width="18" height="17" rx="3"/><path d="M8 2v4M16 2v4M3 10h18"/>'),
    log: ic('<path d="M4 6h16M4 12h16M4 18h10"/>'),
    chart: ic('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
    coach: ic('<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>'),
    gear: ic('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
    logo: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 16c3 0 3.6-6 6.3-6 2.4 0 2 4 4.7 4 1.8 0 2.4-3 5-8"/></svg>',
    check: ic('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
    plus: ic('<path d="M12 5v14M5 12h14"/>'),
    flag: ic('<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>'),
    send: ic('<path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/>')
  };

  /* ---------- grafice SVG ---------- */
  function niceMax(v) { if (v <= 0) return 10; return Math.max(10, Math.ceil(v / 10) * 10); }
  // bare: items [{label, base, plan, act, cur}]
  function volumeChart(items, o) {
    o = o || {};
    var bw = o.bw || 14, gap = 4, H = o.h || 130, padT = 14, padB = 20, W = items.length * (bw + gap) + 8;
    var max = niceMax(Math.max.apply(null, items.map(function (x) { return Math.max(x.base || 0, x.plan || 0, x.act || 0); })));
    var y = function (v) { return padT + (H - padT - padB) * (1 - v / max); };
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="Volum săptămânal">';
    [0.5, 1].forEach(function (f) { s += '<line x1="0" x2="' + W + '" y1="' + y(max * f) + '" y2="' + y(max * f) + '" stroke="var(--line)" stroke-dasharray="3 4"/>'; });
    items.forEach(function (it, i) {
      var x = 4 + i * (bw + gap);
      var plan = it.plan || 0;
      s += '<rect x="' + x + '" y="' + y(plan) + '" width="' + bw + '" height="' + (H - padB - y(plan)) + '" rx="4" fill="' + (it.cur ? 'var(--accent)' : 'var(--accent-soft)') + '"' + (it.cur ? '' : ' stroke="var(--accent)" stroke-opacity=".35"') + '/>';
      if (it.base && Math.abs(it.base - plan) > 0.05) s += '<line x1="' + (x - 1) + '" x2="' + (x + bw + 1) + '" y1="' + y(it.base) + '" y2="' + y(it.base) + '" stroke="var(--ink2)" stroke-width="2" stroke-dasharray="3 2"/>';
      if (it.act > 0) s += '<rect x="' + (x + bw * .25) + '" y="' + y(it.act) + '" width="' + (bw * .5) + '" height="' + (H - padB - y(it.act)) + '" rx="3" fill="var(--ok)"/>';
      if (it.label && (i % (o.every || 4) === 0 || it.cur)) s += '<text x="' + (x + bw / 2) + '" y="' + (H - 6) + '" text-anchor="middle" font-size="9.5" fill="' + (it.cur ? 'var(--accent)' : 'var(--ink3)') + '" font-weight="' + (it.cur ? 700 : 400) + '">' + esc(it.label) + '</text>';
    });
    s += '<text x="2" y="10" font-size="9.5" fill="var(--ink3)">' + max + ' km</text></svg>';
    return s;
  }
  // linie: pts [{x:i, y:val, label}] ; invert=true => valori mici sus (ritm)
  function lineChart(pts, o) {
    o = o || {};
    if (pts.length < 2) return '<div class="empty small">Ai nevoie de cel puțin două puncte.</div>';
    var W = 320, H = o.h || 130, pl = 36, pr = 10, pt = 12, pb = 22;
    var ys = pts.map(function (p) { return p.y; }), mn = Math.min.apply(null, ys), mx = Math.max.apply(null, ys);
    if (mx - mn < (o.minSpan || 1)) { var m = (mx + mn) / 2; mn = m - (o.minSpan || 1) / 2; mx = m + (o.minSpan || 1) / 2; }
    var pad = (mx - mn) * .15; mn -= pad; mx += pad;
    var x0 = pts[0].x, x1 = pts[pts.length - 1].x || 1;
    var X = function (x) { return pl + (W - pl - pr) * (x1 === x0 ? .5 : (x - x0) / (x1 - x0)); };
    var Y = function (v) { var t = (v - mn) / (mx - mn); return pt + (H - pt - pb) * (o.invert ? t : 1 - t); };
    var fm = o.fmt || function (v) { return v.toFixed(1); };
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img">';
    [mn + pad, (mn + mx) / 2, mx - pad].forEach(function (v) { s += '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + Y(v) + '" y2="' + Y(v) + '" stroke="var(--line)" stroke-dasharray="3 4"/><text x="' + (pl - 5) + '" y="' + (Y(v) + 3) + '" text-anchor="end" font-size="9.5" fill="var(--ink3)">' + fm(v) + '</text>'; });
    s += '<polyline fill="none" stroke="' + (o.color || 'var(--accent)') + '" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" points="' + pts.map(function (p) { return X(p.x) + ',' + Y(p.y); }).join(' ') + '"/>';
    pts.forEach(function (p, i) { s += '<circle cx="' + X(p.x) + '" cy="' + Y(p.y) + '" r="3.5" fill="var(--card)" stroke="' + (o.color || 'var(--accent)') + '" stroke-width="2"/>'; if (p.label && (pts.length < 8 || i % Math.ceil(pts.length / 6) === 0 || i === pts.length - 1)) s += '<text x="' + X(p.x) + '" y="' + (H - 6) + '" text-anchor="middle" font-size="9.5" fill="var(--ink3)">' + esc(p.label) + '</text>'; });
    return s + '</svg>';
  }

  A.E = E; A.esc = esc; A.$ = $; A.todayISO = todayISO; A.fmtDate = fmtDate; A.fmtKm = fmtKm; A.FEEL = FEEL; A.FEEL_TXT = FEEL_TXT; A.DSHORT = DSHORT; A.WD = WD;
  A.load = load; A.save = save; A.toast = toast; A.I = I; A.volumeChart = volumeChart; A.lineChart = lineChart;
})(window);
