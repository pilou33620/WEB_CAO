/* =============================================================================
   commun/simulation-rapport.js
   Le rapport d'une simulation : tout ce qui caractérise le calcul affiché, dans
   une fenêtre qu'on copie, imprime ou enregistre.

   LE MÊME QUE CELUI DE WEB_ANTENNA, et c'est voulu : même bouton
   (« 📋 Rapport »), même fenêtre, mêmes trois sorties — Markdown au
   presse-papier, impression / PDF, fichier .html autonome — et même feuille
   (simulation-rapport.css, reprise de WEB_ANTENNA/css/rapport.css). Qui sait
   lire l'un sait lire l'autre.

   UN SEUL RAPPORT POUR TOUTES LES ANALYSES. Chacune a déjà sa fiche, et la
   fiche EST le résultat complet : le rapport ne la réécrit pas, il la REPREND
   telle qu'elle est affichée — les figures sont des SVG, elles se recopient —,
   les champs remplacés par leur valeur et les boutons ôtés. Ce qu'il ajoute,
   c'est ce que la fiche suppose connu de qui la lit dans le panneau :

     · les chiffres clés en tête, un extracteur par analyse (`SIM_RAP_KPI`) ;
     · les constats rangés par gravité, relus dans la fiche elle-même — le
       verdict, les erreurs, les réserves, les notes. Ce sont ceux que la
       fiche affiche : le rapport ne juge rien qu'elle n'ait jugé ;
     · la piste : ses nets, ses couches, ses longueurs et ses largeurs, tirés
       du DOCUMENT ENVOYÉ AU SERVEUR — c'est ce cuivre-là qui a été calculé,
       pas celui sélectionné depuis —, et l'empilage sur lequel elle a été
       résolue ;
     · les réglages, relus dans les champs du panneau.

   Une analyse ajoutée à SIM_ANALYSES a donc son rapport sans rien écrire ici ;
   elle n'a ses chiffres clés qu'avec une entrée dans `SIM_RAP_KPI`.

   Le bouton vit dans la rangée des onglets (`simOnglets`), à côté du repli
   des réglages : il vaut pour toutes les analyses, comme lui.
   ============================================================================= */
"use strict";

const SIM_RAP_ORDRE={ok:0, info:1, warn:2, crit:3};
const SIM_RAP_GLYPHE={crit:"✗", warn:"⚠", info:"ℹ", ok:"✓"};

/* Le résultat de l'analyse courante, le document qui l'a produit, et ses
   réglages bruts (`regl`, ce qui part en annexe JSON). Chaque analyse range
   les siens ailleurs : c'est la seule table à tenir à jour. */
function simRapSauf(o,cles){const c={};for(const k of Object.keys(o||{}))if(cles.indexOf(k)<0)c[k]=o[k];return c;}
const SIM_RAP_ETAT={
  impedance:()=>({res:SIM.res, doc:SIM.doc, regl:SIM.saisie}),
  diff:     ()=>({res:SIM.res, doc:SIM.doc, regl:SIM.saisie}),
  retour:   ()=>({res:SIM.res, doc:SIM.doc, regl:SIM.saisie}),
  crosstalk:()=>({res:SIM_XT.res, doc:SIM_XT.doc, regl:SIM_XT.saisie}),
  oeil:     ()=>({res:SIM_OEIL.res, doc:SIM_OEIL.doc, regl:SIM_OEIL.saisie}),
  dc:       ()=>({res:SIM.resDC, doc:null,
                  regl:{budget:SIM.dcBudget, ambiante_C:SIM.dcAmbiante, lambda:SIM.dcLambda}}),
  pdn:      ()=>({res:SIM_PDN.result, doc:null,
                  regl:simRapSauf(SIM_PDN,["result","erreur","occupe","fiche","chargeInfo"])}),
  bus:      ()=>({res:SIM_BUS.result, doc:null, regl:simRapSauf(SIM_BUS,["result","erreur"])}),
  s21:      ()=>({res:SIM_RF.res, doc:null,
                  regl:{composants:SIM_RF.composants, surcharges:SIM_RF.surcharges}}),
  verif:    ()=>({res:SIM_CARTE.res, doc:null, regl:SIM_CARTE.reglages})
};

/* =============================================================================
   1. Les chiffres clés, analyse par analyse
   -----------------------------------------------------------------------------
   Chaque extracteur rend des cartes {lbl, val, detail, rang} — rang : ok,
   warn, crit, accent, ou rien. Il ne recalcule rien : il relit ce que la
   fiche a déjà chiffré, par les mêmes fonctions qu'elle.
   ============================================================================= */
const SIM_RAP_XT_RANG={vert:"ok", orange:"warn", rouge:"crit"};
function simRapRangBudget(v,budget){
  return v>budget?"crit":(v>0.8*budget?"warn":"ok");
}

