/* Banc du placement des modèles 3D (python/maillages_3d.mjs), sans OpenCascade :
   un SOT-23 dessiné Y vers le haut et décalé, comme un modèle de fabricant,
   doit retomber patte par patte sur ses pastilles (deux d'un côté, une de
   l'autre : le sens de la broche 1 compte). */
import { placer, HAUTS, lirePosition, ecrirePosition } from "../maillages_3d.mjs";

let ko = 0;
const verifier = (nom, ok, detail) => { console.log((ok ? "  ok  " : "  KO  ") + nom + (ok ? "" : " : " + detail)); if (!ok) ko++; };

/* une boîte en 12 triangles, repère de l'empreinte (Y vers le haut, Z hors de la carte) */
const pts = [], tri = [];
function boite(x1, y1, z1, x2, y2, z2) {
  const b = pts.length, c = [[x1, y1, z1], [x2, y1, z1], [x2, y2, z1], [x1, y2, z1], [x1, y1, z2], [x2, y1, z2], [x2, y2, z2], [x1, y2, z2]];
  pts.push(...c);
  for (const f of [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]])
    tri.push(...f.map(k => b + k));
}
const pieds = [[-0.95, 0.95], [-0.95, -0.95], [0.95, 0]];          // pastilles 1, 2, 3
for (const [x, y] of pieds) boite(x - 0.2, y - 0.2, 0, x + 0.2, y + 0.2, 0.1);
boite(-0.65, -1.45, 0.1, 0.65, 1.45, 1.1);
/* dessiné Y vers le haut (x, y, z) = (u, w, -v), origine ailleurs */
const modele = { pts: pts.map(([u, v, w]) => [u + 5, w + 3, -v - 2]), tri };
const fp = { body: { x1: -0.65, y1: -1.45, x2: 0.65, y2: 1.45 },
             pads: [{ n: 1, x: -0.9375, y: -0.95, w: 1.475, h: 0.6 }, { n: 2, x: -0.9375, y: 0.95, w: 1.475, h: 0.6 },
                    { n: 3, x: 0.9375, y: 0, w: 1.475, h: 0.6 }] };

const R = placer(modele, fp, 1.1), p = R.pos;
const poser = q => {
  const [u, v, w] = HAUTS[p.haut](q), a = p.rot * Math.PI / 180, c = Math.round(Math.cos(a)), s = Math.round(Math.sin(a));
  return [u * c - v * s + p.x, u * s + v * c + p.y, w + p.z];
};
pieds.forEach(([x, y], k) => {
  const q = poser([x + 5, 0.05 + 3, -y - 2]), pad = fp.pads[k];
  verifier("patte " + (k + 1) + " sur sa pastille", Math.hypot(q[0] - pad.x, q[1] + pad.y) < 0.1 && Math.abs(q[2] - 0.05) < 1e-9,
           JSON.stringify([q, ecrirePosition(p)]));
});
verifier("hauteur du modèle posé", Math.abs(R.h - 1.1) < 1e-9, R.h);
verifier("Position 3D relue telle qu'écrite", JSON.stringify(lirePosition(ecrirePosition(p))) ===
         JSON.stringify({ haut: p.haut, rot: p.rot, x: Math.round(p.x * 1000) / 1000, y: Math.round(p.y * 1000) / 1000, z: Math.round(p.z * 1000) / 1000 }),
         ecrirePosition(p));
verifier("une position illisible est refusée", lirePosition("rot=90 x=1") === null, "");
console.log(ko ? ko + " en échec" : "tout est bon");
process.exit(ko ? 1 : 0);
