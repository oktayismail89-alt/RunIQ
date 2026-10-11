/* RunIQ weather — prognoză Open-Meteo (gratuit, fără cheie) + sugestii de mutare calculate în cod */
(function (g) {
  'use strict';
  var E = g.RunEngine;
  var DEF = { name: 'București', lat: 44.4268, lon: 26.1025 };
  function loc(S) { return S.loc || DEF; }

  async function refresh(S, force) {
    var l = loc(S);
    if (!force && S.weather && S.weather.loc === l.name && Date.now() - S.weather.ts < 2 * 3600 * 1000) return S.weather;
    var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + l.lat + '&longitude=' + l.lon +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max' +
      '&hourly=temperature_2m,precipitation_probability,precipitation,wind_speed_10m&timezone=auto&forecast_days=10';
    var resp = await fetch(url);
    if (!resp.ok) throw new Error('Open-Meteo HTTP ' + resp.status);
    var j = await resp.json(), days = {};
    j.daily.time.forEach(function (d, i) {
      days[d] = { tmax: j.daily.temperature_2m_max[i], tmin: j.daily.temperature_2m_min[i], rain: j.daily.precipitation_sum[i] || 0,
        pop: j.daily.precipitation_probability_max[i] || 0, wind: j.daily.wind_speed_10m_max[i] || 0, code: j.daily.weather_code[i], hours: [] };
    });
    j.hourly.time.forEach(function (t, i) {
      var d = t.slice(0, 10), h = +t.slice(11, 13);
      if (days[d]) days[d].hours[h] = { t: j.hourly.temperature_2m[i], p: j.hourly.precipitation_probability[i] || 0, r: j.hourly.precipitation[i] || 0, w: j.hourly.wind_speed_10m[i] || 0 };
    });
    S.weather = { ts: Date.now(), loc: l.name, days: days };
    return S.weather;
  }
  async function geocode(name) {
    var r = await fetch('https://geocoding-api.open-meteo.com/v1/search?count=5&language=ro&name=' + encodeURIComponent(name));
    var j = await r.json();
    return (j.results || []).map(function (x) { return { name: x.name + (x.admin1 ? ', ' + x.admin1 : '') + (x.country ? ' (' + x.country + ')' : ''), lat: x.latitude, lon: x.longitude }; });
  }

  function dayInfo(S, date) { return S.weather && S.weather.days ? S.weather.days[date] || null : null; }
  function issues(d) {
    var r = [];
    if (!d) return r;
    if (d.pop >= 60 || d.rain >= 3) r.push('ploaie (' + Math.round(d.pop) + '%, ' + (Math.round(d.rain * 10) / 10) + ' mm)');
    if (d.wind >= 40) r.push('vânt puternic (' + Math.round(d.wind) + ' km/h)');
    if (d.tmax >= 30) r.push('caniculă (' + Math.round(d.tmax) + '°C)');
    if (d.tmin <= -8) r.push('ger (' + Math.round(d.tmin) + '°C)');
    return r;
  }
  function score(d) {
    if (!d) return 0;
    return d.pop * 0.5 + d.rain * 8 + Math.max(0, d.wind - 25) * 1.5 + Math.max(0, d.tmax - 26) * 6 + Math.max(0, -3 - d.tmin) * 4;
  }
  function bestWindow(d) {
    if (!d || !d.hours || !d.hours.length) return null;
    var best = null;
    for (var h = 6; h <= 20; h++) {
      var a = d.hours[h], b = d.hours[h + 1]; if (!a || !b) continue;
      var pen = function (x) { return x.p + x.r * 20 + Math.max(0, x.t - 24) * 8 + Math.max(0, -5 - x.t) * 5 + Math.max(0, x.w - 30); };
      var sc = (pen(a) + pen(b)) / 2;
      if (!best || sc < best.sc) best = { sc: sc, from: h, to: h + 2, pop: Math.round((a.p + b.p) / 2), temp: Math.round((a.t + b.t) / 2) };
    }
    return best;
  }
  function icon(d) {
    if (!d) return '';
    var c = d.code;
    if (c === 0) return '☀️'; if (c <= 3) return '⛅'; if (c === 45 || c === 48) return '🌫️';
    if (c >= 95) return '⛈️'; if (c >= 71 && c <= 77) return '❄️'; if (c >= 80 && c <= 82) return '🌦️'; if (c >= 51 && c <= 67) return '🌧️';
    return '🌤️';
  }
  function brief(d) {
    if (!d) return '';
    return icon(d) + ' ' + Math.round(d.tmin) + '–' + Math.round(d.tmax) + '°C · ploaie ' + Math.round(d.pop) + '%' + (d.rain >= 0.5 ? ' (' + (Math.round(d.rain * 10) / 10) + ' mm)' : '') + ' · vânt ' + Math.round(d.wind) + ' km/h';
  }
  function fmtWin(w) { return w ? (w.from < 10 ? '0' : '') + w.from + ':00–' + (w.to < 10 ? '0' : '') + w.to + ':00' : ''; }

  // sugestii pentru sesiunile din următoarele zile (în limita prognozei)
  function suggest(S, today) {
    var out = [], w0 = E.weekOf(today); if (w0 < 1 || w0 > E.nWeeks() || !S.weather) return out;
    var doneDates = {}; (S.runs || []).forEach(function (r) { doneDates[r.date] = true; });
    var dismissed = S.dismissed || {};
    [E.clampWeek(w0), E.clampWeek(w0 + 1)].filter(function (w, i, a) { return a.indexOf(w) === i; }).forEach(function (w) {
      E.effectiveWeek(S, w).sessions.forEach(function (s) {
        if (s.date < today || doneDates[s.date] || s.kind === 'rest' || dismissed[s.date]) return;
        var d = dayInfo(S, s.date); if (!d) return;
        var reasons = issues(d); if (!reasons.length) return;
        var sug = { week: w, day: s.day, date: s.date, session: s, reasons: reasons, info: d, win: bestWindow(d), type: 'advice' };
        if (s.baseKind !== 'race') {
          var best = null;
          E.freeDays(S, w, s.day, today, doneDates).forEach(function (to) {
            var date = E.sessionDate(w, to), di = dayInfo(S, date); if (!di || issues(di).length) return;
            if (score(di) > score(d) - 15) return;
            var dist = Math.abs(E.dayDiff(E.parseISO(s.date), E.parseISO(date)));
            var cand = { to: to, date: date, info: di, sc: score(di) + dist * 3 };
            if (!best || cand.sc < best.sc) best = cand;
          });
          if (best) { sug.type = 'move'; sug.to = best.to; sug.toDate = best.date; sug.toInfo = best.info; }
        } else sug.type = 'race';
        out.push(sug);
      });
    });
    return out;
  }

  // rezumat compact pentru Gemini
  function forAI(S, today) {
    if (!S.weather) return null;
    var days = [], d0 = E.parseISO(today);
    for (var i = 0; i < 8; i++) {
      var date = E.iso(E.addDays(d0, i)), d = dayInfo(S, date); if (!d) continue;
      var bw = bestWindow(d);
      days.push({ date: date, tempMin: Math.round(d.tmin), tempMax: Math.round(d.tmax), rainProbPct: Math.round(d.pop), rainMm: Math.round(d.rain * 10) / 10, windKmh: Math.round(d.wind), problems: issues(d), driestWindow: bw ? fmtWin(bw) : null });
    }
    return { place: S.weather.loc, source: 'Open-Meteo', days: days,
      moveSuggestionsComputedByApp: suggest(S, today).map(function (x) { return { date: x.date, day: x.day, type: x.type, reasons: x.reasons, suggestedDay: x.to || null }; }) };
  }

  g.RunWeather = { DEF: DEF, loc: loc, refresh: refresh, geocode: geocode, dayInfo: dayInfo, issues: issues, score: score, bestWindow: bestWindow, icon: icon, brief: brief, fmtWin: fmtWin, suggest: suggest, forAI: forAI };
})(typeof window !== 'undefined' ? window : globalThis);