const SIM_RAP_KPI={
  impedance(r){
    const L=r.ligne||{}, gr=simGrouper(r.segments||[]);
    const sortis=gr.filter(g=>g.seg.z0>0&&simZVerdict(g.seg.z0)!==0);
    const mm=sortis.reduce((a,g)=>a+g.longueur,0);
    return [
      {lbl:"Z₀ moyen pondéré", val:simNb(L.z0_moyen,1)+" Ω",
       detail:simNb(L.z0_min,1)+" – "+simNb(L.z0_max,1)+" Ω à "+simFreq(r.f_centre),
       rang:sortis.length?"crit":"ok"},
      {lbl:"Cible", val:simNb(SIM.saisie.cible,1)+" Ω", rang:"accent",
       detail:"± "+simNb(simZTolAbs(),1)+" Ω · "+(sortis.length
         ? sortis.length+" section(s) hors tolérance, "+simNb(mm,2)+" mm"
         : "tout dans la tolérance")},
      {lbl:"Longueur", val:simNb(L.longueur,2)+" mm",
       detail:L.troncons+" tronçon(s)"},
      {lbl:"Retard / pertes", val:simRetard(L.retard),
       detail:simNb(L.pertes_db,2)+" dB à "+simFreq(r.f_centre)}
    ];
  },
  diff(){
    const p=simCouplagePaires(), d=p.filter(f=>f.differentielle);
    const cible=SIM.saisie.cibleDiff, tol=cible*SIM.saisie.tolDiffPct/100;
    const z=(d.length?d:p).map(f=>f.z_diff).filter(v=>v!=null);
    const zc=(d.length?d:p).map(f=>f.z_commune).filter(v=>v!=null);
    const dehors=d.filter(f=>f.z_diff!=null&&Math.abs(f.z_diff-cible)>tol).length;
    const plage=v=>v.length?simNb(Math.min(...v),1)+
      (v.length>1?" – "+simNb(Math.max(...v),1):"")+" Ω":"—";
    return [
      {lbl:"Z différentielle", val:plage(z),
       detail:"cible "+simNb(cible,0)+" Ω ± "+simNb(tol,1)+" Ω",
       rang:!d.length?"warn":(dehors?"crit":"ok")},
      {lbl:"Z de mode commun", val:plage(zc), detail:"mode pair"},
      {lbl:"Paires déclarées", val:String(d.length),
       detail:p.length+" longement(s) au total"+(dehors?" · "+dehors+" hors tolérance":"")}
    ];
  },
  crosstalk(r){
    const couples=r.couples||[], conf=couples.filter(c=>c.confirmee);
    const st=simXtPireStatut(conf.map(c=>simXtStatuts(c).paire));
    const pire=couples.filter(c=>!c.non_calcule).slice()
      .sort((a,b)=>Math.max(b.next,b.fext)-Math.max(a.next,a.fext))[0];
    const k=[
      {lbl:"Statut niveau 2", val:conf.length?st.toUpperCase():"aucune victime",
       detail:conf.length+" victime(s) confirmée(s)"+
         ((r.graves||[]).length?" · "+r.graves.length+" réserve(s)":""),
       rang:conf.length?SIM_RAP_XT_RANG[st]:"ok"},
      {lbl:"Agresseur", val:r.principal||"—", rang:"accent",
       detail:"t_r "+simDureeXt(r.t_r)+" · "+simNb(r.longueur,2)+" mm"}
    ];
    if(pire){
      const s=simXtStatuts(pire);
      k.push({lbl:"NEXT — "+pire.victime, val:simXtPct(pire.next)+" %",
              detail:simXtDb(pire.next_db)+" dB", rang:SIM_RAP_XT_RANG[s.next]});
      k.push({lbl:"FEXT — "+pire.victime, val:simXtPct(pire.fext)+" %",
              detail:simXtDb(pire.fext_db)+" dB · k_total "+simXtPct(pire.k_total)+" %",
              rang:SIM_RAP_XT_RANG[s.fext]});
    }
    return k;
  },
  oeil(r){
    const m=r.mesures||{}, g=r.gabarit, s=SIM_OEIL.saisie;
    const k=[
      {lbl:"Hauteur d'œil", val:simOeilV(m.hauteur_prbs),
       detail:"pire cas "+simOeilV(m.hauteur_pire)},
      {lbl:"Largeur d'œil", val:simNb(m.largeur_prbs_ui,2)+" UI",
       detail:"pire cas "+simNb(m.largeur_pire_ui,2)+" UI"},
      {lbl:"Débit", val:simNb(s.debit/1e6,s.debit>=1e9?0:1)+" Mb/s", rang:"accent",
       detail:String(r.motif||s.motif||"").toUpperCase()+" · t_r "+simOeilT(s.tr)}
    ];
    if(g&&g.polygone&&g.polygone.length)
      k.push({lbl:"Marge — "+g.nom, val:simNb(100*m.marge,0)+" %",
              detail:"pire cas "+simNb(100*m.marge_pire,0)+" %",
              rang:m.marge<0?"crit":(m.marge_pire<0?"warn":"ok")});
    return k;
  },
  dc(r){
    const m=simDCMesures(r), bud=SIM.dcBudget;
    let I=0;
    for(const n of Object.keys(r.courant_par_net||{}))I+=Math.abs(r.courant_par_net[n]);
    return [
      {lbl:"Pire chute", val:m.pire?simNb(m.pire.chute*1e3,1)+" mV":"—",
       detail:m.pire?(m.pire.repere||"—")+(m.pct!=null?" · "+simNb(m.pct,2)+
         " % (budget "+simNb(bud.chute,0)+" %)":""):"aucune charge",
       rang:m.pct==null?"":simRapRangBudget(m.pct,bud.chute)},
      {lbl:"Échauffement", val:"+"+simNb(m.dt,1)+" °C",
       detail:(m.dtNet||"—")+" → "+simNb(SIM.dcAmbiante+m.dt,1)+" °C (budget "+
         simNb(bud.dt,0)+" °C)",
       rang:simRapRangBudget(m.dt,bud.dt)},
      {lbl:"Courant total", val:simNb(I,3)+" A",
       detail:(r.couches||[]).length+" couche(s) · "+(r.n_vias||0)+" trou(s)"},
      {lbl:"Trame", val:simNb(r.pas,3)+" mm", detail:(r.n_noeuds||0)+" nœuds"}
    ];
  },
  pdn(r){
    const P=SIM_PDN;
    return [
      {lbl:"Z max", val:simPDNFormatZ(r.zMax), detail:"à "+simPDNFormatFreq(r.fZMax),
       rang:r.conforme?"ok":"crit"},
      {lbl:"Z cible", val:simPDNFormatZ(r.zTarget), rang:"accent",
       detail:"ΔI "+(P.deltaIA*1e3).toPrecision(3)+" mA · ondulation "+
         P.ripplePct+" % de "+P.vdd+" V"},
      {lbl:"Rail", val:P.rail||"—",
       detail:(P.condensateurs||[]).length+" condensateur(s) au modèle"},
      {lbl:"Bande", val:simPDNFormatFreq(P.fMin)+" – "+simPDNFormatFreq(P.fMax),
       detail:P.nbPoints+" points"}
    ];
  },
  bus(r){
    const B=SIM_BUS;
    return [
      {lbl:"Statut", val:r.allPass?"CONFORME":"VIOLATIONS",
       detail:r.protoNom||r.protocole||"", rang:r.allPass?"ok":"crit"},
      {lbl:"Liaison", val:B.nom||"—", rang:"accent",
       detail:(B.comp1&&B.comp2?B.comp1+" ➔ "+B.comp2+" · ":"")+
         (r.signals||[]).length+" signal(aux)"}
    ];
  },
  s21(r){
    const b=r.bilan||{};
    return [
      {lbl:"S₂₁ à "+simFreq(b.f), val:simNb(b.s21_db,2)+" dB", rang:"accent",
       detail:simNb(Math.pow(10,b.s21_db/10)*100,1)+" % de la puissance disponible"},
      {lbl:"S₁₁ / S₂₂", val:simNb(b.s11_db,1)+" / "+simNb(b.s22_db,1)+" dB",
       detail:"adapté sous −10 dB", rang:b.s11_db>-10?"crit":"ok"},
      {lbl:"Z vue par la puce", val:b.zin?simRfZTxt(b.zin):"—",
       detail:b.zin_cible?"cible "+simRfZTxt(b.zin_cible):""},
      {lbl:"Pertes", val:simNb(b.perte_desadaptation_db,2)+" dB",
       detail:"désadaptation · dissipées "+(b.perte_dissipee_db==null?"—":
         simNb(b.perte_dissipee_db,2)+" dB")}
    ];
  },
  verif(r){
    const T=simCarteTri(), c={critique:0, vigilance:0, info:0};
    for(const i of T.signal)c[r.constats[i].severite]++;
    return [
      {lbl:"Critiques", val:String(c.critique), detail:"constats sur les nets",
       rang:c.critique?"crit":"ok"},
      {lbl:"Vigilance", val:String(c.vigilance), rang:c.vigilance?"warn":"ok"},
      {lbl:"Info", val:String(c.info)},
      {lbl:"Dérogations", val:String(T.acceptes.length),
       detail:T.marquages.length+" marquage(s) sans net"}
    ];
  }
};

/* =============================================================================
   1 bis. Ce que calcule chaque analyse
   -----------------------------------------------------------------------------
   UN RAPPORT DOIT SE LIRE SANS LE LOGICIEL. Celui qui le reçoit — un collègue,
   un client, une IA à qui on le colle — n'a ni le panneau ni ses infobulles :
   « NEXT 4,2 % orange » ne lui dit rien s'il ne sait pas sous quel front,
   contre quels seuils, et ce que le modèle ignore. Chaque analyse dit donc ici
   sa méthode, ses grandeurs, ses critères et ses limites, en clair.
   ============================================================================= */
