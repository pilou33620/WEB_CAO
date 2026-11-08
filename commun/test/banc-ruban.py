#!/usr/bin/env python3
"""Banc : le ruban des deux éditeurs, dans un vrai Chromium sans fenêtre.
    python3 commun/test/banc-ruban.py   → une ligne par éditeur, le détail des échecs seulement
Reconstruit les monofichiers, y ajoute les essais, lit le bilan dans le DOM rendu.
Sans Chromium : le banc le dit et ne conclut rien (code 0)."""
import json, os, re, shutil, subprocess, sys, tempfile

RACINE = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
ESSAIS = r"""
(async function(){
  const R=[], pause=(ms=30)=>new Promise(r=>setTimeout(r,ms));
  const vu=e=>{if(!e)return false;const r=e.getBoundingClientRect();return r.width>0&&r.height>0;};
  const T=(nom,ok)=>R.push([nom,!!ok]);
  const $=i=>document.getElementById(i), ongs=[...document.querySelectorAll(".ong")];
  const clic=e=>e.dispatchEvent(new MouseEvent("click",{bubbles:true,cancelable:true}));
  const bas=(e,x,y)=>e.dispatchEvent(new PointerEvent("pointerdown",{bubbles:true,clientX:x||0,clientY:y||0,pointerType:"mouse"}));
  const PCB=!!$("mTrack"), cv=$("board")||$("sheet");
  await pause(200);

  const tous=[...document.querySelectorAll(".menubar button.tb,.barre-rapide button.tb,.vue-bar button.tb")].filter(b=>b.id);
  T("ids uniques",tous.every(b=>document.querySelectorAll("#"+b.id).length===1));
  const sansIcone=[...document.querySelectorAll(".rg-cmds button.tb,.rg .mnu-pop button.tb,.barre-rapide>button.tb,.vue-bar>button.tb")]
    .filter(b=>!getComputedStyle(b).getPropertyValue("--ri").trim()).map(b=>b.id);
  T("chaque commande a son icône "+sansIcone,!sansIcone.length);

  for(const o of ongs){
    clic(o.querySelector(".mnu-t"));
    const seule=ongs.every(x=>vu(x.querySelector(".band"))===(x===o));
    const pas=[...o.querySelectorAll(".rg-cmds button.tb")].filter(b=>b.style.display!=="none"&&!vu(b)).map(b=>b.id);
    T("onglet "+o.dataset.mnu+" : sa bande seule, ses boutons visibles "+pas,seule&&!pas.length);
    const b=o.querySelector(".band");
    T("onglet "+o.dataset.mnu+" tient sans défiler à 1600 px",b.scrollWidth<=b.clientWidth);
    const haut=[...o.querySelectorAll(".rg-t")].every(t=>t.getBoundingClientRect().bottom<=b.getBoundingClientRect().bottom+1);
    T("onglet "+o.dataset.mnu+" : titres de groupe dans la bande",haut);
  }
  clic(ongs[0].querySelector(".mnu-t"));

  const g=document.querySelector(".ong.actif .rg.mnu");
  clic(g.querySelector(".mnu-t"));
  const lp=g.querySelector(".mnu-pop"), rl=lp.getBoundingClientRect(), rt=g.querySelector(".mnu-t").getBoundingClientRect();
  T("liste d'un groupe : ouverte sous son titre",vu(lp)&&rl.top>=rt.bottom&&rl.right<=innerWidth);
  await pause(400);T("liste d'un groupe : reste ouverte",vu(lp));
  bas(cv,300,300);
  T("liste d'un groupe : un clic ailleurs la ferme",!vu(lp));

  const aff=document.querySelector('.vue-bar .mnu'), ap=aff.querySelector(".mnu-pop");
  clic(aff.querySelector(".mnu-t"));
  const ra=ap.getBoundingClientRect();
  T("affichage : la liste s'ouvre au-dessus de la barre, dans l'écran",vu(ap)&&ra.top>=0&&ra.bottom<=aff.getBoundingClientRect().top&&ra.right<=innerWidth);
  bas(cv,300,300);

  const canvasAvant=cv.getBoundingClientRect().height;
  clic($("rubanPli"));
  for(let i=0;i<40&&cv.getBoundingClientRect().height<=canvasAvant+40;i++)await pause(50);
  const h2=cv.getBoundingClientRect().height;T("replier : le canevas gagne la hauteur de la bande ("+canvasAvant+" → "+h2+", zone "+$("canvasWrap").getBoundingClientRect().height+")",document.body.classList.contains("ruban-replie")&&h2>canvasAvant+40);
  T("replié : aucune bande à l'écran",ongs.every(o=>!vu(o.querySelector(".band"))));
  const o2=ongs[1];clic(o2.querySelector(".mnu-t"));
  T("replié : l'onglet pose sa bande",vu(o2.querySelector(".band")));
  await pause(400);T("replié : la bande reste posée",vu(o2.querySelector(".band")));
  clic(o2.querySelector(".rg-cmds button.tb"));await pause();
  T("replié : une commande referme la bande",!vu(o2.querySelector(".band")));
  if($("bfProgressX"))$("bfProgressX").click();
  clic($("rubanPli"));await pause(120);
  T("déplier : la bande revient",ongs.some(o=>vu(o.querySelector(".band"))));
  T("repli mémorisé",localStorage.getItem("cao.ruban.replie")==="0");
  document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}));
  [...document.querySelectorAll(".modal.on,.ov.on,[id$=Ov].on")].forEach(m=>m.classList.remove("on"));

  menusMontrer($("bFind"));
  T("montrer une commande : son onglet",vu($("bFind")));
  menusMontrer(null);

  // l'étiquette OUTIL retrouve le bouton de l'outil actif
  const outil=PCB?"mHole":"mBus";
  $(outil).click();await pause();
  clic(ongs[ongs.length-1].querySelector(".mnu-t"));
  clic($("mnuChip"));
  T("étiquette OUTIL : montre le bouton actif",vu($(outil))&&$("mnuChip").textContent.length>5);
  $("mSelect").click();await pause();

  if(PCB){
    const avant=$("bView").textContent;
    clic($("vueCube"));await pause();
    T("cube : suit le bouton Vue",$("bView").textContent!==avant&&document.querySelector("#vueCube text").textContent==="DESSOUS");
    clic($("vueCube"));await pause();
    T("cube : revient",document.querySelector("#vueCube text").textContent==="DESSUS");
  }

  const r=cv.getBoundingClientRect(), cm=()=>cv.dispatchEvent(new MouseEvent("contextmenu",{bubbles:true,cancelable:true,clientX:r.left+r.width*.5,clientY:r.top+r.height*.5,button:2}));
  const roue=()=>{const e=$("trRoue");return !!e&&e.classList.contains("ouvert");};
  cm();
  T("clic droit : la roulette s'ouvre",roue());
  await pause(400);T("clic droit : la roulette reste ouverte",roue());
  tactileRouletteFermer();TR.ouverteA=0;
  if(PCB){S.edgeDraft=null;} else {S.wireStart={x:0,y:0};cm();T("clic droit, tracé en cours : il termine, sans roulette",!roue()&&!S.wireStart);TR.ouverteA=0;}

  // fenêtre d'options, sur une vraie sélection
  const fen=document.querySelector(".opt-fen"), props=$("props"), panneau=()=>!!props.closest(".pnl");
  let el;
  if(PCB){el={x:10,y:10,d:.6,dr:.3,net:""};S.vias.push(el);S.sel.vias.add(el);}
  else{el={x1:0,y1:0,x2:40,y2:0};S.wires.push(el);S.selW.add(el);}
  refreshPanels();await pause();
  T("panneau Propriétés déplié : #props y reste, pas de fenêtre",fen.hidden&&panneau());
  wsToggleCollapse("props");await pause();
  T("sélection, panneau replié : la fenêtre s'ouvre avec #props",!fen.hidden&&vu(fen)&&fen.contains(props));
  const rf=fen.getBoundingClientRect(), rw=$("canvasWrap").getBoundingClientRect();
  T("fenêtre : dans le canevas",rf.right<=rw.right&&rf.bottom<=rw.bottom&&rf.top>=rw.top);
  const pile=S.undo||S.hist, n0=pile.length;
  push();push();
  clic(fen.querySelector('.opt-pied [data-opt="annuler"]'));await pause();
  T("Annuler : défait ce qui a changé depuis l'ouverture",pile.length===n0&&fen.hidden&&panneau());
  refreshPanels();await pause();
  if(PCB){const v=S.vias[S.vias.length-1];S.sel.vias.clear();S.sel.vias.add(v);}
  else{const w=S.wires[S.wires.length-1];S.selW.clear();S.selW.add(w);}
  refreshPanels();await pause();
  const rouvre=!fen.hidden;
  clic(fen.querySelector('.opt-pied .pri'));await pause();
  T("OK : la fenêtre se ferme, #props revient au panneau",rouvre&&fen.hidden&&panneau());
  refreshPanels();await pause();
  T("OK : même sélection, elle ne revient pas",fen.hidden);
  clearSel();refreshPanels();await pause();
  T("sans sélection : pas de fenêtre",fen.hidden&&panneau());
  if(PCB){const v=S.vias[S.vias.length-1];S.sel.vias.add(v);}else{S.selW.add(S.wires[S.wires.length-1]);}
  refreshPanels();await pause();
  const ouverte=!fen.hidden;
  wsToggleCollapse("props");await pause();
  T("déplier le panneau : la fenêtre lui rend #props",ouverte&&fen.hidden&&panneau());
  clearSel();refreshPanels();await pause();

  // tactile : le ruban garde sa mesure (titres de groupe sous les libellés, barre rapide en icônes)
  document.body.classList.add("mode-tactile");clic(ongs[0].querySelector(".mnu-t"));await pause();
  const chev=[...document.querySelectorAll(".ong.actif .rg")].filter(g=>{
    const t=g.querySelector(".rg-t").getBoundingClientRect();
    return [...g.querySelectorAll(".rg-cmds button.tb")].some(b=>vu(b)&&b.getBoundingClientRect().bottom>t.top+1);
  }).map(g=>g.querySelector(".rg-t").textContent.trim());
  T("tactile : aucun titre de groupe sur les boutons "+chev,!chev.length);
  T("tactile : barre rapide sans texte",[...document.querySelectorAll(".barre-rapide>button.tb")].every(b=>getComputedStyle(b).fontSize==="0px"));
  document.body.classList.remove("mode-tactile");

  const pre=document.createElement("pre");pre.id="bilan-ruban";pre.textContent=JSON.stringify(R);
  document.documentElement.appendChild(pre);
})().catch(e=>{const pre=document.createElement("pre");pre.id="bilan-ruban";
  pre.textContent=JSON.stringify([["exception : "+e.message+" "+(e.stack||"").split("\n")[1],false]]);document.documentElement.appendChild(pre);});
"""

