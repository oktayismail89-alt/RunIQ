/* RunIQ AI — Gemini propune, validatorul decide. Fără cheie sau la eroare, planul rămâne valid (reguli în cod). */
(function (g) {
  'use strict';
  var E = g.RunEngine;
  var MODELS_ADAPT = ['gemini-2.5-flash', 'gemini-2.5-flash-lite'];
  var MODELS_CHAT = ['gemini-2.5-flash-lite', 'gemini-2.5-flash'];

  function delay(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  async function gemini(S, o) {
    var key = S.apiKey;
    if (!key) throw new Error('no_key');
    var models = o.models, lastErr;
    for (var i = 0; i < models.length; i++) {
      var useThinking = o.thinking !== undefined, tools = o.tools || null;
      for (var attempt = 0; attempt < 3; attempt++) {
        var cfg = { maxOutputTokens: o.maxTokens || 1500, temperature: o.temperature === undefined ? 0.3 : o.temperature };
        if (o.json) cfg.responseMimeType = 'application/json';
        if (useThinking) cfg.thinkingConfig = { thinkingBudget: o.thinking };
        var resp, data;
        try {
          resp = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + models[i] + ':generateContent?key=' + encodeURIComponent(key), {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(Object.assign({ system_instruction: { parts: [{ text: o.system }] }, contents: o.contents || [{ role: 'user', parts: [{ text: o.user }] }], generationConfig: cfg }, tools ? { tools: tools } : {}))
          });
          data = await resp.json();
        } catch (e) { lastErr = new Error('Rețea indisponibilă'); break; }
        if (resp.ok && data.candidates && data.candidates[0] && data.candidates[0].content) {
          if (o.sourcesOut) {
            var gm = data.candidates[0].groundingMetadata;
            ((gm && gm.groundingChunks) || []).forEach(function (c) { if (c.web && c.web.uri) o.sourcesOut.push({ title: c.web.title || c.web.uri, uri: c.web.uri }); });
          }
          return data.candidates[0].content.parts.map(function (p) { return p.text || ''; }).join('');
        }
        var msg = (data && data.error && data.error.message) || ('HTTP ' + resp.status);
        lastErr = new Error(msg);
        if (resp.status === 400 && useThinking && /think/i.test(msg)) { useThinking = false; continue; }
        if (resp.status === 400 && tools && /tool|search|ground/i.test(msg)) { tools = null; continue; }
        if (resp.status === 400 && /API key/i.test(msg)) throw new Error('Cheia Gemini nu este validă');
        if (resp.status === 429 || resp.status >= 500) { await delay(1500); }
        break;                                   // următorul model
      }
    }
    throw lastErr || new Error('Gemini nu a răspuns');
  }

  function parseJSON(txt) {
    var c = String(txt).replace(/```json/gi, '').replace(/```/g, '').trim();
    var a = c.indexOf('{'), b = c.lastIndexOf('}');
    if (a < 0 || b < a) throw new Error('Răspuns fără JSON');
    return JSON.parse(c.slice(a, b + 1));
  }

  /* ---------- context compact pentru coach ---------- */
  function paceStr(r) { return r.sec > 0 && r.km > 0 ? E.fmtPace(r.sec / r.km) + '/km' : null; }
  function zonesText(S, w) {
    var z = E.zones(S, w);
    return { easy: E.paceText(S, w, 'easy'), tempo: E.paceText(S, w, 'tempo'), interval: E.paceText(S, w, 'interval'), halfMarathonPace: E.fmtPace(z.hmp) + '/km', marathonPace: E.fmtPace(z.mp) + '/km', goalRacePace: E.fmtPace(z.rp) + '/km' };
  }
  function weekBrief(S, w, ctx) {
    var ew = E.effectiveWeek(S, w), bw = E.baseWeek(w);
    return {
      week: w, dates: ew.range, phase: bw.phase, baselineTotalKm: bw.targetKm, note: bw.coachNote,
      sessions: ew.sessions.map(function (x) {
        return { day: x.day, date: x.date, baselineKind: x.baseKind, baselineKm: x.baseKm, currentKind: x.kind, currentKm: x.km,
          locked: x.baseKind === 'race' || x.date < ctx.today || !!ctx.doneDates[x.date] };
      })
    };
  }
  function context(S, week, today) {
    var ctx = E.ctxFor(S, week, today);
    var rw = [];
    for (var w = Math.max(1, week - 3); w < week; w++) { var st = E.weekStats(S, w); rw.push({ week: w, plannedKm: st.planned, actualKm: st.actual, runs: st.count, avgPace: st.avgPace ? E.fmtPace(st.avgPace) + '/km' : null, avgHr: st.avgHr || null, avgFeel: st.avgFeel ? +st.avgFeel.toFixed(1) : null }); }
    var cur = E.weekStats(S, week);
    return {
      today: today, currentWeek: week, ctx: ctx,
      payload: {
        today: today, currentWeek: week,
        goal: E.plan().goal.label, planName: E.plan().name, planWeeks: E.nWeeks(), raceDate: E.plan().goal.raceDate,
        runner: { weightKg: (S.body && S.body.length ? S.body[S.body.length - 1].kg : null) },
        fitnessNow: { halfMarathonPace: E.fmtPace(E.hmpAt(S, week)) + '/km', source: (S.fitness || E.defaultFit()).src },
        paceZonesComputedByApp: zonesText(S, week),
        thisWeek: weekBrief(S, week, ctx),
        thisWeekProgress: { actualKm: cur.actual, runsLogged: cur.count },
        nextWeek: week < E.nWeeks() ? weekBrief(S, week + 1, ctx) : null,
        recentWeeks: rw,
        lastRuns: E.lastRuns(S, 6).map(function (r) { return { date: r.date, km: r.km, pace: paceStr(r), hr: r.hr || null, feel1to5: r.feel, notes: r.notes || '' }; }),
        activeNiggles: (S.niggles || []).filter(function (n) { return n.active; }).map(function (n) { return { area: n.area, severity1to3: n.sev, notes: n.notes }; }),
        history: (function () { var hs = S.history && g.RunHistory ? g.RunHistory.stats(S.history, today) : null; return hs ? { bestHalf: hs.bestHm ? E.fmtTime(hs.bestHm.sec) + ' (' + hs.bestHm.date + ')' : null, peakWeekKm: Math.round(hs.peakWeek.km), weeksWith3plusRunsLastYear: hs.weeks3in52, kmLastYear: hs.km52, lastRunInExport: hs.last } : null; })(),
        controlGates: E.plan().milestones.filter(function (m) { return m.gate && m.date <= today; }).map(function (m) { var v = E.gateVerdict(S, m, today); return { date: m.date, label: m.label, verdict: v.state, result: v.sec ? E.fmtTime(v.sec) : null, green: E.fmtTime(m.gate.green) }; }),
        weather: g.RunWeather ? g.RunWeather.forAI(S, today) : null,
        computedFlags: { ahead: ctx.ahead, avgFeelLast3: ctx.feelAvg ? +ctx.feelAvg.toFixed(1) : null, maxNiggleSeverity: ctx.niggleSev }
      }
    };
  }

  function adaptSystem() { var P = E.plan(); return (
    'Ești antrenorul de alergare al utilizatorului. CONTEXT: ' + P.coachContext + ' Răspunzi în română, direct, fără laude de complezență.\n' +
    'EXISTĂ un plan de bază de ' + E.nWeeks() + ' săptămâni, generat de aplicație. NU scrii planuri noi. Poți doar să-l ajustezi pentru săptămâna curentă și cea următoare, în limitele de mai jos. Codul aplicației verifică tot și corectează orice încalcă regulile.\n' +
    'REGULI DURE: (1) zilele sunt fixe (cele din plan); (2) minim 5 km pe alergare; (3) nu depăși kilometrii din planul de bază; (4) nu crește intensitatea (ordinea: easy < hmp/rp < tempo < interval); (5) "rest" doar dacă există o durere activă de nivel ≥2; (6) sesiunile cu locked:true nu se modifică; (7) NU inventa ritmuri: ritmurile le calculează aplicația, tu nu scrii numere de ritm.\n' +
    'FILOZOFIE: ești prudent. Dacă a alergat mult sub plan, nu-l grăbi să recupereze; dacă a alergat prea repede la ușor sau efortul e 4-5/5, simplifică sesiunile de calitate. Dacă totul merge conform planului, lasă planul NESCHIMBAT (liste goale). A nu schimba nimic e un răspuns bun.\n' +
    'VREME: în DATE există prognoza (Open-Meteo) și sugestiile de mutare calculate de aplicație. Nu inventa prognoze. Dacă o sesiune apropiată are probleme (ploaie, vânt, caniculă), spune-o în "assessment" într-o propoziție și menționează sugestia aplicației; mutările le face utilizatorul din buton, nu le pui tu în JSON.\n' +
    'Dacă ritmul real pe alergările ușoare e semnificativ mai lent decât zona ușoară sau pulsul/efortul sunt mari constant, poți cere hmpShiftSec (0–30, doar mai lent): forma lui actuală e mai slabă decât presupune aplicația. Nu cere niciodată mai rapid.\n' +
    'Răspunde DOAR cu JSON: {"runFeedback":"2-3 propoziții despre alergarea tocmai înregistrată (sau gol dacă nu există)","assessment":"2-4 propoziții: cum merge antrenamentul și ce ai ajustat și de ce","weeks":[{"week":N,"note":"motiv scurt","sessions":[{"day":"Tue","kind":"easy","km":6}]}],"hmpShiftSec":0,"alert":"avertisment (durere, supra-antrenament) sau gol"}. ' +
    'În "weeks" pui DOAR săptămânile pe care le modifici, iar la "sessions" doar zilele modificate. Dacă nu modifici nimic: "weeks":[].'); }

  async function adapt(S, opts) {
    opts = opts || {};
    var today = opts.today || E.iso(new Date());
    var w0 = E.weekOf(today);
    var week = E.clampWeek(w0);
    var result = { assessment: '', runFeedback: '', alert: '', changes: [], source: 'reguli', error: '' };
    var weeks = [week].concat(week < E.nWeeks() ? [week + 1] : []);
    var ai = null;
    try { if (g.RunWeather) await g.RunWeather.refresh(S); } catch (e) { }
    if (w0 < 1) { result.assessment = 'Planul începe luni, 12 octombrie. Până atunci nu e nimic de ajustat.'; return result; }
    if (S.apiKey) {
      try {
        var c = context(S, week, today);
        var user = 'DATE:\n' + JSON.stringify(c.payload) + (opts.run ? '\n\nALERGAREA TOCMAI ÎNREGISTRATĂ: ' + JSON.stringify({ date: opts.run.date, km: opts.run.km, pace: paceStr(opts.run), hr: opts.run.hr || null, cadence: opts.run.cad || null, feel1to5: opts.run.feel, notes: opts.run.notes || '' }) : '') + '\n\nMOTIV: ' + (opts.reason || 'verificare') + '.';
        ai = parseJSON(await gemini(S, { models: MODELS_ADAPT, system: adaptSystem(), user: user, json: true, maxTokens: 2200, thinking: 1024, temperature: 0.25 }));
        result.source = 'gemini';
      } catch (e) { result.error = e.message; }
    }
    if (ai) { result.assessment = String(ai.assessment || '').slice(0, 700); result.runFeedback = String(ai.runFeedback || '').slice(0, 600); result.alert = String(ai.alert || '').slice(0, 300); }
    S.adjust = S.adjust || {};
    weeks.forEach(function (w) {
      var ctx = E.ctxFor(S, w, today);
      var prop = ai && (ai.weeks || []).filter(function (x) { return +x.week === w; })[0];
      var v = E.validate(S, w, prop ? prop.sessions : null, ctx);
      var before = S.adjust[w] ? JSON.stringify(S.adjust[w].sessions) : '';
      var mv = (S.adjust[w] && S.adjust[w].moves) || {}, hasMv = Object.keys(mv).length > 0;
      if (v.sameAsBase) { if (hasMv) S.adjust[w] = { sessions: [], moves: mv, note: S.adjust[w].note || '', ts: Date.now(), src: 'mutare' }; else delete S.adjust[w]; }
      else {
        var note = (prop && prop.note ? String(prop.note).slice(0, 200) : '') || v.problems[0] || 'ajustare automată';
        S.adjust[w] = { sessions: v.sessions, moves: mv, note: note, ts: Date.now(), src: prop ? 'gemini' : 'reguli' };
      }
      var after = S.adjust[w] ? JSON.stringify(S.adjust[w].sessions) : '';
      if (before !== after) result.changes.push({ week: w, total: v.total, base: E.baseWeek(w).targetKm, problems: v.problems });
    });
    if (ai && +ai.hmpShiftSec >= 3) {
      var sh = Math.min(30, Math.round(+ai.hmpShiftSec));
      S.fitness = { hmpSec: E.hmpAt(S, week) + sh, week: week, src: 'ajustat de coach (' + today + ')' };
      result.shift = sh;
    }
    S.lastAdapt = { date: today, week: week, ts: Date.now(), assessment: result.assessment, source: result.source, alert: result.alert };
    return result;
  }

  function chatSystem() { var P = E.plan(); return (
    'Ești antrenorul de alergare al utilizatorului. CONTEXT: ' + P.coachContext + ' Răspunzi în română, concis și direct, fără laude goale. ' +
    'Planul de bază de ' + E.nWeeks() + ' săptămâni e dat; din chat NU poți modifica planul. Dacă recomanzi o schimbare, spune-i să apese "Adaptează planul" în tab-ul Plan. ' +
    'Nu inventa ritmuri: folosește doar zonele din date. La durere care schimbă mersul sau alergarea: odihnă și medic. Nu emite diagnostice. ' +
    'Ai acces la căutare web: folosește-o pentru informații actuale sau verificabile (date de curse, trasee, program, știri). Pentru vreme folosește prognoza din DATE (Open-Meteo), nu o căuta. ' +
    'Dacă recomanzi mutarea unei alergări din cauza vremii, spune ce zi alegi și de ce; utilizatorul apasă "Mută" în aplicație. Nu confirma o dată de cursă fără sursă.'); }

  async function chat(S, history, text, today) {
    var week = E.clampWeek(E.weekOf(today));
    var c = context(S, week, today);
    var sys = chatSystem() + '\nDATE ACTUALE: ' + JSON.stringify(c.payload);
    var contents = history.slice(-10).map(function (m) { return { role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.text }] }; });
    contents.push({ role: 'user', parts: [{ text: text }] });
    var sources = [];
    var text = await gemini(S, { models: MODELS_CHAT, system: sys, contents: contents, maxTokens: 1100, temperature: 0.5, thinking: 0, tools: [{ google_search: {} }], sourcesOut: sources });
    var seen = {}, uniq = sources.filter(function (x) { if (seen[x.uri]) return false; seen[x.uri] = 1; return true; }).slice(0, 4);
    return { text: text, sources: uniq };
  }

  g.RunAI = { adapt: adapt, chat: chat, gemini: gemini, parseJSON: parseJSON, context: context };
})(typeof window !== 'undefined' ? window : globalThis);
