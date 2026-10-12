/* RunIQ history: import o singură dată din exportul Garmin Connect (Activities.csv). Date doar în browser, nu intră în plan. */
(function (g) {
  'use strict';
  function parseCSV(text) {
    var rows = [], row = [], f = '', q = false, i = 0, c;
    text = text.replace(/^﻿/, '');
    for (; i < text.length; i++) {
      c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
      else if (c === '"') q = true;
      else if (c === ',') { row.push(f); f = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); f = ''; if (row.length > 1 || row[0] !== '') rows.push(row); row = []; }
      else f += c;
    }
    if (f !== '' || row.length) { row.push(f); rows.push(row); }
    return rows;
  }
  function toSec(t) {
    var p = String(t || '').split(':').map(parseFloat); if (!p.length || p.some(isNaN)) return 0;
    return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p.length === 2 ? p[0] * 60 + p[1] : 0;
  }
  function num(x) { var v = parseFloat(String(x || '').replace(/,/g, '')); return isNaN(v) ? 0 : v; }
  // -> [{d:'YYYY-MM-DD', km, sec, hr}] doar alergări (inclusiv bandă), sortate crescător
  function parseGarmin(text) {
    var rows = parseCSV(text); if (rows.length < 2) throw new Error('fișier gol');
    var h = rows[0].map(function (x) { return x.trim(); });
    var iT = h.indexOf('Activity Type'), iD = h.indexOf('Date'), iK = h.indexOf('Distance'), iTm = h.indexOf('Time'), iH = h.indexOf('Avg HR');
    if (iT < 0 || iD < 0 || iK < 0 || iTm < 0) throw new Error('nu e un export Garmin (Activities.csv)');
    var out = [];
    rows.slice(1).forEach(function (r) {
      if (!/running/i.test(r[iT] || '')) return;
      var km = num(r[iK]), sec = toSec(r[iTm]), d = String(r[iD] || '').slice(0, 10);
      if (km < 1 || sec <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
      out.push({ d: d, km: Math.round(km * 100) / 100, sec: Math.round(sec), hr: iH >= 0 ? num(r[iH]) : 0 });
    });
    out.sort(function (a, b) { return a.d < b.d ? -1 : a.d > b.d ? 1 : 0; });
    return out;
  }
  function mondayOf(iso) { var d = new Date(iso + 'T12:00:00'), k = (d.getDay() + 6) % 7; d.setDate(d.getDate() - k); return d.toISOString().slice(0, 10); }
  function best(hist, lo, hi, target, raw) {
    var b = null;
    hist.forEach(function (r) {
      if (r.km < lo || r.km > hi) return;
      var t = raw ? r.sec : r.sec * target / r.km;
      if (!b || t < b.sec) b = { sec: Math.round(t), date: r.d };
    });
    return b;
  }
  function stats(hist, today) {
    if (!hist || !hist.length) return null;
    var wk = {}, mo = {};
    hist.forEach(function (r) { var w = mondayOf(r.d); wk[w] = wk[w] || { km: 0, n: 0 }; wk[w].km += r.km; wk[w].n++; var m = r.d.slice(0, 7); mo[m] = (mo[m] || 0) + r.km; });
    var peakW = null; Object.keys(wk).forEach(function (k) { if (!peakW || wk[k].km > peakW.km) peakW = { km: wk[k].km, week: k }; });
    var peakM = null; Object.keys(mo).forEach(function (k) { if (!peakM || mo[k] > peakM.km) peakM = { km: mo[k], month: k }; });
    var since = new Date(today + 'T12:00:00'); since.setDate(since.getDate() - 364);
    var s52 = since.toISOString().slice(0, 10), wk3 = 0, k52 = 0;
    Object.keys(wk).forEach(function (k) { if (k >= mondayOf(s52) && wk[k].n >= 3) wk3++; });
    hist.forEach(function (r) { if (r.d >= s52) k52 += r.km; });
    var months = [], d = new Date(today + 'T12:00:00'); d.setDate(1);
    for (var i = 23; i >= 0; i--) { var x = new Date(d.getFullYear(), d.getMonth() - i, 1), key = x.getFullYear() + '-' + ('0' + (x.getMonth() + 1)).slice(-2); months.push({ key: key, km: Math.round((mo[key] || 0) * 10) / 10, y: x.getFullYear(), m: x.getMonth() }); }
    return { n: hist.length, first: hist[0].d, last: hist[hist.length - 1].d, peakWeek: peakW, peakMonth: peakM, weeks3in52: wk3, km52: Math.round(k52),
      bestHm: best(hist, 20.8, 22, 21.0975, true), best10k: best(hist, 9.9, 10.6, 10), best5k: best(hist, 4.95, 5.6, 5), months: months };
  }
  g.RunHistory = { parseGarmin: parseGarmin, parseCSV: parseCSV, stats: stats };
})(typeof window !== 'undefined' ? window : globalThis);
