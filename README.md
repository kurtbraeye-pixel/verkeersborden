# Verkeersborden oefenen

Een webapp om de Belgische verkeersborden te oefenen, per thema (20 borden) of alles door elkaar (30 borden).
Als je een bord fout hebt, komt het later in dezelfde reeks terug, tot je het juist hebt.

## Publiceren via GitHub Pages
1. Zet deze map in een GitHub-repository (`index.html` moet in de hoofdmap staan).
2. Ga naar **Settings → Pages**, kies **Deploy from a branch**, branch `main` en map `/ (root)`.
3. Na een minuutje staat de app op `https://<gebruikersnaam>.github.io/<repo>/`.

Lokaal bekijken: open `index.html` in de browser, of start `python3 -m http.server` in deze map.

## Voorleesstem
De app speelt de opnames in `audio/` af (Vlaamse stem "RDH", gemaakt met het gratis
[Piper](https://github.com/OHF-Voice/piper1-gpl), licentie CC0). Ontbreekt een opname, dan leest de
ingebouwde stem van de browser die zin voor.

Betekenissen aangepast in `data/borden.js`? Maak dan de ontbrekende opnames opnieuw (Piper staat in `tools/.piper`):

```bash
tools/.piper/venv/bin/python tools/maak-audio-piper.py
```

Standaard spreekt de stem trager dan normaal (`--traagheid 1.2`). Sneller: `--traagheid 1.1` of `1.0` (normaal).

### Alternatief: betalende stem van SpeechGen
Wil je later toch een stem van [SpeechGen](https://speechgen.io/nl/tts-dutch-belgium/), dan vervangt dit script de opnames:

```bash
export SPEECHGEN_EMAIL="jouw e-mailadres bij SpeechGen"
export SPEECHGEN_TOKEN="je API-sleutel uit het SpeechGen-dashboard"
python3 tools/maak-audio.py --stemmen                 # lijst met Vlaamse stemmen
python3 tools/maak-audio.py --stem "Lisa plus" --proef  # 3 proefbestanden
python3 tools/maak-audio.py --stem "Lisa plus"          # alles (±263 bestanden, ±15 000 tekens)
```

De MP3's komen in `audio/`, samen met `audio/manifest.js`. Zet die map mee op GitHub. Ontbreekt een bestand,
dan leest de app die zin met de browserstem voor. Je API-sleutel komt niet in de app terecht.

## Bestanden
- `index.html`, `style.css`, `app.js`: de app
- `data/borden.js`: alle borden met code, thema, betekenis en extra uitleg
- `img/`: afbeeldingen van de borden (verkleind)

Bron van de betekenissen: FOD Mobiliteit, *Code van de openbare weg – Overzicht van de verkeersborden vanaf 01/06/2027* (v. 2026-07-17).
