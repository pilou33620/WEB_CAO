# Simulation RF : que faire de chaque broche d'une puce radio

Chapitre du manuel de WEB_CAO (onglet S21 de la famille RF, éditeur PCB et visionneuse
IPC-2581). Le détail du calcul est dans [../simulation-em.md](../simulation-em.md), section
« RF — le S₂₁ d'un réseau entre deux ports ».

Exemple suivi : le SX1261 (Semtech), émission sur RFO, alimentation du PA sur VR_PA,
réception différentielle sur RFI_P / RFI_N. Le brochage exact se lit sur la datasheet du
composant : cette page dit comment traiter une broche, pas laquelle est laquelle.

## Pour chaque broche : que porte-t-elle ?

| Ce que porte la broche | Comment la traiter | Dans l'outil |
|---|---|---|
| Le signal RF que vous voulez mesurer, un seul fil | Un port simple | existe |
| Le signal RF sur deux fils, en opposition de phase | Un port différentiel : borne + puis borne − (bouton ±) | existe |
| Une alimentation qui arrive sur la ligne RF par une self (VR_PA, polarisation) | Une broche annexe, avec l'impédance R + jX qu'elle présente (ouverte par défaut) | existe |
| Une alimentation découplée (VDD) | Rien à poser : la marche s'arrête, c'est une masse RF et la fiche le dit | existe |
| La masse (pad thermique, GND) | Rien à poser sur la puce : un port simple est rapporté à une masse idéale, et les broches de masse de la puce ne sont pas modélisées. Pour les composants du réseau (condensateur en dérivation, Touchstone avec `! masse`), la masse est rapportée à leurs vias ; sans via trouvé, masse idéale et la fiche le dit | existe |
| Une commande de la puce portant un port (DIO2) | Rien à poser : la broche ne touche pas le réseau RF, elle reste hors modèle | existe |
| Une commande d'un composant intermédiaire (V1, V2 d'un switch) | La déclarer hors modèle avec `! broches` dans son Touchstone ; la marche ne passe plus par elle | existe |

## Les autres cas, et ce qui existe

- **Une broche partagée émission et réception** (TRX, antenne commune). C'est un seul port ;
  le sens se choisit par l'état du switch, avec l'un des fichiers `.sNp` de la colonne
  « Modèle Simulation ». Existe.
- **Une puce à deux sorties** (par exemple basse puissance et haute puissance). Aujourd'hui
  vous en posez une comme port et l'autre comme broche annexe, puis vous refaites avec
  l'autre. Les deux ensemble demandent les N ports, dans la spec mais pas codés
  ([../../SPEC-rf-multiports.md](../../SPEC-rf-multiports.md)).
- **Un balun, un filtre, un coupleur.** On lui lie son Touchstone à N ports (`! broches`
  nomme les pattes, `! masse` la référence). Existe. Sans `! broches`, le fichier prend toutes
  les broches du composant, commandes comprises : la marche passe alors par elles.
- **Un composant actif** (amplificateur, mélangeur). Seulement par son Touchstone. Un
  transistor ou une diode SPICE est refusé : il faudrait un point de polarisation.

## La suite

Poser les ports, régler leur impédance, lire la fiche, essayer un « et si », lier un modèle de
simulation et connaître les limites : voir [Simulation RF](10-simulation-rf-em.md).
