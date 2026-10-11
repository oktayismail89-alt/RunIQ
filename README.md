# RunIQ

Antrenor de alergare personal (PWA, fără build). Țintă: semi ~1:50 (mai 2027) și maraton sub 4:00 (10 oct 2027).

## Cum funcționează

- **Planul de bază** (`js/data.js`): 52 de săptămâni din 12 oct 2026, luni/marți/vineri/duminică, minim 5 km pe alergare.
- **Ritmurile** le calculează codul (`js/engine.js`) din forma ta curentă și se strâng spre țintă cu ~1,4 s/km pe săptămână. Un test/cursă introdus în *Recalibrează* le refăcește. Nu pot depăși ținta (semi 5:13, maraton 5:41).
- **Gemini propune ajustări** pentru săptămâna curentă și următoarea, după fiecare alergare, la început de săptămână sau la cerere. Nu scrie planuri noi.
- **Validatorul** (`validate()` în `engine.js`) decide ce intră în plan: zile fixe, minim 5 km, niciodată peste kilometrii din bază, fără intensitate mai mare, creștere ≤10% față de ce ai alergat efectiv (doar săptămâni încheiate), fără calitate la durere/oboseală, odihnă doar la durere ≥2. Fără cheie sau la eroare Gemini rămân active aceleași reguli.
- Fiecare ajustare e marcată în plan, cu motiv, și poate fi anulată („Revino la planul de bază”).

## Fișiere

`index.html`, `css/style.css`, `js/data.js` (plan), `js/engine.js` (logică pură), `js/ai.js` (Gemini), `js/core.js`, `js/views.js`, `js/actions.js`, `manifest.webmanifest`, `icon.svg`.

Datele stau în `localStorage` (`runiq_v4`). La prima deschidere se importă alergările, greutatea, durerile și cheia din versiunea veche (`runiq_v3`, rămâne neatinsă).
