"use strict";
/* =============================================================================
   commun/classes-interface.js
   Les classes d'interface : USB, Ethernet, LVDS, CAN, RS-485.

   UNE CLASSE D'INTERFACE APPARTIENT À UNE FAMILLE. La famille (Rapide, Lent…)
   décide des règles qui s'appliquent ; l'interface donne son front (s), sa
   cadence (Hz) et la Z_diff de sa norme (Ω). Pas de Z₀ de brin : la norme
   n'en fixe pas, le panneau de vérification peut en donner une.

   La MÊME table que `INTERFACES` de python/crosstalk.py, écrite en JSON pour
   que le banc crosstalk la relise et les compare. Lue par le schéma, le PCB
   et la visionneuse : des données et une fonction pure, rien d'autre.
   ============================================================================= */
const CLASSES_INTERFACE={
  "USB FS":{"nom":"USB 2.0 Full Speed","famille":"Lent","tr":4e-9,"cadence":6e6,"zdiff":90.0},
  "USB HS":{"nom":"USB 2.0 High Speed","famille":"Rapide","tr":5e-10,"cadence":2.4e8,"zdiff":90.0},
  "ETH 100":{"nom":"Ethernet 100BASE-TX","famille":"Rapide","tr":3e-9,"cadence":3.125e7,"zdiff":100.0},
  "ETH 1000":{"nom":"Ethernet 1000BASE-T","famille":"Rapide","tr":2e-9,"cadence":6.25e7,"zdiff":100.0},
  "LVDS":{"nom":"LVDS (TIA-644)","famille":"Rapide","tr":3e-10,"cadence":3.3e8,"zdiff":100.0},
  "CAN":{"nom":"CAN (ISO 11898)","famille":"Lent","tr":5e-8,"cadence":5e5,"zdiff":120.0},
  "RS-485":{"nom":"RS-485 (TIA-485)","famille":"Lent","tr":2e-8,"cadence":5e6,"zdiff":120.0}
};
/* La classe d'origine qui décide des règles : celle de l'interface, la classe
   elle-même sinon. */
function familleClasse(c){
  const i=Object.prototype.hasOwnProperty.call(CLASSES_INTERFACE,c)?CLASSES_INTERFACE[c]:null;
  return i?i.famille:c;
}
