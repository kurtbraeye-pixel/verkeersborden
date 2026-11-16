#!/usr/bin/env python3
"""
Maakt de voorleesbestanden voor de app GRATIS en offline met Piper (https://github.com/OHF-Voice/piper1-gpl),
met de Vlaamse stem "rdh" (licentie CC0).

Eenmalige installatie (gebeurt al als de map tools/.piper bestaat):

    python3 -m venv tools/.piper/venv
    tools/.piper/venv/bin/pip install piper-tts
    # stem downloaden naar tools/.piper/voices/:
    #   https://huggingface.co/rhasspy/piper-voices/tree/main/nl/nl_BE/rdh/medium

Gebruik (in de map van de app):

    tools/.piper/venv/bin/python tools/maak-audio-piper.py              # maak ontbrekende bestanden
    tools/.piper/venv/bin/python tools/maak-audio-piper.py --opnieuw    # alles opnieuw
    tools/.piper/venv/bin/python tools/maak-audio-piper.py --traagheid 1.2   # trager spreken (1 = normaal)

Draai het opnieuw nadat je betekenissen in data/borden.js aanpast: enkel nieuwe teksten worden gemaakt.
Werkt op macOS (gebruikt afconvert om naar .m4a om te zetten).
"""
import argparse, hashlib, importlib.util, os, subprocess, sys, tempfile, wave

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
PIPER_DIR = os.path.join(HERE, '.piper')

# Gedeelde logica (teksten, manifest) uit maak-audio.py hergebruiken.
spec = importlib.util.spec_from_file_location('maak_audio', os.path.join(HERE, 'maak-audio.py'))
common = importlib.util.module_from_spec(spec)
spec.loader.exec_module(common)


def main():
    ap = argparse.ArgumentParser(description='Maak voorleesbestanden met Piper.')
    ap.add_argument('--stem', default='nl_BE-rdh-medium', help='Piper-stem in tools/.piper/voices/')
    ap.add_argument('--traagheid', type=float, default=1.2, help='1 = normaal, hoger = trager (standaard 1.2)')
    ap.add_argument('--opnieuw', action='store_true', help='alles opnieuw maken')
    args = ap.parse_args()

    from piper import PiperVoice, SynthesisConfig

    model = os.path.join(PIPER_DIR, 'voices', args.stem + '.onnx')
    if not os.path.exists(model):
        sys.exit(f'Stem niet gevonden: {model}')
    # espeak-ng aanvaardt geen erg lange paden; daarom een kopie van de data naast de stemmen.
    espeak = os.path.join(PIPER_DIR, 'espeak-ng-data')
    voice = PiperVoice.load(model, espeak_data_dir=espeak) if os.path.isdir(espeak) else PiperVoice.load(model)
    cfg = SynthesisConfig(length_scale=args.traagheid)

    voice_id = 'piper:' + args.stem
    os.makedirs(common.AUDIO, exist_ok=True)
    m = common.read_manifest()
    if args.opnieuw or m.get('voice') != voice_id or m.get('speed') != args.traagheid:
        old = set(m.get('files', {}).values())
        m = {'voice': voice_id, 'speed': args.traagheid, 'files': {}}
    else:
        old = set()

    items = common.all_texts()
    todo = [(k, t) for k, t in items if k not in m['files'] or not os.path.exists(os.path.join(ROOT, m['files'][k]))]
    print(f'{len(items)} teksten, {len(todo)} te maken met {args.stem} (traagheid {args.traagheid}).')

    with tempfile.TemporaryDirectory() as tmp:
        wav = os.path.join(tmp, 'x.wav')
        for n, (key, text) in enumerate(todo, 1):
            with wave.open(wav, 'wb') as w:
                w.setnchannels(1)
                w.setsampwidth(2)
                w.setframerate(voice.config.sample_rate)
                for chunk in voice.synthesize(text, syn_config=cfg):
                    w.writeframes(chunk.audio_int16_bytes)
            fname = 'audio/' + hashlib.sha1(f'{voice_id}|{args.traagheid}|{key}|{text}'.encode('utf-8')).hexdigest()[:12] + '.m4a'
            subprocess.run(['afconvert', '-f', 'm4af', '-d', 'aac', wav, os.path.join(ROOT, fname)], check=True)
            m['files'][key] = fname
            if n % 25 == 0 or n == len(todo):
                common.write_manifest(m)
                print(f'  {n}/{len(todo)}')

    # oude bestanden die niet meer gebruikt worden opruimen
    keep = set(m['files'].values())
    for f in old - keep:
        p = os.path.join(ROOT, f)
        if f.startswith('audio/') and os.path.exists(p):
            os.remove(p)
    common.write_manifest(m)
    print('Klaar. Herlaad de app.')


if __name__ == '__main__':
    main()
