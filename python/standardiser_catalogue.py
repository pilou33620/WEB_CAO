# -*- coding: utf-8 -*-
"""Uniformisation du catalogue CSV."""
import csv, io, os

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV_RACINE = os.path.join(RACINE, 'LIB_composants.csv')
CSV_LIB = os.path.join(RACINE, 'lib', 'LIB_composants.csv')

def standardiser():
    with io.open(CSV_RACINE, 'r', encoding='utf-8') as f:
        reader = csv.reader(f, delimiter=';')
        header = next(reader)
        p_idx = header.index('Empreinte PCB')
        s_idx = header.index('Empreinte Schématique')
        m_idx = header.index('Modèle Simulation')
        rows = []
        for r in reader:
            if len(r) > p_idx and r[p_idx].strip():
                b = os.path.basename(r[p_idx].strip().replace('\\\\', '/'))
                r[p_idx] = f'lib/empreinte/{b}'
            if len(r) > s_idx and r[s_idx].strip():
                b = os.path.basename(r[s_idx].strip().replace('\\\\', '/'))
                r[s_idx] = f'lib/symbole/{b}'
            if len(r) > m_idx and r[m_idx].strip():
                b = os.path.basename(r[m_idx].strip().replace('\\\\', '/'))
                r[m_idx] = f'lib/simulation/{b}'
            rows.append(r)
    s = io.StringIO()
    writer = csv.writer(s, delimiter=';', quoting=csv.QUOTE_MINIMAL, lineterminator='\r\n')
    writer.writerow(header)
    for r in rows:
        writer.writerow(r)
    content = s.getvalue()
    for path in [CSV_RACINE, CSV_LIB]:
        with io.open(path, 'w', encoding='utf-8', newline='') as f:
            f.write(content)
        print(f'Wrote {path} ({len(rows)} composants)')

if __name__ == '__main__':
    standardiser()
