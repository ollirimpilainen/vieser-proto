"""Kopioi canvaksen artboardit ja vieser.css tähän repoon ja vaihtaa /_blob/-viittaukset img/-kansion tiedostoihin.
Käyttö: python3 tools/sync-from-canvas.py <canvaksen project-kansio> <kansio, jossa blobit tunnisteen nimellä>"""
import os, re, sys, json
src, blobs = sys.argv[1], sys.argv[2]
dst = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
kuvat = json.load(open(os.path.join(dst, 'tools', 'kuvat.json')))
files = [f for f in os.listdir(src) if f.endswith('.dc.html')] + ['vieser.css']
for f in files:
    t = open(os.path.join(src, f)).read()
    for i in set(re.findall(r'/_blob/([0-9a-f]{32})', t)):
        if i not in kuvat:
            h = open(os.path.join(blobs, i), 'rb').read(300)
            kuvat[i] = 'svg' if (b'<svg' in h or b'<?xml' in h) else 'png' if h[:4] == b'\x89PNG' else 'jpg'
        p = os.path.join(dst, 'img', i + '.' + kuvat[i])
        if not os.path.exists(p):
            open(p, 'wb').write(open(os.path.join(blobs, i), 'rb').read())
    t = re.sub(r'/_blob/([0-9a-f]{32})', lambda m: 'img/' + m.group(1) + '.' + kuvat[m.group(1)], t)
    open(os.path.join(dst, f), 'w').write(t)
json.dump(kuvat, open(os.path.join(dst, 'tools', 'kuvat.json'), 'w'), indent=1)
print('Kopioitu', len(files), 'tiedostoa')
