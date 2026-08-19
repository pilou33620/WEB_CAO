/* =============================================================================
   editeur-schematique — 16-demo.js
   Schéma de démonstration
   ============================================================================= */
"use strict";
/* ==========================================================================
   Schéma de démonstration (étage de commande NPN du schéma de référence)
   ========================================================================== */
function mk(t,x,y,rot,val,ref){
  const el=addComp(t,x,y);el.rot=rot||0;
  if(val!==undefined)el.value=val;
  if(ref)el.ref=ref;
  return el;
}
function demo(){
  mk("port",140,400,0,"EN");
  mk("resistor",240,400,0,"1k","R2").pkg="0402";
  mk("npn",400,400,0,"MMBT5551","Q3");
  mk("resistor",300,480,90,"100k","R3");
  mk("resistor",420,280,90,"100k","R1");
  mk("vcc",420,220,0,"12V");
  mk("gnd",420,580);
  mk("annot_volt",200,380,0,"3,30 V");
  mk("annot_curr",500,300,0,"I = 0,12 mA");
  mk("annot_note",700,400,0,"Interrupteur côté bas|EN à 3,3 V sature Q3|R3 garde la base au repos");
  S.wires.push(
    {x1:160,y1:400,x2:200,y2:400},
    {x1:280,y1:400,x2:360,y2:400,net:"BASE_Q3"},
    {x1:300,y1:400,x2:300,y2:440},
    {x1:300,y1:520,x2:300,y2:560},
    {x1:300,y1:560,x2:420,y2:560},
    {x1:420,y1:440,x2:420,y2:560},
    {x1:420,y1:320,x2:420,y2:360}
  );
}
function demo2(){
  mk("vcc",200,180,0,"12V");
  mk("regulator",300,260,0,"AMS1117-5.0","U1").pkg="SOT-223-4";
  mk("cap_pol",200,320,90,"10µ","C1").pkg="1206";
  mk("cap_pol",440,320,90,"22µ","C2").pkg="1206";
  mk("gnd",300,420);
  // la sortie 5 V quitte la feuille par une étiquette globale ;
  // les rails 12V et GND des deux feuilles se rejoignent par leurs symboles
  const p5=mk("gport",620,260,0,"+5V");
  p5.mir=true;                        // drapeau tourné vers l'extérieur : la broche est à gauche
  S.wires.push({x1:560,y1:260,x2:600,y2:260});
  mk("annot_volt",520,240,0,"5,00 V");
  mk("annot_text",420,180,0,"Régulateur linéaire 12 V → 5 V");
  S.wires.push(
    {x1:200,y1:200,x2:200,y2:260},
    {x1:200,y1:260,x2:240,y2:260},
    {x1:200,y1:260,x2:200,y2:280},
    {x1:200,y1:360,x2:200,y2:400},
    {x1:200,y1:400,x2:300,y2:400},
    {x1:300,y1:320,x2:300,y2:400},
    {x1:300,y1:400,x2:440,y2:400},
    {x1:360,y1:260,x2:560,y2:260},
    {x1:440,y1:260,x2:440,y2:280},
    {x1:440,y1:360,x2:440,y2:400}
  );
}
