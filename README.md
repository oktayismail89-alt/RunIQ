# RunIQ

Antrenor de alergare personal (PWA, fără build). Țintă: semi ~1:50 (mai 2027) și maraton sub 4:00 (10 oct 2027).

## Cum funcționează

- **Planul de bază** (`js/data.js`): 52 de săptămâni din 12 oct 2026, luni/marți/vineri/duminică, minim 5 km pe alergare.
- **Ritmurile** le calculează codul (`js/engine.js`) din forma ta curentă și se strâng spre țintă cu ~1,4 s/km pe săptămână. Un test/cursă introdus în *Recalibrează* le refăcește. Nu pot depăși ținta (semi 5:13, maraton 5:41).
- **Gemini propune ajustări** pentru săptămâna curentă și următoarea, după fiecare alergare, la început de săptămână sau la cerere. Nu scrie planuri noi.
- **Validatorul** (`validate()` în `engine.js`) decide ce intră în plan: zile fixe, minim 5 km, niciodată peste kilometrii din bază, fără intensitate mai mare, creștere ≤10% față de ce ai alergat efectiv (doar săptămâni încheiate), fără calitate la durere/oboseală, odihnă doar la durere ≥2. Fără cheie sau la eroare Gemini rămân active aceleași reguli.
- Fiecare ajustare e marcată în plan, cu motiv, și poate fi anulată („Revino la planul de bază”).

## Vreme și internet

- **Prognoza** vine de la Open-Meteo (gratuit, fără cheie), pentru locația din Setări (implicit București). Codul detectează zilele proaste (ploaie ≥60% sau ≥3 mm, vânt ≥40 km/h, caniculă ≥30°C, ger ≤−8°C), propune mutarea sesiunii într-o zi liberă mai bună din aceeași săptămână și arată cel mai bun interval orar.
- **Mutarea** e validată în cod: aceeași săptămână, fără două sesiuni grele consecutive, lungul rămâne în weekend, cursele nu se mută, ziua dinaintea cursei rămâne liberă, nimic în trecut. Se poate face și manual din Plan.
- **Chat-ul** folosește căutarea Google din Gemini (grounding) pentru informații actuale și afișează sursele. Ajustările planului nu o folosesc: cer JSON strict, validat în cod.

## Fișiere

`index.html`, `css/style.css`, `js/data.js` (plan), `js/engine.js` (logică pură), `js/weather.js` (vreme + sugestii), `js/ai.js` (Gemini), `js/core.js`, `js/views.js`, `js/actions.js`, `manifest.webmanifest`, `icon.svg`.

Datele stau în `localStorage` (`runiq_v4`). La prima deschidere se importă alergările, greutatea, durerile și cheia din versiunea veche (`runiq_v3`, rămâne neatinsă).

## Generator de planuri (orice țintă)
Tab Plan → „Plan nou": distanță (5K/10K/semi/maraton/custom), dată, timp țintă (opțional), curse intermediare, formă actuală, zile, nivel. `js/planner.js` evaluează țintă vs. formă (verdict realist → nerealist, cu timp alternativ) și generează planul algoritmic: faze, descărcări, taper, teste de calibrare. Ritmurile se calculează din formă, nu din LLM; Gemini doar adaptează, validat de cod. Planul vechi se poate reveni din „Revino la planul anterior".