const SIM_RAP_GUIDE={
  impedance:{
    methode:"La section droite de chaque tronçon est résolue par méthode des moments 2D quasi-TEM (python/ligne_mom.py) : microruban, triplaque, coplanaire avec masse latérale, centrée ou non. La dispersion en fréquence est ajoutée par le modèle de Getsinger. Les paramètres S de la liaison entière sont obtenus par mise en cascade des matrices ABCD des tronçons, coudes et vias compris en éléments localisés. Vérifié à 0,4 % contre Hammerstad-Jensen (microruban) et 0,3 % contre la solution exacte (triplaque).",
    grandeurs:["Z₀ : impédance caractéristique d'un tronçon, en Ω, à la fréquence centrale f₀","Moyenne pondérée : Z₀ moyen pondéré par la longueur","Retard : temps de propagation cumulé le long du parcours","Pertes : pertes d'insertion cumulées (conducteur + diélectrique) à f₀, en dB","S₁₁ : réflexion à l'entrée ; S₂₁ : transmission, sur la bande S, ports à l'impédance de référence"],
    criteres:"Chaque section est jugée contre la cible ± tolérance. Sur la carte : bleu = dans la tolérance, rouge = trop haut (piste trop étroite ou trop loin de son plan), vert = trop bas (piste trop large ou trop près de son plan). Le vert ne veut donc pas dire « bon ».",
    limites:"Suite de sections uniformes : pas de rayonnement, pas de cavité entre plans hors du chemin de retour, ports idéaux posés au bout du cuivre (S₁₁ meilleur qu'une mesure au VNA). Le couplage aux voisines est calculé à part (onglet Z différentielle) et n'entre pas dans le Z₀."
  },
  diff:{
    methode:"Section à N conducteurs résolue par méthode des moments : matrice de capacité de Maxwell [C], puis [L] = μ₀ε₀[C₀]⁻¹. Les modes pair et impair en sortent. Chaque tronçon est repris à SON écart réel avec la piste voisine.",
    grandeurs:["Z différentielle = 2 × Z impair : ce que voit un récepteur différentiel","Z de mode commun = Z pair / 2","Longement : portion où deux pistes se suivent à portée de couplage","Paire déclarée : reconnue par l'outil ou par les suffixes _P/_N, +/−"],
    criteres:"Les paires déclarées sont jugées contre la cible différentielle ± tolérance (100 Ω par défaut ; 90 Ω pour l'USB 2.0, 100 Ω pour l'Ethernet). Les longements non déclarés sont un renseignement, pas une erreur.",
    limites:"Section droite : les pistes superposées sur deux couches sont signalées mais pas chiffrées. Sans masse coplanaire à portée, le couplage est calculé sans elle, donc majoré."
  },
  crosstalk:{
    methode:"Niveau 2, scan normalisé : un échelon unitaire sur l'AGRESSEUR (la piste sélectionnée), lignes adaptées aux deux bouts, front de montée t_r. Le long du parcours, [C] et [L] sont résolus bloc par bloc par méthode des moments. k_total = ½(Cm/C₁₁ + Lm/L₁₁), K_b = k_total/2, K_f = ½(Lm/L₁₁ − Cm/C₁₁). NEXT = K_b si 2T_d ≥ t_r (saturé), K_b·2T_d/t_r sinon ; FEXT = |K_f|·T_d/t_r, T_d sommé sur le couplage.",
    grandeurs:["NEXT : bruit au bout PROCHE de la victime, en % de l'amplitude de l'agresseur","FEXT : bruit au bout LOINTAIN, en %","k_total : coefficient de couplage","Victime confirmée : voisine au-dessus du seuil de confirmation (−40 dB par défaut)","Agresseur : la sélection ; une victime : toute piste qui la longe"],
    criteres:"Chaque victime est jugée sur le pire de ses deux bouts : vert < 3 % ≤ orange ≤ 7 % < rouge (seuils réglables). NEXT et FEXT ne s'additionnent jamais (pas au même point). Le partenaire d'une paire différentielle déclarée n'est pas une victime.",
    limites:"Le chiffre est ce que chaque victime prend à CET agresseur : un minorant de son bruit total. Une voisine « non calculée » (sans plan de référence) n'est pas une voisine à couplage nul. Le FEXT varie comme 1/t_r : un t_r imposé par la classe du net est une hypothèse."
  },
  retour:{
    methode:"Pour chaque via de la sélection qui change de couche : recherche des vias de masse qui referment la boucle du courant de retour, de leur distance et de leur part, puis inductance de boucle (Grover), résonance quart d'onde du moignon de via, et rayonnement de la boucle à l'amplitude saisie.",
    grandeurs:["Inductance de boucle du retour, en nH","Distance au via de retour le plus proche, en mm","Changement de référence : la piste passe d'un plan à un autre","Moignon : la partie du via qui dépasse la couche utile"],
    criteres:"Un changement de plan de référence sans via de couture qui raccorde les deux plans est grave : le retour passe par la cavité. Un via sans retour proche est en vigilance. Sans boucle refermée, l'inductance est un plancher.",
    limites:"Le retour par la cavité entre plans n'est chiffré qu'au raccord ; le rayonnement est une estimation de la boucle, donnée comme un plancher."
  },
  bus:{
    methode:"Fermeture temporelle d'un bus synchrone : temps de vol de chaque signal calculé sur sa longueur physique et l'empilage, skew relatif à l'horloge, marges de setup et de hold face aux temps du composant (tsu, th, tco min/max). En I²C : capacité du bus et temps de montée avec la résistance de tirage.",
    grandeurs:["Temps de vol : retard de propagation de chaque net","Skew : écart de temps de vol entre une donnée et son horloge","Marge de setup / hold : ce qui reste une fois tco, temps de vol et skew décomptés","C_bus, t_r (I²C) : capacité totale et temps de montée"],
    criteres:"Conforme si toutes les marges de setup et de hold sont positives (I²C : C_bus et t_r sous les limites du mode). Une violation se corrige par serpentin ou résistance série.",
    limites:"Modèle de temps de vol : ni réflexions, ni diaphonie. Les temps du composant viennent de la saisie."
  },
  oeil:{
    methode:"La liaison est calculée comme sous « Impédance » (section droite, pertes, coudes, vias), fermée sur l'émetteur (Rs) et le récepteur (RL, CL, ou modèles IBIS), puis passée en temporel. L'œil PRBS superpose les bits d'une séquence ; l'œil pire cas prend la pire combinaison de voisins (distorsion crête) ; l'œil statistique, s'il est demandé, ajoute gigue et bruit à un BER cible.",
    grandeurs:["Hauteur d'œil : ouverture verticale, en V","Largeur d'œil : ouverture horizontale, en UI (intervalle unitaire = 1/débit)","Marge sur le gabarit : de combien l'œil peut rétrécir avant de toucher le gabarit du protocole, en %"],
    criteres:"Le gabarit du protocole (USB, PCIe, HDMI, LVDS, MIPI…) dit si la liaison passe. Respecté en PRBS mais pas au pire cas = vigilance.",
    limites:"Sans IBIS, émetteur et récepteur sont linéaires. Gigue, bruit et diaphonie des voisines ne comptent que s'ils sont saisis."
  },
  dc:{
    methode:"Problème résistif sur tout le cuivre du net — pistes, plans, pastilles, vias, toutes couches : réseau de résistances sur une trame carrée, résolu par gradient conjugué (python/dc_solver.py, vérifié contre ρL/(Wt) sur 16 cas). L'échauffement est calculé par étalement dans la carte (conductivité du stratifié, cuivre étaleur) ; IPC-2221 est donné en comparaison.",
    grandeurs:["Source : une alimentation, réglée en tension (V)","Charge : un consommateur, réglé en courant (A)","Chute : tension perdue entre la source et la charge, en mV et en % de la source","Échauffement : élévation de température du cuivre au point chaud, en °C","Courant par via : la part du courant que porte chaque trou"],
    criteres:"Chute et échauffement sont jugés contre leurs budgets (5 % et 10 °C par défaut). Au-delà de 80 % d'un budget, la marge est jugée insuffisante.",
    limites:"Courant continu seulement. Les courants des charges viennent de la saisie, pas du schéma."
  },
  pdn:{
    methode:"Impédance Z(ω) du réseau de distribution vue par le composant alimenté, de 10 kHz à 1 GHz : régulateur (R_vrm, f_vrm), condensateurs de découplage avec leurs ESR/ESL (modèles Murata quand ils existent), et modes de cavité de la paire de plans (TMmn) à la position du port.",
    grandeurs:["Z(f) : impédance vue par le composant, en Ω","Z cible = V_dd × ondulation % / ΔI","Z max et sa fréquence : le pire point de la courbe","Ondulation estimée : ΔV = ΔI × Z(f) pour chaque appel de courant"],
    criteres:"Conforme si Z(f) reste sous Z cible sur toute la bande. Une résonance au-dessus de la cible se corrige par un condensateur dont la résonance série tombe à cette fréquence.",
    limites:"Modèle à un port ; les modes de cavité supposent un plan rectangulaire. ΔI et l'ondulation admise viennent de la saisie."
  },
  s21:{
    methode:"Chaîne RF entre deux ports d'impédance complexe — la sortie d'une puce et un connecteur ou une antenne : pistes calculées par le solveur de section, composants par leurs modèles SPICE ou Touchstone, assemblage nodal.",
    grandeurs:["S₂₁ : transmission à f₀, en dB, et la part de puissance disponible qu'elle représente (|S₂₁|²)","S₁₁ / S₂₂ : réflexions côté puce et côté charge","Z vue par la puce, comparée à sa cible (l'impédance conjuguée de la puce)","Pertes : par désadaptation, et dissipées dans les pistes et composants"],
    criteres:"Adapté si S₁₁ < −10 dB à f₀. Bien adapté mais plus de 1 dB dissipé : ce sont les pertes, pas l'adaptation, qu'il faut regarder.",
    limites:"Quasi-statique jusqu'à la fréquence de validité indiquée ; au-delà, le rayonnement et les modes supérieurs manquent."
  },
  verif:{
    methode:"Audit de toute la carte, tous les nets, sans sélection : fabrication (angles aigus, droits, jonctions en T, segments hors 45°, bouts orphelins, bord de carte) et empilage ; puis, à la cadence de chaque classe de net, l'impédance, le retour de chaque via qui change de couche, les fentes des plans de référence, les vias de couture, la diaphonie, les paires différentielles, le découplage, les moignons de vias et les branches en T ; et sans fréquence, les quartz, la protection ESD des connecteurs et le courant des rails.",
    grandeurs:["Constat : un défaut localisé, sur un net, avec sa règle et sa valeur","Valeur jugée : un pourcentage, ou un rapport à λ/20, λ/40 à la cadence de la classe","Cadence de classe : la fréquence qui fixe le front de chaque net (Lent, Rapide, RF…)"],
    criteres:"Chaque constat est critique, vigilance ou info. Les dérogations acceptées par l'utilisateur ne comptent plus. Les nets classés « Lent » par défaut ne sont pas vérifiés en fréquence.",
    limites:"Règles et modèles réduits, pour couvrir toute la carte : un constat se confirme dans l'analyse dédiée (Impédance, Crosstalk, Current Return Path)."
  }
};

