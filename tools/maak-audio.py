#!/usr/bin/env python3
"""
Maakt de voorleesbestanden (MP3) voor de app via de SpeechGen-API (https://speechgen.io).

Gebruik (in de map van de app):

    export SPEECHGEN_EMAIL="jouw@email"
    export SPEECHGEN_TOKEN="jouw API-sleutel uit het SpeechGen-dashboard"

    python3 tools/maak-audio.py --stemmen            # toon de Vlaamse stemmen
    python3 tools/maak-audio.py --proef              # maak enkel 3 bestanden om de stem te beluisteren
    python3 tools/maak-audio.py                      # maak alle ontbrekende bestanden
    python3 tools/maak-audio.py --stem "Arnaud" --snelheid 0.9 --opnieuw   # alles opnieuw met een andere stem

Het script is hervatbaar: wat al gemaakt is, wordt overgeslagen.
Resultaat: map  audio/  met MP3's en  audio/manifest.js  (welke tekst bij welk bestand hoort).
Je API-sleutel komt nergens in de app terecht.
"""
import argparse, hashlib, json, os, subprocess, sys, time, urllib.parse

API = 'https://speechgen.io/index.php?r=api/'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AUDIO = os.path.join(ROOT, 'audio')
MANIFEST = os.path.join(AUDIO, 'manifest.js')

# Vaste zinnen. De sleutels moeten overeenkomen met PHRASES in app.js.
PHRASES = {
    'vraag_bord': 'Wat betekent dit verkeersbord?',
    'vraag_betekenis': 'Welk verkeersbord hoort bij deze betekenis?',
    'letter_A': 'Antwoord A.', 'letter_B': 'Antwoord B.', 'letter_C': 'Antwoord C.', 'letter_D': 'Antwoord D.',
    'fout': 'Niet juist.',
    'juist_antwoord': 'Het juiste antwoord is:',
}


def cap(s):
    return s[:1].upper() + s[1:]


def load_signs():
    src = open(os.path.join(ROOT, 'data', 'borden.js'), encoding='utf-8').read()
    data = json.loads(src[src.index('{'):src.rindex('}') + 1])
    return data['signs']


def all_texts():
    """(sleutel, uit te spreken tekst). Sleutel = 'p:<naam>' of 't:<betekenis zoals in de data>'."""
    items = [('p:' + k, v) for k, v in PHRASES.items()]
    seen = set()
    for s in load_signs():
        if s['title'] in seen:
            continue
        seen.add(s['title'])
        items.append(('t:' + s['title'], cap(s['title'])))
    return items


def http(url, body=None):
    """Haalt een URL op met curl (gebruikt de certificaten van macOS).
    De gegevens (met je sleutel) gaan via stdin, zodat ze niet in de proceslijst verschijnen."""
    cmd = ['curl', '-sS', '--fail', '--max-time', '120', '-A', 'verkeersborden-app']
    if body is not None:
        cmd += ['--data-binary', '@-', '-H', 'Content-Type: application/x-www-form-urlencoded']
    r = subprocess.run(cmd + [url], input=body, capture_output=True)
    if r.returncode != 0:
        raise RuntimeError(r.stderr.decode('utf-8', 'replace').strip() or f'curl fout {r.returncode}')
    return r.stdout


def post(endpoint, fields):
    return json.loads(http(API + endpoint, urllib.parse.urlencode(fields).encode()).decode('utf-8'))


def list_voices():
    data = json.loads(http(API + 'voices').decode('utf-8'))
    print('Vlaamse stemmen (naam · geslacht · kwaliteit):')
    for v in data.get('Flemish (Belgian Dutch)', []):
        print(f"  {v['voice']:<26} {v.get('sex', ''):<7} {v.get('type', '')}")


def read_manifest():
    if not os.path.exists(MANIFEST):
        return {'voice': None, 'speed': None, 'files': {}}
    src = open(MANIFEST, encoding='utf-8').read()
    return json.loads(src[src.index('{'):src.rindex('}') + 1])


def write_manifest(m):
    with open(MANIFEST, 'w', encoding='utf-8') as f:
        f.write('// Gemaakt door tools/maak-audio.py — niet met de hand aanpassen.\n')
        f.write('window.AUDIO = ' + json.dumps(m, ensure_ascii=False, indent=1) + ';\n')


def main():
    ap = argparse.ArgumentParser(description='Maak MP3-voorleesbestanden via SpeechGen.')
    ap.add_argument('--stem', default='Lisa plus', help='naam van de stem (zie --stemmen), standaard "Lisa plus"')
    ap.add_argument('--snelheid', type=float, default=0.9, help='spreeksnelheid 0.1–2.0, standaard 0.9')
    ap.add_argument('--stemmen', action='store_true', help='toon de beschikbare Vlaamse stemmen')
    ap.add_argument('--proef', action='store_true', help='maak enkel 3 bestanden om te beluisteren')
    ap.add_argument('--opnieuw', action='store_true', help='alles opnieuw maken (bv. na stemwissel)')
    args = ap.parse_args()

    if args.stemmen:
        return list_voices()

    email, token = os.environ.get('SPEECHGEN_EMAIL'), os.environ.get('SPEECHGEN_TOKEN')
    if not email or not token:
        sys.exit('Zet eerst SPEECHGEN_EMAIL en SPEECHGEN_TOKEN (zie uitleg bovenaan dit script).')

    os.makedirs(AUDIO, exist_ok=True)
    m = read_manifest()
    if args.opnieuw or m.get('voice') != args.stem or m.get('speed') != args.snelheid:
        if m['files'] and not args.opnieuw:
            print(f"Stem/snelheid gewijzigd ({m.get('voice')} {m.get('speed')} → {args.stem} {args.snelheid}): alles wordt opnieuw gemaakt.")
        m = {'voice': args.stem, 'speed': args.snelheid, 'files': {}}

    items = all_texts()
    todo = [(k, t) for k, t in items if k not in m['files'] or not os.path.exists(os.path.join(ROOT, m['files'][k]))]
    if args.proef:
        todo = todo[:3]
    chars = sum(len(t) for _, t in todo)
    print(f'{len(items)} teksten in totaal, {len(todo)} nog te maken ({chars} tekens), stem "{args.stem}", snelheid {args.snelheid}.')

    for n, (key, text) in enumerate(todo, 1):
        fname = 'audio/' + hashlib.sha1(key.encode('utf-8')).hexdigest()[:12] + '.mp3'
        for attempt in range(3):
            try:
                res = post('text', {'token': token, 'email': email, 'voice': args.stem, 'text': text,
                                    'format': 'mp3', 'speed': args.snelheid})
                break
            except Exception as e:  # netwerkfout: even wachten en opnieuw
                if attempt == 2:
                    raise
                print('  netwerkfout, opnieuw…', e)
                time.sleep(3)
        if str(res.get('status')) != '1' or not res.get('file'):
            write_manifest(m)
            sys.exit(f"Fout bij “{text[:50]}”: {res.get('error') or res}")
        open(os.path.join(ROOT, fname), 'wb').write(http(res['file']))
        m['files'][key] = fname
        if n % 10 == 0 or n == len(todo):
            write_manifest(m)
        print(f"  [{n}/{len(todo)}] {text[:70]}  (saldo: {res.get('balans', '?')})")
    write_manifest(m)
    print('Klaar. Herlaad de app om de nieuwe stem te horen.')


if __name__ == '__main__':
    main()