def essai(chrome, editeur, page):
    subprocess.run([sys.executable, os.path.join(RACINE, editeur, "outils", "build-monofichier.py")],
                   check=True, stdout=subprocess.DEVNULL)
    with open(os.path.join(RACINE, editeur, "dist", page), encoding="utf-8") as f:
        html = f.read()
    t = tempfile.mkdtemp(prefix="banc-ruban")
    try:
        p = os.path.join(t, "page.html")
        with open(p, "w", encoding="utf-8") as f:
            # la dernière balise : d'autres « </body> » vivent dans les chaînes des exports
            i = html.rindex("</body>")
            f.write(html[:i] + "<script>" + ESSAIS + "</script>" + html[i:])
        r = subprocess.run([chrome, "--headless", "--no-sandbox", "--disable-gpu", "--window-size=1600,900",
                            "--user-data-dir=" + os.path.join(t, "profil"), "--virtual-time-budget=8000",
                            "--dump-dom", "file://" + p],
                           capture_output=True, text=True, timeout=120)
    finally:
        shutil.rmtree(t, ignore_errors=True)
    m = re.search(r'<pre id="bilan-ruban">(.*?)</pre>', r.stdout, re.S)
    if not m:
        return [["pas de bilan dans la page", False]]
    return json.loads(m.group(1).replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&"))

chrome = shutil.which("chromium") or shutil.which("chromium-browser") or shutil.which("google-chrome")
if not chrome:
    print("ruban : Chromium absent, banc non exécuté")
    sys.exit(0)
ko = 0
for editeur, page in (("editeur-schematique", "editeur-schematique.html"), ("editeur-pcb", "editeur-pcb.html")):
    res = essai(chrome, editeur, page)
    rates = [n for n, ok in res if not ok]
    ko += len(rates)
    print("ruban %s : %d/%d ok" % (editeur, len(res) - len(rates), len(res)))
    for n in rates:
        print("  KO  " + n)
sys.exit(1 if ko else 0)