/* LES DONNÉES BRUTES, LISIBLES. Le résultat du serveur porte TOUT — les
   courbes en points, les sections, les hypothèses —, mais en entier il
   dépasse vite ce qu'on colle dans une conversation. Les nombres gardent cinq
   chiffres significatifs, les longues listes sont sous-échantillonnées
   (même pas pour des listes de même longueur : les fréquences et les S
   restent alignés), et l'on resserre jusqu'à tenir dans la taille visée. */
const SIM_RAP_JSON_MAX=60000;
function simRapCompact(v,pts,prof){
  if(typeof v==="number")return isFinite(v)?+v.toPrecision(5):null;
  if(v==null||typeof v==="string"||typeof v==="boolean")return v;
  if(typeof v!=="object"||prof>8||v.nodeType||
     (typeof ImageData!=="undefined"&&v instanceof ImageData))return undefined;
  if(ArrayBuffer.isView(v))v=Array.from(v);
  if(Array.isArray(v)){
    if(v.length<=pts)return v.map(x=>simRapCompact(x,pts,prof+1));
    const pas=Math.ceil(v.length/pts), out=[];
    for(let i=0;i<v.length;i+=pas)out.push(simRapCompact(v[i],pts,prof+1));
    out.push("… "+v.length+" valeurs, une sur "+pas+" gardée");
    return out;
  }
  const o={};
  for(const k of Object.keys(v)){
    const c=simRapCompact(v[k],pts,prof+1);
    if(c!==undefined)o[k]=c;
  }
  return o;
}
function simRapJson(obj){
  if(!obj)return "";
  let t="";
  for(const pts of [64,24,8,3]){
    t=JSON.stringify(simRapCompact(obj,pts,0),null,1);
    if(t.length<=SIM_RAP_JSON_MAX)return t;
  }
  return t.slice(0,SIM_RAP_JSON_MAX)+"\n… (tronqué)";
}

/* =============================================================================
   2. La piste : le cuivre envoyé au serveur, et son empilage
   ============================================================================= */
function simRapPiste(doc){
  if(!doc||!doc.geometry)return null;
  const pile=(doc.stackup&&doc.stackup.layers)||[];
  const cu=pile.filter(l=>l.type==="copper");
  const nomCouche=c=>typeof c==="number"?((cu[c]&&cu[c].name)||"Cu "+(c+1))
                                        :String(c==null?"—":c);
  const parCle=new Map();
  for(const o of (doc.geometry.objects||[])){
    const couche=nomCouche(o.layer), cle=(o.net||"")+"\u0000"+couche;
    let l=parCle.get(cle);
    if(!l)parCle.set(cle,l={net:o.net||"—", couche:couche, n:0, mm:0, largeurs:new Set()});
    l.n++;
    l.mm+=o.length>0?o.length
         :(o.start&&o.end?Math.hypot(o.end[0]-o.start[0],o.end[1]-o.start[1]):0);
    if(o.width>0)l.largeurs.add(simNb(o.width,3));
  }
  return {carte:doc.carte||"", net:doc.net||"",
          lignes:[...parCle.values()],
          vias:(doc.vias||[]).length,
          voisins:(doc.voisinage||[]).length,
          masse:doc.reference_nets||[],
          paires:doc.paires||[],
          empilage:pile};
}

/* Les bornes de la chute DC : c'est SA « piste » — ce qui alimente, ce qui
   consomme, et ce qui arrive à chacun. */
function simRapBornes(res){
  return ((res&&res.bornes)||[]).map(b=>({
    repere:b.repere||"—", net:b.net||"",
    role:b.role==="tension"?"source":"charge",
    consigne:b.role==="tension"?simNb(b.consigne,3)+" V":simNb(b.consigne,3)+" A",
    chute:b.chute!=null?simNb(b.chute*1e3,1)+" mV":"—"
  }));
}

/* =============================================================================
   3. Ce qui se relit dans la page : les réglages, les constats, la fiche
   ============================================================================= */
/* Le nom d'un champ, et ce qu'il veut dire. Le NOM est ce que le panneau
   affiche devant lui : son étiquette englobante (une case à cocher), ou
   l'étiquette de rangée qui le précède immédiatement (« Tolérance »). La
   DESCRIPTION est le début de son infobulle — « Fréquence centrale : c'est à
   celle-ci… » donne « Fréquence centrale » —, qui sert aussi de nom quand le
   panneau n'en écrit pas (« Fin de bande », après la flèche). */
function simRapNomChamp(e){
  const desc=(e.getAttribute("title")||e.getAttribute("placeholder")||"")
               .split(/[,.:;(—]/)[0].trim().slice(0,80);
  const lab=e.closest&&e.closest("label");
  const p=e.previousElementSibling;
  const nom=(lab&&lab.textContent.trim())||
            (p&&p.classList&&p.classList.contains("pnl-lbl")?p.textContent.trim():"");
  return {nom:nom||desc||e.id||e.name||"champ", desc:nom&&desc!==nom?desc:""};
}
function simRapValeurChamp(e){
  if(e.type==="checkbox")return e.checked?"oui":"non";
  if(e.tagName==="SELECT"){
    const o=e.options[e.selectedIndex];
    return o?o.text:e.value;
  }
  return e.value;
}
/* UNE VALEUR SANS SON UNITÉ NE SE RELIT PAS : 868 ne dit rien, 868 MHz si.
   L'unité est le voisin immédiat — une liste (`simChampUnite`) ou une
   étiquette `.simU` — et elle rejoint la valeur au lieu de faire sa ligne. */
function simRapReglages(){
  const ctl=simEl("simCtl");
  if(!ctl||!ctl.querySelectorAll)return [];
  const out=[];
  ctl.querySelectorAll("input, select, textarea").forEach(function(e){
    if(/^(button|file|hidden|submit)$/.test(e.type)||/Unite/i.test(e.id))return;
    if(e.type==="radio"&&!e.checked)return;
    let v=String(simRapValeurChamp(e)==null?"":simRapValeurChamp(e)).trim();
    if(!v)return;
    const u=e.nextElementSibling;
    if(u&&u.tagName==="SELECT"&&/Unite/i.test(u.id))v+=" "+simRapValeurChamp(u);
    else if(u&&u.classList&&u.classList.contains("simU"))v+=" "+u.textContent.trim();
    const n=simRapNomChamp(e);
    out.push({nom:n.nom, desc:n.desc, val:v});
  });
  return out;
}

/* Les constats de la fiche, tels qu'elle les affiche. Le TEXTE sert de clé, et
   le plus grave passe en premier : une réserve (`.simNote.simAlerte`) ne
   revient pas une seconde fois comme simple note. */
function simRapConstats(box){
  const out=[], vus=new Set();
  if(!box||!box.querySelectorAll)return out;
  const plat=e=>String(e&&e.textContent||"").replace(/\s+/g," ").trim()
                  .replace(/^·\s*/,"");
  const pose=(rang,titre,desc)=>{
    const cle=desc||titre;
    if(!cle||vus.has(cle))return;
    vus.add(cle); out.push({rang, titre, desc});
  };
  box.querySelectorAll(".simErr").forEach(e=>pose("crit","Erreur",plat(e)));
  box.querySelectorAll(".simVerdict").forEach(function(e){
    const sp=e.querySelector("span");
    const tout=plat(e), detail=plat(sp);
    pose(e.classList.contains("dehors")?"crit":(e.classList.contains("limite")?"warn":"ok"),
         detail?tout.slice(0,tout.length-detail.length).trim():tout, detail);
  });
  box.querySelectorAll(".simXtResume").forEach(function(e){
    const st=(/simXtN-(\w+)/.exec(e.className)||[])[1];
    pose(SIM_RAP_XT_RANG[st]||"info",plat(e.querySelector(".simXtVerdict")),
         plat(e.querySelector(".simXtCompte")));
  });
  box.querySelectorAll(".simXtAlerte, .simAlerte").forEach(e=>pose("warn","Réserve",plat(e)));
  box.querySelectorAll(".simNote").forEach(e=>pose("info","",plat(e)));
  /* Le grave d'abord, puis le VERDICT — c'est la réponse —, puis les notes,
     qui disent ce que le modèle ne couvre pas. */
  const rangLecture={crit:0, warn:1, ok:2, info:3};
  return out.sort((a,b)=>rangLecture[a.rang]-rangLecture[b.rang]);
}

/* La fiche affichée, recopiée. Les champs deviennent leur valeur — la table
   des composants RF porte ses valeurs dans des champs —, les boutons partent,
   les blocs repliés s'ouvrent : un rapport n'a rien à cliquer. */
function simRapFiche(){
  const box=simEl("simSortie");
  if(!box||!box.cloneNode)return null;
  const c=box.cloneNode(true);
  c.removeAttribute("id");
  c.className="rap-fiche";
  c.querySelectorAll("button, .simProgres").forEach(e=>e.remove());
  c.querySelectorAll("input, select, textarea").forEach(function(e){
    const src=e.id?document.getElementById(e.id):null;
    if(e.type==="file"||e.type==="hidden"){e.remove();return;}
    e.replaceWith(document.createTextNode(simRapValeurChamp(src||e)));
  });
  c.querySelectorAll("details").forEach(d=>d.setAttribute("open",""));
  return c;
}

/* =============================================================================
   4. La collecte
   ============================================================================= */
function simRapCollecter(){
  const cle=SIM.analyse, a=simAnalyse(), fam=simFamille();
  const etat=(SIM_RAP_ETAT[cle]||(()=>({})))();
  const d={
    date:new Date(),
    outil:(SIM_ED&&SIM_ED.outil)||"",
    carte:(SIM_ED&&SIM_ED.carte?SIM_ED.carte():"")||"",
    famille:fam?fam.court+" — "+fam.nom:"",
    analyse:a?a.nom:"",
    quoi:a?a.titre:"",
    cle:cle,
    res:etat.res||null,
    regl:etat.regl||null,
    guide:SIM_RAP_GUIDE[cle]||null,
    kpis:[], constats:[], piste:null, bornes:[], reglages:[], texte:"",
    fiche:simRapFiche()
  };
  if(d.res&&SIM_RAP_KPI[cle]){
    try{ d.kpis=SIM_RAP_KPI[cle](d.res); }
    catch(e){ d.kpis=[]; }
  }
  /* SANS EXTRACTEUR, la ligne de contexte de la fiche (`.simMeta`) tient lieu
     de chiffres clés : c'est déjà ce qu'elle résume. */
  if(d.res&&!d.kpis.length&&d.fiche)
    d.kpis=[...d.fiche.querySelectorAll(".simMeta span")].map(s=>
      ({lbl:d.analyse, val:s.textContent.trim()})).filter(k=>k.val);
  d.piste=simRapPiste(etat.doc);
  if(cle==="dc")d.bornes=simRapBornes(d.res);
  d.reglages=simRapReglages();
  d.constats=simRapConstats(d.fiche);
  /* LES RAPPORTS TEXTE QUI EXISTENT DÉJÀ sont plus complets que la fiche
     recopiée — toutes les paires, toutes les hypothèses : ils partent avec. */
  try{
    if(cle==="crosstalk"&&d.res)d.texte=simXtRapportTexte(d.res);
    else if(cle==="verif"&&d.res)d.texte=simCarteTexte();
  }catch(e){ d.texte=""; }
  /* Le statut d'ensemble : le pire de ce qui a été vu. Sans résultat, rien
     n'est jugé — et c'est ce que le badge dit. */
  const rangs=d.kpis.map(k=>k.rang).concat(d.constats.map(k=>k.rang))
               .filter(r=>SIM_RAP_ORDRE[r]!=null);
  d.statut=!d.res?"info":rangs.reduce((p,r)=>SIM_RAP_ORDRE[r]>SIM_RAP_ORDRE[p]?r:p,"ok");
  d.statutTxt=!d.res?"Pas de résultat":{crit:"Anomalies détectées",
    warn:"Points de vigilance", info:"Conforme", ok:"Conforme"}[d.statut];
  return d;
}

/* =============================================================================
   5. Le rapport en HTML
   ============================================================================= */
function simRapSection(titre,note,corps){
  return '<div class="rap-sec"><div class="rap-sec-head">'+
    '<span class="rap-sec-titre">'+titre+'</span>'+
    '<span class="rap-sec-note">'+simEsc(note||"")+'</span></div>'+corps+'</div>';
}
function simRapTable(entetes,lignes){
  return '<div class="rap-table-wrap"><table class="rap-table">'+
    (entetes?'<thead><tr>'+entetes.map(t=>'<th>'+simEsc(t)+'</th>').join("")+'</tr></thead>':"")+
    '<tbody>'+lignes.map(l=>'<tr>'+l.map((c,i)=>
      '<td'+(i?' class="mono"':'')+'>'+simEsc(c)+'</td>').join("")+'</tr>').join("")+
    '</tbody></table></div>';
}

function simRapHtml(d){
  let h="";

  // 1. Chiffres clés
  if(d.kpis.length){
    h+='<div class="rap-sec"><div class="rap-kpis">';
    for(const k of d.kpis)
      h+='<div class="rap-kpi '+(k.rang||"")+'">'+
         '<span class="rap-kpi-lbl">'+simEsc(k.lbl)+'</span>'+
         '<span class="rap-kpi-val">'+simEsc(k.val)+'</span>'+
         (k.detail?'<span class="rap-kpi-detail">'+simEsc(k.detail)+'</span>':'')+
         '</div>';
    h+='</div></div>';
  }

  // 2. Constats
  if(d.constats.length||!d.res){
    let c='<div class="rap-diags">';
    if(!d.res)
      c+='<div class="rap-diag-item info"><div class="rap-diag-head">'+
         '<span class="rap-badge-statut info">INFO</span>'+
         '<span class="rap-diag-titre">Simulation non exécutée</span></div>'+
         '<div class="rap-diag-desc">Aucun résultat pour « '+simEsc(d.analyse)+
         ' ». Le rapport décrit ce qui est prêt à partir au calcul.</div></div>';
    for(const k of d.constats)
      c+='<div class="rap-diag-item '+k.rang+'"><div class="rap-diag-head">'+
         '<span class="rap-badge-statut '+k.rang+'">'+k.rang.toUpperCase()+'</span>'+
         (k.titre?'<span class="rap-diag-titre">'+simEsc(k.titre)+'</span>':'')+
         '</div>'+(k.desc?'<div class="rap-diag-desc">'+simEsc(k.desc)+'</div>':'')+'</div>';
    c+='</div>';
    h+=simRapSection("🛡️ Diagnostics & vigilance",
      d.constats.length+" point"+(d.constats.length>1?"s":"")+" relevé"+
      (d.constats.length>1?"s":"")+" dans la fiche",c);
  }

  // 3. La piste
  const p=d.piste;
  if(p){
    let c=p.lignes.length
      ? simRapTable(["Net","Couche","Tronçons","Longueur (mm)","Largeur(s) (mm)"],
          p.lignes.map(l=>[l.net,l.couche,String(l.n),simNb(l.mm,3),
                           [...l.largeurs].join(" · ")||"—"]))
      : '<p class="rap-vide">Aucun tronçon dans le document envoyé.</p>';
    const total=p.lignes.reduce((a,l)=>a+l.mm,0);
    c+='<div style="height:10px"></div>'+simRapTable(null,[
      ["Carte",p.carte||d.carte||"—"],
      ["Net calculé",p.net||"—"],
      ["Longueur totale",simNb(total,3)+" mm"],
      ["Vias de la sélection",String(p.vias)],
      ["Cuivre voisin à portée",p.voisins+" tronçon(s)"],
      ["Masse de référence",p.masse.join(", ")||"aucune"],
      ["Paires déclarées",p.paires.map(x=>x.join(" / ")).join(", ")||"—"]
    ]);
    h+=simRapSection("📏 La piste","le cuivre envoyé au calcul, en millimètres",c);
    if(p.empilage.length)
      h+=simRapSection("🧱 Empilage","de haut en bas",
        simRapTable(["Rang","Couche","Nature","Épaisseur (mm)","εr","tanδ","Rôle / net"],
          p.empilage.map((l,i)=>{
            const cu=l.type==="copper";
            return [String(i+1),l.name||"—",cu?"cuivre":"diélectrique",
                    simNb(l.thickness,4),cu?"—":simNb(l.epsilon_r,2),
                    cu?"—":simNb(l.tan_delta,4),
                    cu?(l.role||"")+(l.net?" · "+l.net:""):""];
          })));
  }
  if(d.bornes.length)
    h+=simRapSection("🔌 Bornes","sources et charges du calcul",
      simRapTable(["Repère","Net","Rôle","Consigne","Chute"],
        d.bornes.map(b=>[b.repere,b.net,b.role,b.consigne,b.chute])));

  // 4. Réglages
  if(d.reglages.length)
    h+=simRapSection("⚙️ Réglages de la simulation","tels que saisis dans le panneau",
      simRapTable(["Paramètre","Valeur","Description"],
        d.reglages.map(r=>[r.nom,r.val,r.desc||""])));

  // 5. Ce que calcule l'analyse
  const g=d.guide;
  if(g)
    h+=simRapSection("📘 Méthode & définitions","ce que calcule « "+d.analyse+" »",
      '<div class="rap-diags"><div class="rap-diag-item info">'+
        '<div class="rap-diag-titre">Méthode</div>'+
        '<div class="rap-diag-desc">'+simEsc(g.methode)+'</div>'+
        '<div class="rap-diag-titre">Grandeurs</div>'+
        '<div class="rap-diag-desc">'+g.grandeurs.map(simEsc).join("<br>")+'</div>'+
        '<div class="rap-diag-titre">Critères</div>'+
        '<div class="rap-diag-desc">'+simEsc(g.criteres)+'</div>'+
        '<div class="rap-diag-titre">Limites du modèle</div>'+
        '<div class="rap-diag-desc">'+simEsc(g.limites)+'</div>'+
      '</div></div>');

  // 6. La fiche
  h+=simRapSection("📊 Résultats détaillés",d.analyse,
    d.fiche&&d.fiche.textContent.trim()?d.fiche.outerHTML
      :'<p class="rap-vide">La fiche est vide.</p>');

  // 6. Le rapport texte de l'analyse
  if(d.texte)
    h+=simRapSection("🧾 Rapport texte complet","toutes les lignes, toutes les hypothèses",
      '<div class="rap-log-box" style="max-height:none">'+simEsc(d.texte)+'</div>');

  // 8. Les données brutes : repliées à l'écran, mais dans le fichier .html
  if(d.res)
    h+=simRapSection("🗂️ Données brutes du calcul","JSON, 5 chiffres significatifs",
      '<details><summary class="rap-sec-note" style="cursor:pointer">Afficher le '+
      'résultat du solveur</summary><div class="rap-log-box" style="max-height:none">'+
      simEsc(simRapJson(d.res))+'</div></details>');
  return h;
}

/* =============================================================================
   6. Le rapport en Markdown
   ============================================================================= */
function simRapMdTable(entetes,lignes){
  const cel=c=>String(c==null?"":c).replace(/\|/g,"\\|").replace(/\s+/g," ");
  return ["| "+entetes.map(cel).join(" | ")+" |",
          "|"+entetes.map(()=>"---").join("|")+"|"]
    .concat(lignes.map(l=>"| "+l.map(cel).join(" | ")+" |")).join("\n");
}
/* La fiche en texte : ses tableaux en tableaux Markdown, le reste en lignes.
   Les figures n'ont pas de texte à rendre — elles sont dans le .html. */
function simRapMdFiche(el){
  if(!el)return "";
  const L=[];
  const marche=function(n){
    if(n.nodeType===3){
      const t=n.textContent.replace(/\s+/g," ");
      if(t.trim())L.push(t);
      return;
    }
    if(n.nodeType!==1)return;
    const tag=n.tagName.toLowerCase();
    if(tag==="svg"||tag==="style"||tag==="script")return;
    if(tag==="table"){
      const rangs=[...n.querySelectorAll("tr")].map(tr=>
        [...tr.children].map(td=>td.textContent.replace(/\s+/g," ").trim()));
      if(rangs.length){
        const larg=Math.max(...rangs.map(r=>r.length));
        const pad=r=>r.concat(Array(larg-r.length).fill(""));
        L.push("\n\n"+simRapMdTable(pad(rangs[0]),rangs.slice(1).map(pad))+"\n\n");
      }
      return;
    }
    const bloc=/^(p|div|tr|li|h\d|details|summary|br|section)$/.test(tag);
    if(bloc)L.push("\n");
    for(const c of n.childNodes)marche(c);
    if(bloc)L.push("\n");
  };
  marche(el);
  return L.join("").split("\n").map(l=>l.trim()).filter((l,i,t)=>l||t[i-1])
          .join("\n").trim();
}

function simRapMarkdown(d){
  const L=[];
  L.push("# Rapport de simulation — "+d.analyse);
  L.push("");
  L.push("- **Carte :** "+(d.carte||"—"));
  L.push("- **Outil :** "+(d.outil||"—"));
  L.push("- **Famille :** "+d.famille);
  L.push("- **Date :** "+d.date.toLocaleDateString()+" "+d.date.toLocaleTimeString());
  L.push("- **Statut :** "+d.statutTxt);
  if(d.quoi)L.push("- **Ce qui est calculé :** "+d.quoi);
  L.push("");
  /* CE QUE LE LECTEUR DOIT SAVOIR AVANT DE LIRE, et qu'il n'a pas : il n'a
     pas le logiciel. Une IA à qui l'on colle ce texte n'a que lui. */
  L.push("> **Document autonome.** Ce rapport est exporté de WEB_CAO, une suite de CAO "+
         "électronique (éditeur PCB, visionneuse IPC-2581). Il est écrit pour être lu "+
         "seul, sans le logiciel : la méthode de calcul, les définitions, les critères "+
         "de jugement, les résultats et les données brutes du calcul y sont tous.");
  L.push("");
  L.push("### Conventions de lecture");
  L.push("- Dans le texte, les nombres ont la virgule décimale (« 48,2 Ω ») ; dans "+
         "l'annexe JSON, le point.");
  L.push("- Unités du JSON : longueurs en mm, fréquences en Hz, temps en s, tensions "+
         "en V, courants en A, impédances en Ω, pertes et paramètres S en dB sauf "+
         "mention contraire. Un paramètre S complexe s'écrit [partie réelle, partie imaginaire].");
  L.push("- Gravités : **CRIT** = défaut à corriger, **WARN** = point de vigilance ou "+
         "hypothèse qui pèse sur le résultat, **OK** = verdict favorable, **INFO** = ce "+
         "que le modèle suppose ou ne couvre pas.");
  L.push("- Les courbes du logiciel (paramètres S, œil, Z(ω)…) ne sont pas dessinées "+
         "ici : leurs points sont dans l'annexe JSON, sous-échantillonnés si besoin.");
  L.push("");
  const g=d.guide;
  if(g){
    L.push("## 0. Ce que calcule cette analyse");
    L.push("**Méthode.** "+g.methode);
    L.push("");
    L.push("**Grandeurs.**");
    for(const x of g.grandeurs)L.push("- "+x);
    L.push("");
    L.push("**Critères de jugement.** "+g.criteres);
    L.push("");
    L.push("**Limites du modèle.** "+g.limites);
    L.push("");
  }
  if(d.kpis.length){
    L.push("## 1. Chiffres clés");
    for(const k of d.kpis)
      L.push("- **"+k.lbl+" :** "+k.val+(k.detail?" ("+k.detail+")":""));
    L.push("");
  }
  L.push("## 2. Diagnostics & vigilance");
  if(!d.res)L.push("- Simulation non exécutée.");
  for(const k of d.constats)
    L.push("- **["+k.rang.toUpperCase()+"]** "+[k.titre,k.desc].filter(Boolean).join(" — "));
  L.push("");
  const p=d.piste;
  if(p){
    L.push("## 3. La piste");
    if(p.lignes.length)
      L.push(simRapMdTable(["Net","Couche","Tronçons","Longueur (mm)","Largeur(s) (mm)"],
        p.lignes.map(l=>[l.net,l.couche,l.n,simNb(l.mm,3),[...l.largeurs].join(" · ")||"—"])));
    L.push("");
    L.push("- Net calculé : "+(p.net||"—"));
    L.push("- Longueur totale : "+simNb(p.lignes.reduce((a,l)=>a+l.mm,0),3)+" mm");
    L.push("- Vias de la sélection : "+p.vias+" · cuivre voisin : "+p.voisins+" tronçon(s)");
    L.push("- Masse de référence : "+(p.masse.join(", ")||"aucune"));
    if(p.paires.length)L.push("- Paires déclarées : "+p.paires.map(x=>x.join(" / ")).join(", "));
    L.push("");
    if(p.empilage.length){
      L.push("### Empilage");
      L.push(simRapMdTable(["Rang","Couche","Nature","Épaisseur (mm)","εr","tanδ","Rôle / net"],
        p.empilage.map((l,i)=>{
          const cu=l.type==="copper";
          return [i+1,l.name||"—",cu?"cuivre":"diélectrique",simNb(l.thickness,4),
                  cu?"—":simNb(l.epsilon_r,2),cu?"—":simNb(l.tan_delta,4),
                  cu?(l.role||"")+(l.net?" · "+l.net:""):""];
        })));
      L.push("");
    }
  }
  if(d.bornes.length){
    L.push("## Bornes");
    L.push(simRapMdTable(["Repère","Net","Rôle","Consigne","Chute"],
      d.bornes.map(b=>[b.repere,b.net,b.role,b.consigne,b.chute])));
    L.push("");
  }
  if(d.reglages.length){
    L.push("## 4. Réglages de la simulation");
    for(const r of d.reglages)L.push("- "+r.nom+" : "+r.val+(r.desc?" ("+r.desc+")":""));
    L.push("");
  }
  const fiche=simRapMdFiche(d.fiche);
  if(fiche){
    L.push("## 5. Résultats détaillés");
    L.push(fiche);
    L.push("");
  }
  if(d.texte){
    L.push("## 6. Rapport texte complet");
    L.push("```");
    L.push(d.texte.trim());
    L.push("```");
    L.push("");
  }
  /* LES CHIFFRES EUX-MÊMES. La fiche résume ; le résultat du serveur porte
     tout, courbes comprises, et c'est sur lui qu'un lecteur qui veut refaire
     un raisonnement doit pouvoir s'appuyer. */
  if(d.res||d.regl){
    L.push("## 7. Données brutes du calcul (JSON)");
    L.push("Le résultat tel que le solveur l'a rendu, puis les réglages tels que saisis. "+
           "Nombres à 5 chiffres significatifs ; une longue liste est sous-échantillonnée "+
           "et son dernier élément le dit.");
    if(d.res){
      L.push("### Résultat");
      L.push("```json"); L.push(simRapJson(d.res)); L.push("```");
    }
    if(d.regl){
      L.push("### Réglages");
      L.push("```json"); L.push(simRapJson(d.regl)); L.push("```");
    }
    L.push("");
  }
  L.push("## 8. Consignes pour une IA qui lit ce rapport");
  L.push("- Appuie chaque affirmation sur un chiffre de ce rapport, en citant la section.");
  L.push("- Distingue ce qui est calculé de ce qui est supposé : les notes INFO et les "+
         "« Limites du modèle » disent ce que le calcul ignore.");
  L.push("- S'il manque une donnée pour conclure, dis laquelle plutôt que de la supposer.");
  L.push("- Propose des corrections concrètes et chiffrées (largeur, écart, couche, via, "+
         "découplage, terminaison…), en commençant par les points CRIT.");
  /* Les sections facultatives (chiffres clés, piste, rapport texte) ne
     laissent pas de trou dans la numérotation. */
  let n=0;
  return L.join("\n").replace(/^## \d+\. /gm,()=>"## "+(n++)+". ");
}

/* =============================================================================
   7. La fenêtre et ses trois sorties
   ============================================================================= */
let SIM_RAP_DONNEES=null;

function simRapTitre(d){
  return "📋 Rapport de simulation — "+simEsc(d.analyse||"—");
}
function simRapSousTitre(d){
  return simEsc([d.carte||"carte sans nom", d.famille,
    d.date.toLocaleDateString()+" "+d.date.toLocaleTimeString(),
    d.outil||"WEB_CAO"].filter(Boolean).join(" · "));
}

function simRapOuvrir(){
  let mod=simEl("simRapportModal");
  if(!mod){
    mod=document.createElement("div");
    mod.id="simRapportModal";
    mod.className="rap-modal";
    document.body.appendChild(mod);
  }
  const d=simRapCollecter();
  SIM_RAP_DONNEES=d;
  mod.innerHTML=
    '<div class="rap-box" role="dialog" aria-modal="true" aria-label="Rapport de simulation">'+
      '<div class="rap-head">'+
        '<div class="rap-titres">'+
          '<div class="rap-titre-principal"><span>'+simRapTitre(d)+'</span>'+
            '<span class="rap-badge-statut '+d.statut+'">'+simEsc(d.statutTxt)+'</span></div>'+
          '<div class="rap-sous-titre">'+simRapSousTitre(d)+'</div>'+
        '</div>'+
        '<div class="rap-actions">'+
          (typeof iaLancerAnalyseSelection==="function"
            ? '<button class="rap-btn" id="bSimRapIa" title="Ouvrir l\'assistant IA avec ce rapport déjà dans la question : vous relisez, puis envoyez">🤖 Envoyer à l\'IA</button>'
            : '')+
          '<button class="rap-btn" id="bSimRapCopier" title="Copier le rapport complet (Markdown), autonome : à coller dans n\'importe quelle IA">📋 Copier</button>'+
          '<button class="rap-btn" id="bSimRapPrint" title="Imprimer ou enregistrer au format PDF">🖨️ Imprimer / PDF</button>'+
          '<button class="rap-btn" id="bSimRapDl" title="Télécharger un fichier HTML autonome hors-ligne">⤓ Fichier .html</button>'+
          '<button class="rap-btn fermer" id="bSimRapFermer" title="Fermer (Échap)">✕</button>'+
        '</div>'+
      '</div>'+
      '<div class="rap-corps">'+simRapHtml(d)+'</div>'+
    '</div>';
  mod.removeAttribute("hidden");
  simEl("bSimRapCopier").onclick=simRapCopier;
  const bIa=simEl("bSimRapIa");
  if(bIa)bIa.onclick=simRapVersIa;
  simEl("bSimRapPrint").onclick=function(){window.print();};
  simEl("bSimRapDl").onclick=simRapTelecharger;
  simEl("bSimRapFermer").onclick=simRapFermer;
  mod.onclick=function(e){if(e.target===mod)simRapFermer();};
}

function simRapFermer(){
  const mod=simEl("simRapportModal");
  if(mod)mod.setAttribute("hidden","");
}

function simRapToast(msg){
  const mod=simEl("simRapportModal");
  if(!mod)return;
  const t=document.createElement("div");
  t.className="rap-toast";
  t.textContent=msg;
  mod.appendChild(t);
  setTimeout(()=>t.remove(),2200);
}

/* VERS L'ASSISTANT DE LA SUITE (commun/ia-assistant.js). Le rapport part
   comme la question, posé dans le champ de saisie et NON envoyé : on relit,
   on précise, puis on envoie. Sans clé API, l'assistant la demande d'abord
   et envoie la question dès qu'elle est saisie — c'est son comportement pour
   toutes les analyses qu'on lui confie. La fenêtre se ferme pour laisser voir
   le volet. */
function simRapVersIa(){
  const d=SIM_RAP_DONNEES||simRapCollecter();
  simRapFermer();
  /* LA QUESTION, PAS LE RAPPORT : l'assistant le lit lui-même, partie par
     partie, avec ses outils de lecture (commun/ia-assistant.js) — les chiffres
     et les diagnostics d'abord, l'annexe JSON seulement s'il lui manque un
     chiffre. Le rapport entier pèse jusqu'à 60 000 caractères. */
  iaLancerAnalyseSelection({type:"rapport_simulation", texte:
    "Analyse le rapport de la simulation « "+d.analyse+" » (analyse « "+d.cle+
    " », statut : "+d.statutTxt+"). Lis-le avec l'outil « simulation », en "+
    "commençant par les chiffres clés et les diagnostics. Dis si le résultat est "+
    "fiable, ce qui ne va pas et pourquoi, et ce qu'il faut corriger sur la carte, "+
    "par ordre de priorité."});
}

function simRapCopier(){
  const md=simRapMarkdown(SIM_RAP_DONNEES||simRapCollecter());
  const repli=function(){
    const ta=document.createElement("textarea");
    ta.value=md; ta.style.position="fixed"; ta.style.top="-9999px";
    document.body.appendChild(ta); ta.select();
    try{ document.execCommand("copy"); simRapToast("✓ Rapport copié !"); }
    catch(e){ alert("Impossible de copier automatiquement : sélectionnez le texte."); }
    ta.remove();
  };
  if(navigator.clipboard&&navigator.clipboard.writeText)
    navigator.clipboard.writeText(md)
      .then(()=>simRapToast("✓ Rapport Markdown copié dans le presse-papier !"))
      .catch(repli);
  else repli();
}

/* LE FICHIER AUTONOME emporte sa feuille et celle des fiches : la fiche
   recopiée garde ses classes, et sans les règles de simulation-em.css ses
   tableaux et ses courbes perdraient leur mise en page. Les règles se
   choisissent par leur CLASSE (.rap-…, .sim…) et non par le nom de leur
   feuille : la version un seul fichier (outils/build-monofichier.py) les
   inline, et ses feuilles n'ont plus de nom. */
function simRapTelecharger(){
  const d=SIM_RAP_DONNEES||simRapCollecter();
  let css="";
  for(const sh of document.styleSheets){
    try{
      for(const r of sh.cssRules)
        if(/\.(rap-|sim[A-Z])/.test(r.cssText))css+=r.cssText+"\n";
    }catch(e){}
  }
  const page='<!DOCTYPE html>\n<html lang="fr">\n<head>\n<meta charset="utf-8">\n'+
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n'+
    '<title>Rapport '+simEsc(d.analyse)+' — '+simEsc(d.carte||"carte")+'</title>\n<style>\n'+
    ':root{--bg:#0f1012;--panel:#17181b;--panel2:#1c1e22;--border:#2b2e34;--border2:#3a3e46;'+
    '--txt:#e6e8ec;--txt-dim:#8b919c;--yellow:#f2c744;--blue:#3fa0ea;--blue-deep:#2b7fbf;'+
    '--red:#e8443a;--green:#4cc38a;--cyan:#8af0ff;'+
    '--mono:"JetBrains Mono",Consolas,monospace;--ui:system-ui,-apple-system,sans-serif;}\n'+
    'body{background:var(--bg);color:var(--txt);font-family:var(--ui);margin:0;padding:24px;line-height:1.5;}\n'+
    css+
    '.rap-box{max-width:1060px;max-height:none;margin:0 auto;padding:20px;}\n'+
    '</style>\n</head>\n<body>\n<div class="rap-box">\n'+
    '<header class="rap-head" style="margin-bottom:20px"><div class="rap-titres">'+
    '<div class="rap-titre-principal"><span>'+simRapTitre(d)+'</span>'+
    '<span class="rap-badge-statut '+d.statut+'">'+simEsc(d.statutTxt)+'</span></div>'+
    '<div class="rap-sous-titre">'+simRapSousTitre(d)+'</div></div></header>\n'+
    '<div class="rap-corps">\n'+simRapHtml(d)+'\n</div>\n</div>\n</body>\n</html>';
  const propre=s=>String(s||"").replace(/[^\w.-]+/g,"_").replace(/^_+|_+$/g,"");
  simTelecharger(page,"rapport_"+(propre(d.carte)||"carte")+"_"+propre(d.cle)+"_"+
    Date.now()+".html","text/html;charset=utf-8");
}

if(typeof window!=="undefined"&&window.addEventListener)
  window.addEventListener("keydown",function(e){
    const mod=simEl("simRapportModal");
    if(e.key==="Escape"&&mod&&!mod.hasAttribute("hidden"))simRapFermer();
  });
