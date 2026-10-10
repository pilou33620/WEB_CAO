"use strict";
/* ==========================================================================
   Éditeur PCB — Draftsman : plans de fabrication et d'assemblage
   --------------------------------------------------------------------------
   Le Master Drawing (04-pdf-masterdraw.js) est un document de texte : trois
   pages de caractéristiques, sans un trait de la carte. Ce qui manquait, ce
   sont les PLANS — ce qu'un fabricant et un monteur ouvrent pour savoir où
   percer, où poser quoi, et dans quel sens :

     · plan de fabrication : contour coté, carte de perçage (un symbole par
       outil), tableau de perçage, trous de fixation, coupe d'empilage, notes ;
     · assemblage dessus / dessous : corps des composants, broche 1, repères,
       non-montés de la variante active barrés en tirets ;
     · nomenclature : groupée par valeur, boîtier et référence fabricant ;
     · couches de cuivre (en option) : pistes, pastilles, vias et zones.

   Chaque feuille porte son cadre, ses repères de zones et un cartouche. Les
   feuilles sont des LISTES D'OBJETS en millimètres (traits, cercles, textes),
   Y vers le bas comme sur le papier ; deux sorties les lisent : le PDF, et le
   SVG de l'aperçu. Ce qu'on voit dans la fenêtre est donc ce qui s'imprime.

   LE PDF SE CHERCHE. C'est la demande, et elle décide de trois choses :
     1. tout texte est du VRAI texte (opérateur Tj), jamais des traits : un
        Ctrl+F dans le lecteur trouve « U3 », « 100nF », « GND » ou « ENIG » ;
     2. le codage est WinAnsi, pas l'ASCII réduit du Master Drawing : les
        accents survivent (« résistance », « Épaisseur ») et se cherchent ;
     3. ce qui ne s'affiche pas se cherche quand même : la valeur, le boîtier
        et la référence fabricant de chaque composant sont posés sur son corps
        en texte INVISIBLE (mode de rendu 3, comme la couche texte d'un
        document numérisé), et le nom de chaque net sur sa plus longue piste
        de chaque couche. Chercher « 100nF » dans le lecteur surligne les
        condensateurs à leur place sur le plan, pas seulement dans la
        nomenclature.
   S'y ajoutent les signets : une entrée par feuille, et sous chaque feuille
   d'assemblage une entrée par composant qui y mène.

   La fenêtre (Fichier → Plans (Draftsman)…) cherche de la même façon, dans
   le même index : la liste des résultats, la feuille, et les endroits
   surlignés sur l'aperçu.

   Les réglages (format, feuilles, noms du cartouche, notes) sont dans le
   document, `S.dessin`, et suivent la carte.
   ========================================================================== */

const DF_FORMATS={A4:{w:297,h:210},A3:{w:420,h:297},A2:{w:594,h:420}};
const DF_FEUILLES=[
  ["fab",    "Plan de fabrication"],
  ["asmT",   "Assemblage — face dessus"],
  ["asmB",   "Assemblage — face dessous"],
  ["bom",    "Nomenclature"],
  ["couches","Couches de cuivre"]];
const DF_PT=25.4/72;                 // un point typographique, en mm
const DF_CADRE=10;                   // cadre extérieur, depuis le bord
const DF_BANDE=5;                    // bande des repères de zones
/* Échelles normalisées, de la plus grande à la plus petite : la vue prend la
   première qui tient. Une échelle quelconque (1:1,37) ne se mesure pas à la
   règle ; 1:1,5 ou 2:1, si. */
const DF_ECHELLES=[20,10,5,4,3,2,1.5,1,0.75,0.5,0.4,0.25,0.2,0.1,0.05,0.02];

/* ---------- réglages du document ----------
   Lus à chaque usage et bornés ici : `normDoc` se contente d'une copie, parce
   qu'il tourne au démarrage avant que ce fichier soit chargé. */
function dfCfg(){
  const src=(S.dessin&&typeof S.dessin==="object")?S.dessin:{};
  const txt=(v,n)=>String(v==null?"":v).slice(0,n||120);
  const f=(src.feuilles&&typeof src.feuilles==="object")?src.feuilles:{};
  const b=(k,def)=>typeof f[k]==="boolean"?f[k]:def;
  return {
    format:DF_FORMATS[src.format]?src.format:"A3",
    societe:txt(src.societe), auteur:txt(src.auteur),
    verifie:txt(src.verifie), approuve:txt(src.approuve),
    notes:txt(src.notes,4000),
    feuilles:{fab:b("fab",true), asmT:b("asmT",true), asmB:b("asmB",true),
              bom:b("bom",true), couches:b("couches",false)}
  };
}
function dfRegler(cle,val){
  const c=dfCfg();
  if(Object.prototype.hasOwnProperty.call(c.feuilles,cle))c.feuilles[cle]=!!val;
  else if(cle in c)c[cle]=val;
  S.dessin=c;
  S.dessin=dfCfg();          // la valeur saisie repasse par les bornes
  S.dirty=true;
}

/* ==========================================================================
   Texte : codage WinAnsi et largeur Helvetica
   ========================================================================== */
/* Les points de code Unicode que WinAnsi range entre 0x80 et 0x9F. Au-delà de
   0xA0, WinAnsi et Latin-1 coïncident : é, °, ±, µ, Ø passent tels quels. */
const DF_WIN={0x20AC:0x80,0x201A:0x82,0x0192:0x83,0x201E:0x84,0x2026:0x85,
  0x2020:0x86,0x2021:0x87,0x02C6:0x88,0x2030:0x89,0x0160:0x8A,0x2039:0x8B,
  0x0152:0x8C,0x017D:0x8E,0x2018:0x91,0x2019:0x92,0x201C:0x93,0x201D:0x94,
  0x2022:0x95,0x2013:0x96,0x2014:0x97,0x02DC:0x98,0x2122:0x99,0x0161:0x9A,
  0x203A:0x9B,0x0153:0x9C,0x017E:0x9E,0x0178:0x9F};
/* Ce que WinAnsi n'a pas, écrit comme un technicien l'écrirait. */
const DF_SUBST={"\u03A9":"Ohm","\u2126":"Ohm","\u03BC":"\u00B5","\u2265":">=",
  "\u2264":"<=","\u2192":"->","\u2190":"<-","\u2300":"\u00D8","\u2212":"-",
  "\u2248":"~","\u03B5":"e","\u0394":"D","\u2713":"OK","\u2715":"x",
  "\u2009":" ","\u202F":" "};
function dfWinAnsi(s){
  const out=[];
  for(const ch0 of String(s==null?"":s).normalize("NFC")){
    const sub=DF_SUBST[ch0];
    for(const ch of (sub!=null?sub:ch0)){
      const c=ch.codePointAt(0);
      if((c>=0x20&&c<0x7F)||(c>=0xA0&&c<=0xFF))out.push(c);
      else if(DF_WIN[c])out.push(DF_WIN[c]);
      else if(c===9||c===10||c===13)out.push(0x20);
      else{
        /* une lettre accentuée hors Latin-1 (ő, č…) perd son accent plutôt
           que de devenir un point d'interrogation */
        const d=ch.normalize("NFD").replace(/[̀-ͯ]/g,"");
        const k=d?d.codePointAt(0):0;
        out.push(d&&d!==ch&&k>=0x20&&k<0x7F?k:0x3F);
      }
    }
  }
  return out;
}
function dfPdfLit(s){
  let o="(";
  for(const c of dfWinAnsi(s)){
    if(c===0x28||c===0x29||c===0x5C)o+="\\"+String.fromCharCode(c);
    else if(c<0x20||c>0x7E)o+="\\"+c.toString(8).padStart(3,"0");
    else o+=String.fromCharCode(c);
  }
  return o+")";
}
/* Chaîne d'information du PDF (titres, signets) : UTF-16BE avec sa marque,
   en hexadécimal — tout Unicode y passe, Ω compris. */
function dfPdfUtf16(s){
  let o="<FEFF";
  const t=String(s==null?"":s);
  for(let i=0;i<t.length;i++)o+=t.charCodeAt(i).toString(16).toUpperCase().padStart(4,"0");
  return o+">";
}
/* Chasses d'Helvetica, en millièmes de corps, de l'espace (32) au tilde (126).
   Elles servent à centrer un repère sur son composant et à couper les
   colonnes d'un tableau sans déborder. */
const DF_HELV=[278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,
  556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,
  1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,
  667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,
  333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,
  556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
function dfLargeur(s,pt,gras){
  let w=0;
  for(const c of dfWinAnsi(s))w+=(c>=32&&c<=126)?DF_HELV[c-32]:600;
  return w/1000*pt*DF_PT*(gras?1.07:1);
}
/* Coupe un texte en lignes qui tiennent dans `largeur` mm ; un mot plus long
   que la colonne est coupé à la lettre. */
function dfCouper(s,largeur,pt,gras){
  const out=[];
  for(const para of String(s==null?"":s).split(/\r?\n/)){
    let cur="";
    for(let mot of para.split(/\s+/).filter(Boolean)){
      while(dfLargeur(mot,pt,gras)>largeur&&mot.length>1){
        let n=mot.length-1;
        while(n>1&&dfLargeur(mot.slice(0,n),pt,gras)>largeur)n--;
        if(cur){out.push(cur);cur="";}
        out.push(mot.slice(0,n));mot=mot.slice(n);
      }
      const essai=cur?cur+" "+mot:mot;
      if(cur&&dfLargeur(essai,pt,gras)>largeur){out.push(cur);cur=mot;}
      else cur=essai;
    }
    out.push(cur);
  }
  while(out.length>1&&out[out.length-1]==="")out.pop();
  return out;
}

/* ==========================================================================
   Feuilles : des listes d'objets en millimètres
   ========================================================================== */
/* Couleurs : un nombre est un gris (0 noir, 1 blanc), un tableau un RVB 0..1. */
function dfNouvelle(ctx,titre,genre){
  const fm=DF_FORMATS[ctx.cfg.format];
  return {w:fm.w,h:fm.h,format:ctx.cfg.format,titre,genre,items:[],signets:[],echelle:""};
}
function dfPoly(F,pts,o){
  o=o||{};
  F.items.push({t:"p",sp:[pts],ferme:!!o.ferme,lw:o.lw||0.25,
    trait:o.trait===undefined?0:o.trait,plein:o.plein==null?null:o.plein,
    tirets:!!o.tirets,eo:!!o.eo});
}
function dfChemins(F,sp,o){
  o=o||{};
  F.items.push({t:"p",sp,ferme:true,lw:o.lw||0.25,
    trait:o.trait===undefined?0:o.trait,plein:o.plein==null?null:o.plein,
    tirets:!!o.tirets,eo:!!o.eo});
}
function dfLigne(F,x1,y1,x2,y2,lw,c,tirets){
  dfPoly(F,[{x:x1,y:y1},{x:x2,y:y2}],{lw,trait:c==null?0:c,tirets});
}
function dfRect(F,x,y,w,h,o){
  dfPoly(F,[{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}],Object.assign({ferme:true},o||{}));
}
function dfCercle(F,x,y,r,o){
  o=o||{};
  F.items.push({t:"c",x,y,r,lw:o.lw||0.25,trait:o.trait===undefined?0:o.trait,
    plein:o.plein==null?null:o.plein});
}
/* Texte. `pt` en points, `ancre` g / m / d (gauche, milieu, droite) sur la
   ligne de base, `rot` en degrés dans le sens trigonométrique tel qu'on le
   voit. `cache` : posé, cherchable, jamais peint. `cible` : la zone que la
   recherche surligne (par défaut, la boîte du texte lui-même). `lieu` : ce
   que la liste des résultats en dit (« U1 · broche 5 »). */
function dfTexte(F,s,x,y,pt,o){
  o=o||{};
  s=String(s==null?"":s);
  if(!s)return;
  F.items.push({t:"t",s,x,y,pt,gras:!!o.gras,c:o.c==null?0:o.c,ancre:o.ancre||"g",
    rot:o.rot||0,cache:!!o.cache,cible:o.cible||null,cat:o.cat||"",lieu:o.lieu||""});
}
/* Boîte d'un texte sur la feuille, rotation comprise. */
function dfBoiteTexte(it){
  const w=dfLargeur(it.s,it.pt,it.gras), h=it.pt*DF_PT;
  const dx=it.ancre==="m"?-w/2:(it.ancre==="d"?-w:0);
  const a=it.rot*Math.PI/180, ca=Math.cos(a), sa=Math.sin(a);
  /* direction du texte (ca,-sa), vers le haut des lettres (-sa,-ca) */
  const P=(u,v)=>({x:it.x+(dx+u)*ca-v*sa, y:it.y-(dx+u)*sa-v*ca});
  const c=[P(0,-0.25*h),P(w,-0.25*h),P(w,0.8*h),P(0,0.8*h)];
  return {x1:Math.min(...c.map(p=>p.x)),y1:Math.min(...c.map(p=>p.y)),
          x2:Math.max(...c.map(p=>p.x)),y2:Math.max(...c.map(p=>p.y))};
}

/* ==========================================================================
   Sortie PDF
   ========================================================================== */
function dfNum(v){
  const r=Math.round(v*1000)/1000;
  return String(r===0?0:r);
}
function dfCouleur(c,trait){
  if(Array.isArray(c))return c.map(dfNum).join(" ")+(trait?" RG":" rg");
  return dfNum(c)+(trait?" G":" g");
}
/* Le contenu d'une page. L'état graphique (épaisseur, couleurs, tirets)
   n'est réémis que lorsqu'il change : une couche de cuivre compte des
   milliers de pistes de même largeur. */
function dfContenu(F){
  const H=F.h, L=["1 J 1 j"];
  const X=x=>dfNum(x/DF_PT), Y=y=>dfNum((H-y)/DF_PT);
  const st={lw:"",sc:"",fc:"",dash:false};
  const setS=c=>{const k=dfCouleur(c,true);if(st.sc!==k){L.push(k);st.sc=k;}};
  const setF=c=>{const k=dfCouleur(c,false);if(st.fc!==k){L.push(k);st.fc=k;}};
  const setW=w=>{const k=dfNum(Math.max(w,0.02)/DF_PT)+" w";if(st.lw!==k){L.push(k);st.lw=k;}};
  const setD=d=>{if(st.dash!==d){L.push(d?"[3 2] 0 d":"[] 0 d");st.dash=d;}};
  const peindre=it=>{
    const t=it.trait!=null, p=it.plein!=null;
    if(t){setS(it.trait);setW(it.lw);setD(!!it.tirets);}
    if(p)setF(it.plein);
    return p&&t?(it.eo?"B*":"B"):(p?(it.eo?"f*":"f"):"S");
  };
  for(const it of F.items){
    if(it.t==="p"){
      if(it.trait==null&&it.plein==null)continue;
      const parts=[];
      for(const pts of it.sp){
        if(!pts||pts.length<2)continue;
        let s=X(pts[0].x)+" "+Y(pts[0].y)+" m";
        for(let i=1;i<pts.length;i++)s+=" "+X(pts[i].x)+" "+Y(pts[i].y)+" l";
        if(it.ferme)s+=" h";
        parts.push(s);
      }
      if(!parts.length)continue;
      const op=peindre(it);
      L.push(parts.join("\n")+" "+op);
    }else if(it.t==="c"){
      if(it.trait==null&&it.plein==null)continue;
      const k=0.5523*it.r, x=it.x, y=it.y, r=it.r;
      const op=peindre(it);
      L.push(X(x+r)+" "+Y(y)+" m "+
        X(x+r)+" "+Y(y+k)+" "+X(x+k)+" "+Y(y+r)+" "+X(x)+" "+Y(y+r)+" c "+
        X(x-k)+" "+Y(y+r)+" "+X(x-r)+" "+Y(y+k)+" "+X(x-r)+" "+Y(y)+" c "+
        X(x-r)+" "+Y(y-k)+" "+X(x-k)+" "+Y(y-r)+" "+X(x)+" "+Y(y-r)+" c "+
        X(x+k)+" "+Y(y-r)+" "+X(x+r)+" "+Y(y-k)+" "+X(x+r)+" "+Y(y)+" c h "+op);
    }else if(it.t==="t"){
      const w=dfLargeur(it.s,it.pt,it.gras);
      const dx=it.ancre==="m"?-w/2:(it.ancre==="d"?-w:0);
      const a=it.rot*Math.PI/180, ca=Math.cos(a), sa=Math.sin(a);
      const x0=it.x+dx*ca, y0=it.y-dx*sa;
      if(!it.cache)setF(it.c);
      L.push("BT /F"+(it.gras?2:1)+" "+dfNum(it.pt)+" Tf "+(it.cache?3:0)+" Tr "+
        dfNum(ca)+" "+dfNum(sa)+" "+dfNum(-sa)+" "+dfNum(ca)+" "+X(x0)+" "+Y(y0)+" Tm "+
        dfPdfLit(it.s)+" Tj ET");
    }
  }
  return L.join("\n")+"\n";
}
/* Le fichier. Plan des objets : catalogue, arbre des pages, deux fontes,
   ressources, informations, racine des signets, puis les pages et leurs
   contenus, puis les signets. Les décalages de la table xref se comptent en
   écrivant, comme dans mdAssemble(). */
function dfPdf(feuilles,meta){
  meta=meta||{};
  let n=0;
  const alloc=()=>++n;
  const CAT=alloc(), PAGES=alloc(), F1=alloc(), F2=alloc(), RES=alloc(),
        INFO=alloc(), OUTL=alloc();
  const pageId=feuilles.map(()=>alloc()), contId=feuilles.map(()=>alloc());

  /* Signets : une entrée par feuille, et sous elle ses entrées propres. */
  const sig=[];
  feuilles.forEach((F,i)=>{
    const e={id:alloc(),titre:(i+1)+". "+F.titre,page:i,fit:true,enf:[]};
    for(const s of F.signets)
      e.enf.push({id:alloc(),titre:s.titre,page:i,x:s.x,y:s.y,enf:[]});
    sig.push(e);
  });

  const chunks=[];
  let pos=0;
  const enc=new TextEncoder();
  const emit=s=>{const b=enc.encode(s);chunks.push(b);pos+=b.length;};
  const off=[];
  const obj=(id,dict,stream)=>{
    off[id]=pos;
    emit(id+" 0 obj\n"+dict+"\n");
    if(stream!=null){
      const b=enc.encode(stream);
      emit("stream\n");chunks.push(b);pos+=b.length;emit("\nendstream\n");
    }
    emit("endobj\n");
  };
  emit("%PDF-1.4\n%âãÏÓ\n");

  obj(CAT,"<< /Type /Catalog /Pages "+PAGES+" 0 R /Outlines "+OUTL+" 0 R"+
      " /PageMode /UseOutlines /Lang (fr-FR) /ViewerPreferences << /DisplayDocTitle true >> >>");
  obj(PAGES,"<< /Type /Pages /Kids ["+pageId.map(i=>i+" 0 R").join(" ")+"] /Count "+feuilles.length+" >>");
  obj(F1,"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  obj(F2,"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  obj(RES,"<< /Font << /F1 "+F1+" 0 R /F2 "+F2+" 0 R >> /ProcSet [/PDF /Text] >>");
  const d=new Date(), p2=v=>String(v).padStart(2,"0");
  const quand="D:"+d.getFullYear()+p2(d.getMonth()+1)+p2(d.getDate())+
              p2(d.getHours())+p2(d.getMinutes())+p2(d.getSeconds());
  obj(INFO,"<< /Title "+dfPdfUtf16(meta.titre||"Plans")+
      " /Author "+dfPdfUtf16(meta.auteur||"")+
      " /Subject "+dfPdfUtf16(meta.sujet||"")+
      " /Keywords "+dfPdfUtf16(meta.motsCles||"")+
      " /Creator "+dfPdfUtf16("WEB_CAO — Éditeur PCB, Draftsman")+
      " /Producer (WEB_CAO) /CreationDate ("+quand+") >>");

  /* racine et arbre des signets */
  const lier=(liste,parent)=>{
    liste.forEach((e,i)=>{
      e.parent=parent;
      e.prev=i?liste[i-1].id:0;
      e.next=i<liste.length-1?liste[i+1].id:0;
      lier(e.enf,e.id);
    });
  };
  lier(sig,OUTL);
  obj(OUTL,"<< /Type /Outlines"+(sig.length?" /First "+sig[0].id+" 0 R /Last "+sig[sig.length-1].id+" 0 R":"")+
      " /Count "+sig.length+" >>");

  feuilles.forEach((F,i)=>{
    const contenu=dfContenu(F);
    obj(contId[i],"<< /Length "+enc.encode(contenu).length+" >>",contenu);
    obj(pageId[i],"<< /Type /Page /Parent "+PAGES+" 0 R /MediaBox [0 0 "+
        dfNum(F.w/DF_PT)+" "+dfNum(F.h/DF_PT)+"] /Contents "+contId[i]+" 0 R /Resources "+RES+" 0 R >>");
  });

  const ecrireSig=e=>{
    const F=feuilles[e.page];
    const dest=e.fit?"["+pageId[e.page]+" 0 R /Fit]":
      "["+pageId[e.page]+" 0 R /XYZ "+dfNum(Math.max(0,e.x-45)/DF_PT)+" "+
      dfNum(Math.min(F.h,F.h-e.y+30)/DF_PT)+" 2]";
    obj(e.id,"<< /Title "+dfPdfUtf16(e.titre)+" /Parent "+e.parent+" 0 R"+
        (e.prev?" /Prev "+e.prev+" 0 R":"")+(e.next?" /Next "+e.next+" 0 R":"")+
        (e.enf.length?" /First "+e.enf[0].id+" 0 R /Last "+e.enf[e.enf.length-1].id+
                      " 0 R /Count -"+e.enf.length:"")+
        " /Dest "+dest+" >>");
    e.enf.forEach(ecrireSig);
  };
  sig.forEach(ecrireSig);

  const xref=pos;
  emit("xref\n0 "+(n+1)+"\n0000000000 65535 f \n");
  for(let i=1;i<=n;i++)emit(String(off[i]||0).padStart(10,"0")+" 00000 n \n");
  emit("trailer\n<< /Size "+(n+1)+" /Root "+CAT+" 0 R /Info "+INFO+" 0 R >>\nstartxref\n"+xref+"\n%%EOF\n");
  const out=new Uint8Array(pos);
  let p=0;
  for(const c of chunks){out.set(c,p);p+=c.length;}
  return out;
}

/* ==========================================================================
   Sortie SVG (aperçu de la fenêtre)
   ========================================================================== */
function dfSvgCouleur(c){
  if(c==null)return "none";
  if(Array.isArray(c))return "rgb("+c.map(v=>Math.round(clamp(v,0,1)*255)).join(",")+")";
  const g=Math.round(clamp(c,0,1)*255);
  return "rgb("+g+","+g+","+g+")";
}
/* `hits` : boîtes à surligner [{x1,y1,x2,y2,actif}] — la recherche. */
function dfSvg(F,hits){
  const n=v=>dfNum(v);
  const o=['<svg xmlns="http://www.w3.org/2000/svg" class="df-svg" viewBox="0 0 '+n(F.w)+" "+n(F.h)+
    '" width="'+n(F.w)+'mm" height="'+n(F.h)+'mm"><rect width="'+n(F.w)+'" height="'+n(F.h)+'" fill="#fff"/>'];
  for(const it of F.items){
    if(it.t==="p"){
      const d=it.sp.filter(p=>p&&p.length>=2)
        .map(p=>"M"+p.map(q=>n(q.x)+" "+n(q.y)).join("L")+(it.ferme?"Z":"")).join("");
      if(!d)continue;
      o.push('<path d="'+d+'" fill="'+dfSvgCouleur(it.plein)+'"'+(it.eo?' fill-rule="evenodd"':"")+
        ' stroke="'+dfSvgCouleur(it.trait)+'" stroke-width="'+n(it.lw)+
        '" stroke-linecap="round" stroke-linejoin="round"'+(it.tirets?' stroke-dasharray="1.06 0.7"':"")+"/>");
    }else if(it.t==="c"){
      o.push('<circle cx="'+n(it.x)+'" cy="'+n(it.y)+'" r="'+n(it.r)+'" fill="'+dfSvgCouleur(it.plein)+
        '" stroke="'+dfSvgCouleur(it.trait)+'" stroke-width="'+n(it.lw)+'"/>');
    }else if(it.t==="t"&&!it.cache){
      o.push('<text x="'+n(it.x)+'" y="'+n(it.y)+'" font-size="'+n(it.pt*DF_PT)+
        '" font-family="Helvetica,Arial,sans-serif"'+(it.gras?' font-weight="bold"':"")+
        ' text-anchor="'+(it.ancre==="m"?"middle":(it.ancre==="d"?"end":"start"))+
        '" fill="'+dfSvgCouleur(it.c)+'"'+
        (it.rot?' transform="rotate('+n(-it.rot)+" "+n(it.x)+" "+n(it.y)+')"':"")+">"+
        esc(it.s)+"</text>");
    }
  }
  for(const h of (hits||[]))
    o.push('<rect class="df-hit'+(h.actif?" on":"")+'" x="'+n(h.x1-0.8)+'" y="'+n(h.y1-0.8)+
      '" width="'+n(h.x2-h.x1+1.6)+'" height="'+n(h.y2-h.y1+1.6)+'" rx="0.8"/>');
  o.push("</svg>");
  return o.join("");
}

/* ==========================================================================
   Cadre, repères de zones et cartouche
   ========================================================================== */
/* La zone où les feuilles dessinent, et la place du cartouche. Le cartouche
   a la largeur de la colonne de droite du plan de fabrication : la vue de la
   carte, à sa gauche, garde toute la hauteur. */
function dfZone(F){
  const m=DF_CADRE+DF_BANDE;
  const tw=clamp(Math.round((F.w-2*m-6)*0.36),118,190), th=36;
  return {x1:m+3,y1:m+3,x2:F.w-m-3,y2:F.h-m-3,
          cart:{x:F.w-m-tw,y:F.h-m-th,w:tw,h:th}};
}
function dfCadre(F,ctx,num,total){
  const W=F.w, H=F.h, a=DF_CADRE, b=DF_CADRE+DF_BANDE;
  dfRect(F,a,a,W-2*a,H-2*a,{lw:0.5});
  dfRect(F,b,b,W-2*b,H-2*b,{lw:0.35});
  /* repères de zones : chiffres en colonnes, lettres en lignes, tous les
     ~50 mm comme sur un plan normalisé */
  const nc=Math.max(2,Math.round((W-2*b)/50)), nl=Math.max(2,Math.round((H-2*b)/50));
  const pc=(W-2*b)/nc, pl=(H-2*b)/nl;
  for(let i=0;i<nc;i++){
    const x=b+pc*(i+0.5);
    if(i){dfLigne(F,b+pc*i,a,b+pc*i,b,0.2);dfLigne(F,b+pc*i,H-b,b+pc*i,H-a,0.2);}
    dfTexte(F,String(i+1),x,a+3.6,7,{ancre:"m",c:0.3,cat:"zone"});
    dfTexte(F,String(i+1),x,H-a-1.4,7,{ancre:"m",c:0.3,cat:"zone"});
  }
  for(let j=0;j<nl;j++){
    const y=b+pl*(j+0.5)+1.2, l=String.fromCharCode(65+(j%26));
    if(j){dfLigne(F,a,b+pl*j,b,b+pl*j,0.2);dfLigne(F,W-b,b+pl*j,W-a,b+pl*j,0.2);}
    dfTexte(F,l,a+2.5,y,7,{ancre:"m",c:0.3,cat:"zone"});
    dfTexte(F,l,W-a-2.5,y,7,{ancre:"m",c:0.3,cat:"zone"});
  }

  /* Cartouche : quatre rangées. Chaque case porte une étiquette grise et sa
     valeur ; tout est texte, donc tout se cherche. */
  const C=dfZone(F).cart, x=C.x, y=C.y, w=C.w, rh=C.h/4;
  dfRect(F,x,y,w,C.h,{lw:0.5,plein:1});
  for(let i=1;i<4;i++)dfLigne(F,x,y+rh*i,x+w,y+rh*i,0.25);
  const cfg=ctx.cfg;
  const rangee=(r,cases)=>{
    let cx=x;
    cases.forEach(([part,etiq,val,pt,gras],i)=>{
      const cw=w*part;
      if(i)dfLigne(F,cx,y+rh*r,cx,y+rh*(r+1),0.25);
      dfTexte(F,etiq,cx+1.2,y+rh*r+2.4,4.6,{c:0.45,cat:"cartouche"});
      const lignes=dfCouper(val||"—",cw-2.4,pt||7.5,gras);
      dfTexte(F,lignes[0],cx+1.2,y+rh*(r+1)-1.7,pt||7.5,{gras,cat:"cartouche"});
      cx+=cw;
    });
  };
  rangee(0,[[0.38,"Société",cfg.societe||"—",7.5,true],
            [0.62,"Projet",ctx.projet,9,true]]);
  rangee(1,[[1,"Titre de la feuille",F.titre,10,true]]);
  rangee(2,[[0.25,"Dessiné par",cfg.auteur],[0.25,"Vérifié par",cfg.verifie],
            [0.25,"Approuvé par",cfg.approuve],[0.25,"Date",ctx.date]]);
  rangee(3,[[0.36,"N° de document",ctx.docNum,7],[0.12,"Rév.",ctx.rev,8,true],
            [0.18,"Échelle",F.echelle||"—"],[0.14,"Format",F.format],
            [0.20,"Feuille",num+" / "+total,8,true]]);
  if(ctx.variante)
    dfTexte(F,"Variante de montage : "+ctx.variante,x,y-1.6,6.5,{c:0.3,cat:"cartouche"});
}

/* ==========================================================================
   Vues de la carte
   ========================================================================== */
function dfEtendue(){
  let x1=Infinity,y1=Infinity,x2=-Infinity,y2=-Infinity;
  const pts=boardPoly().slice();
  for(const fp of S.fps){
    const b=fpBBox(fp);
    pts.push({x:b.x1,y:b.y1},{x:b.x2,y:b.y2});
  }
  for(const p of pts){
    if(!Number.isFinite(p.x)||!Number.isFinite(p.y))continue;
    x1=Math.min(x1,p.x);y1=Math.min(y1,p.y);x2=Math.max(x2,p.x);y2=Math.max(y2,p.y);
  }
  if(!Number.isFinite(x1))return {x1:0,y1:0,x2:10,y2:10};
  return {x1,y1,x2,y2};
}
function dfEchelleTxt(k){
  const t=v=>String(Math.round(v*100)/100).replace(".",",");
  return k>=1?t(k)+":1":"1:"+t(1/k);
}
/* Place la carte dans `box` à la plus grande échelle normalisée qui tienne.
   Dessous, la vue est en miroir : c'est la carte retournée, telle que le
   monteur la voit quand il pose la seconde face. */
function dfVue(box,face,marge){
  const B=dfEtendue(), bw=Math.max(B.x2-B.x1,1e-3), bh=Math.max(B.y2-B.y1,1e-3);
  const kmax=Math.max(1e-3,Math.min((box.w-2*marge)/bw,(box.h-2*marge)/bh));
  const k=DF_ECHELLES.find(e=>e<=kmax)||kmax;
  const ox=box.x+(box.w-bw*k)/2, oy=box.y+(box.h-bh*k)/2;
  const T=face?(x,y)=>({x:ox+(B.x2-x)*k,y:oy+(y-B.y1)*k})
              :(x,y)=>({x:ox+(x-B.x1)*k,y:oy+(y-B.y1)*k});
  return {k,T,B,ox,oy,bw,bh,face,echelle:dfEchelleTxt(k)};
}
function dfContour(F,V,lw){
  dfPoly(F,boardPoly().map(p=>V.T(p.x,p.y)),{ferme:true,lw:lw||0.35});
  for(const c of boardCutouts())dfPoly(F,c.map(p=>V.T(p.x,p.y)),{ferme:true,lw:lw||0.35});
}
/* Le contour d'une pastille, en coordonnées monde : un polygone pour toutes
   les formes, le cercle compris (24 côtés, invisibles à l'échelle d'un plan). */
function dfPadForme(q){
  const ca=Math.cos(q.rot||0), sa=Math.sin(q.rot||0);
  const W=p=>({x:q.x+p.x*ca-p.y*sa, y:q.y+p.x*sa+p.y*ca});
  let loc;
  if(q.shape==="circ"){
    const r=Math.max(q.w,q.h)/2;
    loc=[];for(let i=0;i<24;i++){const a=i*Math.PI/12;loc.push({x:r*Math.cos(a),y:r*Math.sin(a)});}
  }else if(q.shape==="poly"&&Array.isArray(q.pts)&&q.pts.length>=3)loc=q.pts;
  else if(q.shape==="chamfer")loc=padChamferPts(q.w,q.h,q.chamfer!=null?q.chamfer:padChamferVal(q),q.chamferCorners);
  else{
    const w=q.w, h=q.h, r=Math.min(padRadius(q.shape,w,h),w/2,h/2);
    if(r<1e-3)loc=[{x:-w/2,y:-h/2},{x:w/2,y:-h/2},{x:w/2,y:h/2},{x:-w/2,y:h/2}];
    else{
      loc=[];
      const coins=[[w/2-r,h/2-r,0],[-w/2+r,h/2-r,1],[-w/2+r,-h/2+r,2],[w/2-r,-h/2+r,3]];
      for(const [cx,cy,k] of coins)
        for(let i=0;i<=4;i++){
          const a=(k+i/4)*Math.PI/2;
          loc.push({x:cx+r*Math.cos(a),y:cy+r*Math.sin(a)});
        }
    }
  }
  return loc.map(W);
}
/* Points d'une piste, l'arc découpé en cordes. */
function dfPistePts(t){
  if(!isArc(t))return [{x:t.x1,y:t.y1},{x:t.x2,y:t.y2}];
  const n=Math.max(4,Math.ceil(Math.abs(t.ca)/(Math.PI/24)));
  const out=[];
  for(let i=0;i<=n;i++)out.push(trkAt(t,i/n));
  return out;
}

/* ---------- cotation ---------- */
function dfFleche(F,x,y,dx,dy){
  const L=2, l=0.55, n=Math.hypot(dx,dy)||1, ux=dx/n, uy=dy/n;
  dfPoly(F,[{x,y},{x:x-ux*L-uy*l,y:y-uy*L+ux*l},{x:x-ux*L+uy*l,y:y-uy*L-ux*l}],
         {ferme:true,plein:0,lw:0.1});
}
/* Cote horizontale (sens "h") ou verticale ("v") entre deux points de la
   feuille, tirée à `d` mm du plus éloigné des deux. */
function dfCote(F,p1,p2,sens,d,texte){
  if(sens==="h"){
    const y=Math.max(p1.y,p2.y)+d;
    dfLigne(F,p1.x,p1.y+1,p1.x,y+1.5,0.15);
    dfLigne(F,p2.x,p2.y+1,p2.x,y+1.5,0.15);
    dfLigne(F,p1.x,y,p2.x,y,0.18);
    dfFleche(F,p1.x,y,p1.x-p2.x,0);dfFleche(F,p2.x,y,p2.x-p1.x,0);
    dfTexte(F,texte,(p1.x+p2.x)/2,y-1,8,{ancre:"m",cat:"cote"});
  }else{
    const x=Math.min(p1.x,p2.x)-d;
    dfLigne(F,p1.x-1,p1.y,x-1.5,p1.y,0.15);
    dfLigne(F,p2.x-1,p2.y,x-1.5,p2.y,0.15);
    dfLigne(F,x,p1.y,x,p2.y,0.18);
    dfFleche(F,x,p1.y,0,p1.y-p2.y);dfFleche(F,x,p2.y,0,p2.y-p1.y);
    dfTexte(F,texte,x-1,(p1.y+p2.y)/2,8,{ancre:"m",rot:90,cat:"cote"});
  }
}

/* ==========================================================================
   Mise en page en colonnes : des blocs qui passent à la feuille suivante
   ========================================================================== */
/* Un bloc : {h(w), dessiner(F,x,y,w), entete?} — sa hauteur se demande pour la
   largeur où il sera posé (un paragraphe coupé sur 138 mm ne prend pas la
   hauteur du même coupé sur 118). Quand un bloc ne tient plus, une feuille
   « (suite) » s'ouvre, pleine largeur, et l'en-tête d'un tableau y est
   répété. */
function dfFlux(ctx,F0,zone,blocs,titre,genre){
  const feuilles=[F0];
  let F=F0, Z=zone, y=Z.y;
  const nouvelle=()=>{
    F=dfNouvelle(ctx,titre+" (suite)",genre);
    feuilles.push(F);
    const z=dfZone(F);
    Z={x:z.x1,y:z.y1,w:z.x2-z.x1,bas:z.cart.y-4};
    y=Z.y;
  };
  for(const b of blocs){
    if(y+b.h(Z.w)>Z.bas&&y>Z.y+0.1){
      nouvelle();
      if(b.entete){b.entete.dessiner(F,Z.x,y,Z.w);y+=b.entete.h(Z.w);}
    }
    b.dessiner(F,Z.x,y,Z.w);
    y+=b.h(Z.w);
  }
  return feuilles;
}
function dfBlocTitre(t){
  return {h:()=>9,dessiner(F,x,y,w){
    dfLigne(F,x,y+1.5,x+w,y+1.5,0.35);
    dfTexte(F,t.toUpperCase(),x,y+6,8.5,{gras:true,cat:"titre"});
  }};
}
function dfBlocEspace(h){return {h:()=>h,dessiner(){}};}
/* Tableau : `cols` = [{t:titre, p:part de largeur, a:"g"|"d"|"m"}], `rows` =
   tableaux de chaînes. Rend la liste de blocs : un par rangée, l'en-tête en
   tête et rappelé à chaque saut de feuille. */
function dfTableau(cols,rows,o){
  o=o||{};
  const pt=o.pt||6.8, lh=pt*DF_PT*1.32, pad=1.2;
  const tot=cols.reduce((a,c)=>a+c.p,0);
  const xs=w=>{let acc=0;return cols.map(c=>{const x=acc;acc+=c.p/tot*w;return {x,w:c.p/tot*w};});};
  const entete={h:()=>lh+2.6,dessiner(F,x,y,w){
    dfRect(F,x,y,w,lh+2.6,{plein:0.88,lw:0.25});
    xs(w).forEach((c,i)=>{
      if(i)dfLigne(F,x+c.x,y,x+c.x,y+lh+2.6,0.2);
      dfTexte(F,cols[i].t,x+c.x+pad,y+lh+0.6,pt,{gras:true,cat:"tableau"});
    });
  }};
  const blocs=[entete];
  rows.forEach((r,ri)=>{
    const haut=w=>{
      const cl=xs(w);
      return Math.max(1,...r.map((v,i)=>dfCouper(v,cl[i].w-2*pad,pt).length))*lh+1.4;
    };
    const ligne={h:haut,entete,dessiner(F,x,y,w){
      const cw=xs(w), h=haut(w);
      if(ri%2)dfRect(F,x,y,w,h,{plein:0.965,trait:null});
      dfLigne(F,x,y+h,x+w,y+h,0.15,0.6);
      r.forEach((v,i)=>{
        if(i)dfLigne(F,x+cw[i].x,y,x+cw[i].x,y+h,0.15,0.75);
        const a=cols[i].a||"g";
        dfCouper(v,cw[i].w-2*pad,pt).forEach((l,k)=>{
          const tx=a==="d"?x+cw[i].x+cw[i].w-pad:(a==="m"?x+cw[i].x+cw[i].w/2:x+cw[i].x+pad);
          dfTexte(F,l,tx,y+lh*(k+1)-0.3,pt,{ancre:a,gras:!!(o.gras&&o.gras(ri)),
                                            cat:o.cat||"tableau"});
        });
      });
      if(o.symbole)o.symbole(F,ri,x+cw[0].x+cw[0].w/2,y+h/2);
    }};
    blocs.push(ligne);
  });
  return blocs;
}
function dfBlocParagraphes(lignes,pt){
  pt=pt||7;
  const lh=pt*DF_PT*1.35;
  return lignes.map(l=>{
    return {h:w=>dfCouper(l.texte,w-l.retrait-2,pt).length*lh+1,dessiner(F,x,y,w){
      if(l.num)dfTexte(F,l.num,x+1,y+lh,pt,{gras:true,cat:"note"});
      dfCouper(l.texte,w-l.retrait-2,pt).forEach((t,k)=>
        dfTexte(F,t,x+l.retrait,y+lh*(k+1),pt,{cat:"note"}));
    }};
  });
}

/* ==========================================================================
   Feuille 1 — plan de fabrication
   ========================================================================== */
/* Les trous, rangés par outil : diamètre, métallisation et portée. Un via
   borgne de 0,2 et un traversant de 0,2 ne se percent pas dans la même
   passe : ce sont deux lignes du tableau. */
function dfPercages(){
  const g=new Map();
  const ajout=(d,x,y,plaque,usage,a,b)=>{
    const key=fmt(d,3)+"|"+(plaque?1:0)+"|"+a+"-"+b;
    let e=g.get(key);
    if(!e)g.set(key,e={d,plaque,usages:new Set(),a,b,pts:[]});
    e.usages.add(usage);e.pts.push({x,y});
  };
  for(const fp of S.fps)
    for(const q of padsWorld(fp))
      if(q.drill>0)ajout(q.drill,q.x,q.y,true,"pastilles",0,S.cu-1);
  for(const v of S.vias)
    if(v.drill>0)ajout(v.drill,v.x,v.y,true,"vias",Math.min(v.a,v.b),Math.max(v.a,v.b));
  for(const h of (S.holes||[]))
    if(h.d>0)ajout(h.d,h.x,h.y,false,"fixation",0,S.cu-1);
  return [...g.values()].sort((u,v)=>(v.plaque-u.plaque)||(u.d-v.d)||(u.a-v.a)||(u.b-v.b));
}
const DF_SYMBOLES=["croix","x","carre","triangle","losange","rond","plus","nabla","hexagone","carrex"];
/* Symbole de perçage n° `i` centré en (x,y), demi-taille r. Au-delà des dix
   dessins, une lettre — qui se cherche aussi. */
function dfSymbole(F,i,x,y,r){
  const lw=0.18, P=(dx,dy)=>({x:x+dx*r,y:y+dy*r});
  const k=DF_SYMBOLES[i];
  if(!k){dfTexte(F,String.fromCharCode(65+((i-DF_SYMBOLES.length)%26)),x,y+r*0.75,r*2/DF_PT*0.95,
                 {ancre:"m",gras:true,cat:"symbole"});return;}
  if(k==="croix"){dfCercle(F,x,y,r,{lw});dfLigne(F,x-r,y,x+r,y,lw);dfLigne(F,x,y-r,x,y+r,lw);}
  else if(k==="x"){dfLigne(F,x-r,y-r,x+r,y+r,lw);dfLigne(F,x-r,y+r,x+r,y-r,lw);}
  else if(k==="carre")dfPoly(F,[P(-1,-1),P(1,-1),P(1,1),P(-1,1)],{ferme:true,lw});
  else if(k==="triangle")dfPoly(F,[P(0,-1.1),P(1,0.8),P(-1,0.8)],{ferme:true,lw});
  else if(k==="losange")dfPoly(F,[P(0,-1.15),P(1.15,0),P(0,1.15),P(-1.15,0)],{ferme:true,lw});
  else if(k==="rond")dfCercle(F,x,y,r,{lw,plein:0});
  else if(k==="plus"){dfLigne(F,x-r,y,x+r,y,lw*1.4);dfLigne(F,x,y-r,x,y+r,lw*1.4);}
  else if(k==="nabla")dfPoly(F,[P(0,1.1),P(1,-0.8),P(-1,-0.8)],{ferme:true,lw});
  else if(k==="hexagone"){
    const pts=[];for(let j=0;j<6;j++){const a=j*Math.PI/3;pts.push(P(Math.cos(a),Math.sin(a)));}
    dfPoly(F,pts,{ferme:true,lw});
  }else{dfPoly(F,[P(-1,-1),P(1,-1),P(1,1),P(-1,1)],{ferme:true,lw});
        dfLigne(F,x-r,y-r,x+r,y+r,lw);dfLigne(F,x-r,y+r,x+r,y-r,lw);}
}
function dfPortee(e){
  if(!e.plaque)return "—";
  return "L"+(e.a+1)+"–L"+(e.b+1);
}
function dfNotesFab(ctx){
  const st=S.stack, base=fabBase();
  const mat=(st.di&&st.di[0]&&st.di[0].mat)||"FR-4";
  const vc=viaCensus();
  const notes=[
    "Fabriquer selon IPC-6012, classe 2 ; contrôle d'aspect selon IPC-A-600, classe 2.",
    "Matériau : "+mat+", Tg ≥ "+(st.tg||150)+" °C, UL 94 V-0, conforme RoHS.",
    "Épaisseur finie : "+fmt(stackTotal(),2).replace(".",",")+" mm ± 10 % ; "+S.cu+" couche(s) de cuivre, "+
      "cuivre extérieur "+ozLabel(cuT(0))+" — voir la coupe d'empilage.",
    "Finition : "+(st.finish||"ENIG")+". Vernis épargne "+(st.maskColor||"vert")+
      " deux faces (IPC-SM-840), sérigraphie "+(st.silkColor||"blanc")+".",
    "Vias : "+viaFinishLabel()+(vc.blind||vc.buried?" ; vias borgnes / enterrés : laminage à valider avec le fabricant.":"."),
    "Diamètres de perçage FINIS, après métallisation ; tolérance ± 0,08 mm (métallisés), ± 0,05 mm (non métallisés).",
    "Le contour est défini par le fichier "+base+".GM1 ; tolérance de détourage ± 0,15 mm.",
    "Test électrique 100 % d'après la netlist "+base+".ipc (IPC-D-356).",
    "Cotes en millimètres, vue de dessus, sauf indication contraire."];
  const cp=dfContrePercage(null,{note:true});
  if(cp)notes.splice(notes.length-1,0,cp);
  for(const l of String(ctx.cfg.notes||"").split(/\r?\n/))
    if(l.trim())notes.push(l.trim());
  return notes.map((t,i)=>({num:(i+1)+".",texte:t,retrait:6}));
}
/* La coupe : une tranche par couche, épaisseur lisible plutôt qu'à l'échelle
   (un cuivre de 35 µm à côté d'un cœur de 1,2 mm serait un trait). */
function dfBlocEmpilage(){
  const rows=stackRows();
  /* une tranche fait au moins une ligne de texte : le libellé se lit en face */
  const hRow=r=>r.kind==="cu"?3:(r.kind==="di"?clamp(rowT(r)/0.2*2.4,3.2,7):2.8);
  const H=rows.reduce((a,r)=>a+hRow(r),0)+10;
  const libs=[];
  let cuN=0;
  for(const r of rows){
    let coul, nom, det;
    if(r.kind==="cu"){
      coul=[0.86,0.52,0.24];cuN++;
      nom="L"+cuN+" "+(S.cuL[r.i]&&S.cuL[r.i].name||cuLabel(r.i,S.cu));
      det="Cuivre "+ozLabel(cuT(r.i))+" — "+fmt(cuT(r.i)*1000,0)+" µm"+
          (roleLabel(r.i)&&roleLabel(r.i)!=="Signal"?" — "+roleLabel(r.i):"");
    }else if(r.kind==="di"){
      const d=diAt(r.i);
      coul=d.k==="core"?[0.72,0.80,0.60]:[0.86,0.90,0.76];
      nom=d.k==="core"?"Cœur":(d.k==="prepreg"?"Préimprégné":"Diélectrique");
      det=(d.mat||"FR-4")+" — "+fmt(d.t,3).replace(".",",")+" mm — εr "+fmt(d.er,2).replace(".",",");
    }else if(r.kind==="mask"){
      coul=[0.25,0.55,0.35];
      nom="Vernis épargne "+(r.i?"dessous":"dessus");
      det=(S.stack.maskColor||"vert")+" — "+fmt(S.stack.maskT*1000,0)+" µm";
    }else{
      coul=1;
      nom="Sérigraphie "+(r.i?"dessous":"dessus");
      det="encre "+(S.stack.silkColor||"blanc");
    }
    libs.push({r,coul,nom,det,h:hRow(r)});
  }
  const colDet=Math.max(...libs.map(l=>dfLargeur(l.nom,6.2,true)))+4;
  return {h:()=>H+4,dessiner(F,x,y,w){
    const bx=x+2, bw=30;
    let yy=y+2;
    for(const l of libs){
      dfRect(F,bx,yy,bw,l.h,{plein:l.coul,lw:0.12,trait:0.35});
      dfLigne(F,bx+bw,yy+l.h/2,bx+bw+3,yy+l.h/2,0.12,0.4);
      dfTexte(F,l.nom,bx+bw+4,yy+l.h/2+0.8,6.2,{gras:l.r.kind==="cu",cat:"empilage"});
      dfTexte(F,l.det,bx+bw+4+colDet,yy+l.h/2+0.8,6,{c:0.25,cat:"empilage"});
      yy+=l.h;
    }
    dfContrePercage(F,{coupe:{libs,x:bx,w:bw,y:y+2}});
    dfTexte(F,"Épaisseur totale : "+fmt(stackTotal(),3).replace(".",",")+" mm ± 10 %",
            bx,yy+6,7.5,{gras:true,cat:"empilage"});
  }};
}
/* Le contre-perçage (01-core.js, `cpPaires`) au plan de fabrication, d'une
   seule fonction pour ses trois places :
     o.vue   ses symboles sur la vue (à partir du symbole n° o.i0, plus grands
             que ceux du perçage qu'ils repassent) et son tableau, rendu en
             blocs : foret, face, couche à ne pas couper, profondeur, moignon ;
     o.coupe les passes sur la coupe d'empilage, un trait de la face percée à
             la pointe du foret ({libs, x, w, y} : les tranches dessinées) ;
     o.note  la note de fabrication, ou "" sans contre-perçage. */
function dfContrePercage(F,o){
  const P=typeof cpPaires==="function"?cpPaires():[];
  const n=S.cu, nom=i=>cpCoucheFichier(i)+" (L"+(i+1)+")", mm=v=>fmt(v,3).replace(".",",");
  if(o.note)return P.length?"Contre-perçage (back-drill) selon le tableau et les fichiers "+fabBase()+
    "-BACKDRILL-*.DRL : diamètre de foret et profondeur depuis la face indiquée, tolérance de profondeur "+
    "± 0,05 mm ; la couche gardée ne doit pas être coupée, moignon résiduel ≤ "+
    mm(Math.max(...P.map(p=>p.res)))+" mm.":"";
  if(o.coupe){
    const ys=[];let yy=o.coupe.y;
    for(const l of o.coupe.libs){ys.push({r:l.r,y:yy,h:l.h});yy+=l.h;}
    const cu=i=>ys.find(e=>e.r.kind==="cu"&&e.r.i===i), di=i=>ys.find(e=>e.r.kind==="di"&&e.r.i===i);
    P.forEach((p,j)=>{
      const bas=p.cote==="dessous", g=cu(p.garde), f=cu(bas?n-1:0), d=di(bas?p.garde:p.garde-1);
      if(!g||!f||!d)return;
      const k=clamp(p.res/Math.max(1e-3,diAt(d.r.i).t),0,1)*d.h;
      const y1=bas?f.y+f.h:f.y, y2=bas?g.y+g.h+k:g.y-k, x=o.coupe.x+o.coupe.w-2.5-j*2.6;
      dfLigne(F,x,y1,x,y2,0.9,[0.7,0.1,0.1]);
      dfLigne(F,x-1,y2,x+1,y2,0.3,[0.7,0.1,0.1]);
      dfTexte(F,cpCoucheFichier(bas?n-1:0)+"→"+cpCoucheFichier(p.garde),x-1.4,bas?y1-0.8:y1+2.6,4.6,
              {ancre:"d",c:[0.7,0.1,0.1],cat:"empilage"});
    });
    return null;
  }
  if(!P.length)return [];
  const rows=[];
  for(const p of P)
    for(const t of p.outils.values())rows.push({p,t});
  rows.forEach((e,j)=>{
    for(const q of e.t.pts){const s=o.vue.T(q.x,q.y);dfSymbole(F,o.i0+j,s.x,s.y,o.rs*1.7);}
  });
  return [dfBlocEspace(4),dfBlocTitre("Contre-perçage (back-drill)"),
    ...dfTableau([{t:"Symb.",p:9,a:"m"},{t:"Ø foret (mm)",p:14,a:"d"},{t:"Depuis",p:12,a:"m"},
                  {t:"Ne pas couper",p:16,a:"m"},{t:"Prof. (mm)",p:13,a:"d"},{t:"Moignon admis (mm)",p:18,a:"d"},
                  {t:"Qté",p:8,a:"d"}],
      rows.map(e=>["",mm(e.t.diam),nom(e.p.cote==="dessous"?n-1:0),nom(e.p.garde),mm(e.t.prof),
                   mm(e.t.res),String(e.t.pts.length)]),
      {symbole:(Fx,ri,cx,cy)=>dfSymbole(Fx,o.i0+ri,cx,cy,1.05),cat:"percage"})];
}
function dfImpedances(){
  if(typeof cmModele!=="function"||typeof cmLargeurPourZ!=="function")return [];
  const C=cmModele(), out=[];
  const nets=netTable().map(n=>n.name);
  for(const c of S.classes){
    const r=C.classes[c.name];
    if(!r||!r.z)continue;
    /* la largeur de la classe sur chaque couche de signal (classWidth) :
       c'est elle qui est dessinée, et que le fabricant ajuste à la cible */
    const ls=[];
    for(let l=0;l<S.cu;l++){
      if(typeof cmCoucheSignal==="function"&&!cmCoucheSignal(l))continue;
      const w=c.wL&&c.wL[l]>0?c.wL[l]:c.w;
      ls.push("L"+(l+1)+" : "+fmt(w,3).replace(".",","));
    }
    out.push({classe:c.name,
      z:fmt(r.z,1).replace(".",",")+" Ω ± "+fmt(r.zTol!=null?r.zTol:10,0)+" %",
      largeurs:ls.length?ls.join(" ; "):"aucune couche de signal",
      nets:nets.filter(n=>className(n)===c.name).length});
  }
  return out;
}
function dfFeuillesFab(ctx){
  const F=dfNouvelle(ctx,"Plan de fabrication","fab");
  const Z=dfZone(F);
  const colW=Z.cart.w;
  const colX=Z.x2-colW;
  const box={x:Z.x1,y:Z.y1+10,w:colX-Z.x1-8,h:Z.y2-Z.y1-10};
  const V=dfVue(box,0,16);
  F.echelle=V.echelle;
  dfTexte(F,"VUE DE DESSUS — ÉCHELLE "+V.echelle,Z.x1,Z.y1+5,9,{gras:true,cat:"titre"});
  dfContour(F,V,0.45);

  /* perçages : un symbole par outil, de taille fixe sur la feuille */
  const groupes=dfPercages();
  const rs=clamp(V.k*0.35,0.7,1.3);
  groupes.forEach((e,i)=>{
    for(const p of e.pts){const s=V.T(p.x,p.y);dfSymbole(F,i,s.x,s.y,rs);}
  });

  /* cotes hors tout du contour et origine des fichiers */
  const P=boardPoly();
  let x1=Infinity,y1=Infinity,x2=-Infinity,y2=-Infinity;
  for(const p of P){x1=Math.min(x1,p.x);x2=Math.max(x2,p.x);y1=Math.min(y1,p.y);y2=Math.max(y2,p.y);}
  if(Number.isFinite(x1)){
    const bg=V.T(x1,y2), bd=V.T(x2,y2), hg=V.T(x1,y1);
    dfCote(F,bg,bd,"h",7,fmt(x2-x1,2).replace(".",",")+" mm");
    dfCote(F,hg,bg,"v",7,fmt(y2-y1,2).replace(".",",")+" mm");
    const o=gOrigin(), so=V.T(o.x,o.y);
    dfCercle(F,so.x,so.y,1.1,{lw:0.2});
    dfLigne(F,so.x-2,so.y,so.x+2,so.y,0.2);dfLigne(F,so.x,so.y-2,so.x,so.y+2,0.2);
    dfTexte(F,"0,0",so.x+1.6,so.y+3.4,6,{c:0.25,cat:"cote"});
  }

  /* colonne de droite : tableaux, coupe, notes */
  const blocs=[dfBlocTitre("Tableau de perçage")];
  const lignes=groupes.map(e=>["",fmt(e.d,2).replace(".",","),String(e.pts.length),
    e.plaque?"Oui":"Non",dfPortee(e),[...e.usages].join(", ")]);
  lignes.push(["","Total",String(groupes.reduce((a,e)=>a+e.pts.length,0)),"","",""]);
  blocs.push(...dfTableau([{t:"Symb.",p:9,a:"m"},{t:"Ø fini (mm)",p:16,a:"d"},{t:"Qté",p:10,a:"d"},
      {t:"Métallisé",p:15,a:"m"},{t:"Portée",p:15,a:"m"},{t:"Usage",p:35}],lignes,
    {symbole:(Fx,ri,cx,cy)=>{if(ri<groupes.length)dfSymbole(Fx,ri,cx,cy,1.05);},
     gras:ri=>ri===groupes.length,cat:"percage"}));
  blocs.push(...dfContrePercage(F,{vue:V,i0:groupes.length,rs}));
  const npth=(S.holes||[]).filter(h=>h.d>0);
  if(npth.length){
    const o=gOrigin();
    blocs.push(dfBlocEspace(4),dfBlocTitre("Trous de fixation (non métallisés)"));
    blocs.push(...dfTableau([{t:"N°",p:10,a:"m"},{t:"X (mm)",p:25,a:"d"},{t:"Y (mm)",p:25,a:"d"},{t:"Ø (mm)",p:20,a:"d"}],
      npth.map((h,i)=>["H"+(i+1),fmt(h.x-o.x,3).replace(".",","),fmt(o.y-h.y,3).replace(".",","),
                       fmt(h.d,2).replace(".",",")]),{cat:"percage"}));
    npth.forEach((h,i)=>{const s=V.T(h.x,h.y);dfTexte(F,"H"+(i+1),s.x+2.2,s.y-2,6.5,{c:0.2,cat:"percage"});});
  }
  /* les classes à impédance cible du gestionnaire de contraintes
     (30-contraintes.js) : la largeur qui la donne, couche par couche */
  const imp=dfImpedances();
  if(imp.length){
    blocs.push(dfBlocEspace(4),dfBlocTitre("Impédances contrôlées"));
    blocs.push(...dfTableau([{t:"Classe",p:24},{t:"Z cible",p:16,a:"d"},{t:"Couches et largeurs (mm)",p:44},{t:"Nets",p:10,a:"d"}],
      imp.map(r=>[r.classe,r.z,r.largeurs,String(r.nets)]),{cat:"impedance"}));
  }
  blocs.push(dfBlocEspace(4),dfBlocTitre("Coupe d'empilage"),dfBlocEmpilage());
  blocs.push(dfBlocEspace(2),dfBlocTitre("Notes de fabrication"),...dfBlocParagraphes(dfNotesFab(ctx)));
  return dfFlux(ctx,F,{x:colX,y:Z.y1,w:colW,bas:Z.cart.y-4},blocs,"Plan de fabrication","fab");
}

/* ==========================================================================
   Feuilles 2 et 3 — assemblage
   ========================================================================== */
function dfMpn(fp){return fp.mpn||fp.csvMpn||fp.partName||fp.csvPartName||"";}
function dfFeuilleAsm(ctx,face){
  const F=dfNouvelle(ctx,"Assemblage — face "+(face?"dessous":"dessus"),face?"asmB":"asmT");
  const Z=dfZone(F);
  const box={x:Z.x1,y:Z.y1+12,w:Z.x2-Z.x1,h:Z.cart.y-6-(Z.y1+12)};
  const V=dfVue(box,face,8);
  F.echelle=V.echelle;
  const comps=S.fps.filter(fp=>!!fp.side===!!face)
    .sort((a,b)=>String(a.ref).localeCompare(String(b.ref),"fr",{numeric:true}));
  const nm=comps.filter(fp=>!varEstMonte(fp,ctx.vid));
  dfTexte(F,(face?"VUE DE DESSOUS (carte retournée, vue en miroir)":"VUE DE DESSUS")+
          " — ÉCHELLE "+V.echelle,Z.x1,Z.y1+5,9,{gras:true,cat:"titre"});
  dfTexte(F,comps.length+" composant(s) sur cette face"+
          (nm.length?" — "+nm.length+" non monté(s) dans la variante, en tirets : "+nm.map(f=>f.ref).join(", "):""),
          Z.x1,Z.y1+10,6.5,{c:0.3,cat:"legende"});
  dfContour(F,V,0.4);

  /* les pastilles d'abord, en gris léger : elles situent le corps. Le net de
     chacune est posé dessus en invisible : chercher « GND » ou « USB_DP »
     sur le plan d'assemblage montre les broches où il arrive. */
  for(const fp of comps)
    for(const q of padsWorld(fp)){
      const pts=dfPadForme(q).map(p=>V.T(p.x,p.y));
      dfPoly(F,pts,{ferme:true,lw:0.08,trait:0.55,plein:0.9});
      if(q.net){
        const c=V.T(q.x,q.y);
        dfTexte(F,q.net,c.x,c.y,3,{ancre:"m",cache:true,cat:"net",lieu:fp.ref+" · broche "+q.n,
          cible:{x1:Math.min(...pts.map(p=>p.x)),y1:Math.min(...pts.map(p=>p.y)),
                 x2:Math.max(...pts.map(p=>p.x)),y2:Math.max(...pts.map(p=>p.y))}});
      }
    }

  for(const fp of comps){
    const monte=varEstMonte(fp,ctx.vid);
    const T=fpXform(fp), b=bodyOf(fp);
    const coins=[T(b.x1,b.y1),T(b.x2,b.y1),T(b.x2,b.y2),T(b.x1,b.y2)].map(p=>V.T(p.x,p.y));
    dfPoly(F,coins,{ferme:true,lw:monte?0.25:0.2,trait:monte?0:0.35,tirets:!monte});
    const mk=fpMark(fp);
    if(mk&&monte){
      const w=T(mk.x,mk.y), s=V.T(w.x,w.y);
      dfCercle(F,s.x,s.y,clamp(mk.d/2*V.k,0.3,0.9),{plein:0,trait:null});
    }
    const bx1=Math.min(...coins.map(p=>p.x)), bx2=Math.max(...coins.map(p=>p.x));
    const by1=Math.min(...coins.map(p=>p.y)), by2=Math.max(...coins.map(p=>p.y));
    const cx=(bx1+bx2)/2, cy=(by1+by2)/2, bw=bx2-bx1, bh=by2-by1;
    const vertical=bh>bw*1.15;
    const long=vertical?bh:bw, court=vertical?bw:bh;
    let hmm=clamp(court*0.55,0.9,3.2);
    const ref=String(fp.ref||"?");
    const lw=dfLargeur(ref,hmm/DF_PT,true);
    if(lw>long*0.92)hmm=Math.max(0.9,hmm*long*0.92/lw);
    const pt=hmm/DF_PT;
    const cible={x1:bx1,y1:by1,x2:bx2,y2:by2};
    if(vertical)dfTexte(F,ref,cx+hmm*0.35,cy,pt,{ancre:"m",rot:90,gras:true,c:monte?0:0.4,cible,cat:"repere"});
    else dfTexte(F,ref,cx,cy+hmm*0.35,pt,{ancre:"m",gras:true,c:monte?0:0.4,cible,cat:"repere"});
    if(!monte)dfTexte(F,"NM",bx2+0.4,by1+1.6,5,{c:0.35,cible,cat:"nm"});
    /* invisibles mais cherchables, posés sur le corps */
    for(const [v,cat] of [[fp.value,"valeur"],[fp.pkg,"boitier"],[dfMpn(fp),"mpn"],
                          [fp.manufacturer,"fabricant"],[fp.description,"description"]])
      if(v)dfTexte(F,ref+" "+v,cx,cy,pt,{ancre:"m",cache:true,cible,cat});
    F.signets.push({titre:ref+(fp.value?" — "+fp.value:"")+(monte?"":" (NM)"),x:cx,y:cy});
  }
  return F;
}

/* ==========================================================================
   Feuille 4 — nomenclature
   ========================================================================== */
function dfGroupesBom(vid){
  const g=new Map();
  for(const fp of S.fps){
    if(!varEstMonte(fp,vid))continue;
    const mpn=dfMpn(fp);
    const k=(fp.value||"")+"|"+(fp.pkg||"")+"|"+mpn;
    let e=g.get(k);
    if(!e)g.set(k,e={value:fp.value||"",pkg:fp.pkg||"",mpn,fab:fp.manufacturer||"",refs:[],faces:new Set()});
    e.refs.push(String(fp.ref||""));
    e.faces.add(fp.side?"Dessous":"Dessus");
    if(!e.fab&&fp.manufacturer)e.fab=fp.manufacturer;
  }
  const cmp=(a,b)=>String(a).localeCompare(String(b),"fr",{numeric:true});
  const out=[...g.values()];
  for(const e of out)e.refs.sort(cmp);
  /* rangées par famille de repère (C, D, J, R, U…), puis par premier repère */
  out.sort((a,b)=>cmp(a.refs[0].replace(/\d.*$/,""),b.refs[0].replace(/\d.*$/,""))||cmp(a.refs[0],b.refs[0]));
  return out;
}
function dfFeuillesBom(ctx){
  const F=dfNouvelle(ctx,"Nomenclature","bom");
  const Z=dfZone(F);
  const grp=dfGroupesBom(ctx.vid);
  const total=grp.reduce((a,e)=>a+e.refs.length,0);
  const blocs=[dfBlocTitre("Nomenclature — "+total+" composant(s), "+grp.length+" référence(s)"+
                           (ctx.variante?" — variante "+ctx.variante:""))];
  blocs.push(...dfTableau([{t:"N°",p:5,a:"d"},{t:"Qté",p:5,a:"d"},{t:"Repères",p:30},{t:"Valeur",p:14},
      {t:"Boîtier",p:14},{t:"Réf. fabricant",p:16},{t:"Fabricant",p:10},{t:"Face",p:8}],
    grp.map((e,i)=>[String(i+1),String(e.refs.length),e.refs.join(", "),e.value,e.pkg,e.mpn,e.fab,
                    [...e.faces].join(", ")]),
    {cat:"bom",pt:7}));
  const nm=S.fps.filter(fp=>!varEstMonte(fp,ctx.vid)).map(fp=>String(fp.ref))
    .sort((a,b)=>a.localeCompare(b,"fr",{numeric:true}));
  if(nm.length){
    blocs.push(dfBlocEspace(4),dfBlocTitre("Non montés dans la variante « "+ctx.variante+" »"));
    blocs.push(...dfBlocParagraphes([{texte:nm.join(", "),retrait:0}],7.5));
  }
  return dfFlux(ctx,F,{x:Z.x1,y:Z.y1,w:Z.x2-Z.x1,bas:Z.cart.y-4},blocs,"Nomenclature","bom");
}

/* ==========================================================================
   Feuilles 5+ — couches de cuivre
   ========================================================================== */
function dfFeuilleCouche(ctx,i){
  const nom=(S.cuL[i]&&S.cuL[i].name)||cuLabel(i,S.cu);
  const F=dfNouvelle(ctx,"Couche "+(i+1)+" — "+nom,"cu"+i);
  const Z=dfZone(F);
  const box={x:Z.x1,y:Z.y1+12,w:Z.x2-Z.x1,h:Z.cart.y-6-(Z.y1+12)};
  const V=dfVue(box,0,8);
  F.echelle=V.echelle;
  dfTexte(F,"COUCHE L"+(i+1)+" — "+nom.toUpperCase()+" — VUE DE DESSUS — ÉCHELLE "+V.echelle,
          Z.x1,Z.y1+5,9,{gras:true,cat:"titre"});
  dfTexte(F,"Les noms de nets sont posés en texte invisible sur la plus longue piste de chaque net : "+
          "la recherche du lecteur PDF les trouve.",Z.x1,Z.y1+10,6.5,{c:0.3,cat:"legende"});
  const cu=0.15, P=p=>V.T(p.x,p.y);
  const boite=pts=>({x1:Math.min(...pts.map(p=>p.x))-0.6,y1:Math.min(...pts.map(p=>p.y))-0.6,
                     x2:Math.max(...pts.map(p=>p.x))+0.6,y2:Math.max(...pts.map(p=>p.y))+0.6});
  for(const z of S.zones){
    if(z.l!==i||!z.pts||z.pts.length<3)continue;
    const pts=z.pts.map(P);
    dfPoly(F,pts,{ferme:true,lw:0.12,trait:0.45,plein:0.86});
    if(z.net)dfTexte(F,z.net,pts[0].x,pts[0].y,4,{cache:true,cible:boite(pts),cat:"net"});
  }
  dfContour(F,V,0.3);
  const longues=new Map();
  for(const t of S.tracks){
    if(t.l!==i)continue;
    const pts=dfPistePts(t).map(P);
    dfPoly(F,pts,{lw:Math.max(t.w*V.k,0.06),trait:cu});
    if(t.net){
      const L=trkLen(t), e=longues.get(t.net);
      if(!e||L>e.L)longues.set(t.net,{L,t,pts});
    }
  }
  for(const fp of S.fps)
    for(const q of padsWorld(fp)){
      const surCouche=q.drill>0?padCuLayers(fp,q).includes(i):padLayers(fp,q)[0]===i;
      if(!surCouche)continue;
      dfPoly(F,dfPadForme(q).map(P),{ferme:true,plein:cu,trait:null});
      if(q.drill>0){const s=P(q);dfCercle(F,s.x,s.y,q.drill/2*V.k,{plein:1,trait:null});}
    }
  for(const v of S.vias){
    if(i<Math.min(v.a,v.b)||i>Math.max(v.a,v.b))continue;
    const s=P(v);
    dfCercle(F,s.x,s.y,v.d/2*V.k,{plein:cu,trait:null});
    dfCercle(F,s.x,s.y,v.drill/2*V.k,{plein:1,trait:null});
  }
  for(const [net,e] of longues){
    const m=P(trkAt(e.t,0.5));
    dfTexte(F,net,m.x,m.y,4,{ancre:"m",cache:true,cible:boite(e.pts),cat:"net"});
  }
  return F;
}

/* ==========================================================================
   Le document
   ========================================================================== */
function dfContexte(){
  const cfg=dfCfg();
  const vid=(S.variantes&&S.variantes.active)||"";
  let rev="A";
  try{if(typeof projdRevision==="function")rev=projdRevision()||"A";}catch(_){}
  return {cfg,vid,variante:vid&&typeof varNom==="function"?varNom(S.variantes,vid):"",
          projet:pcbProjNom()||"Carte",docNum:fabBase()+"-PLANS",rev,
          date:new Date().toISOString().slice(0,10)};
}
function dfDocument(){
  const ctx=dfContexte(), f=ctx.cfg.feuilles, feuilles=[];
  if(f.fab)feuilles.push(...dfFeuillesFab(ctx));
  if(f.asmT)feuilles.push(dfFeuilleAsm(ctx,0));
  if(f.asmB&&S.fps.some(fp=>fp.side))feuilles.push(dfFeuilleAsm(ctx,1));
  if(f.bom)feuilles.push(...dfFeuillesBom(ctx));
  if(f.couches)for(let i=0;i<S.cu;i++)feuilles.push(dfFeuilleCouche(ctx,i));
  feuilles.forEach((F,i)=>dfCadre(F,ctx,i+1,feuilles.length));
  const refs=S.fps.map(fp=>fp.ref).filter(Boolean);
  return {feuilles,ctx,meta:{
    titre:ctx.projet+" — plans de fabrication et d'assemblage",
    auteur:ctx.cfg.auteur||ctx.cfg.societe||"",
    sujet:"Plans de fabrication et d'assemblage — "+ctx.docNum+" rév. "+ctx.rev,
    motsCles:["PCB","fabrication","assemblage",ctx.projet].concat(refs.slice(0,400)).join(", ")}};
}
function dfPdfOctets(doc){
  doc=doc||dfDocument();
  return doc.feuilles.length?dfPdf(doc.feuilles,doc.meta):null;
}

/* ---------- recherche ----------
   La même que celle du lecteur PDF, sur le même texte — invisibles compris —,
   mais sans souci des accents ni de la casse : « resistance » trouve
   « Résistance ». */
function dfNormTxt(s){
  return String(s==null?"":s).normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase();
}
function dfChercher(doc,q){
  const n=dfNormTxt(q).trim();
  if(!n)return [];
  const vus=new Set(), out=[];
  doc.feuilles.forEach((F,p)=>{
    for(const it of F.items){
      if(it.t!=="t"||dfNormTxt(it.s).indexOf(n)<0)continue;
      const b=it.cible||dfBoiteTexte(it);
      const k=p+"|"+b.x1.toFixed(1)+"|"+b.y1.toFixed(1)+"|"+b.x2.toFixed(1)+"|"+b.y2.toFixed(1);
      if(vus.has(k))continue;
      vus.add(k);
      out.push({p,s:it.s,cat:it.cat,lieu:it.lieu,cache:it.cache,box:b});
    }
  });
  return out;
}

/* ==========================================================================
   Fenêtre : réglages, aperçu, recherche, export
   ========================================================================== */
var DF={doc:null,page:0,q:"",hits:[],actif:-1,zoom:1};
const DF_CAT={repere:"repère",valeur:"valeur",boitier:"boîtier",mpn:"réf. fabricant",
  fabricant:"fabricant",description:"description",net:"net",bom:"nomenclature",
  percage:"perçage",empilage:"empilage",note:"note",cartouche:"cartouche",
  titre:"titre",tableau:"tableau",legende:"légende",cote:"cote",nm:"non monté",
  symbole:"symbole",zone:"zone",impedance:"impédance"};

function dfOuvrir(){
  if(typeof pcbVarDepuisSchema==="function")pcbVarDepuisSchema();
  let m=document.getElementById("dfEd");
  if(!m){
    m=document.createElement("div");
    m.id="dfEd";m.className="modal df-modal";
    m.setAttribute("role","dialog");m.setAttribute("aria-modal","true");
    m.setAttribute("aria-label","Plans de fabrication et d'assemblage");
    document.body.appendChild(m);
    m.addEventListener("pointerdown",e=>{if(e.target===m)dfFermer();});
    m.addEventListener("keydown",e=>{
      if(e.key==="Escape"){e.stopPropagation();dfFermer();return;}
      if(e.key==="Enter"&&e.target&&e.target.id==="dfQ"){
        e.preventDefault();dfAller(DF.hits.length?(DF.actif+(e.shiftKey?-1:1)+DF.hits.length)%DF.hits.length:-1);
      }
      e.stopPropagation();       // les raccourcis de l'éditeur restent dehors
    });
    m.addEventListener("input",e=>{
      const t=e.target;
      if(t.id==="dfQ"){DF.q=t.value;dfChercherUi();return;}
      if(t.dataset&&t.dataset.cfg){dfRegler(t.dataset.cfg,t.value);dfReconstruire();}
    });
    m.addEventListener("change",e=>{
      const t=e.target;
      if(t.dataset&&t.dataset.feuille){dfRegler(t.dataset.feuille,t.checked);DF.page=0;dfReconstruire();}
    });
    m.addEventListener("click",e=>{
      const b=e.target.closest&&e.target.closest("[data-a]");
      if(!b)return;
      const a=b.dataset.a;
      if(a==="fermer")dfFermer();
      else if(a==="pdf")dfExporter();
      else if(a==="page"){DF.page=+b.dataset.p;DF.actif=-1;dfRendreApercu();}
      else if(a==="hit")dfAller(+b.dataset.i);
      else if(a==="zoom+"){DF.zoom=Math.min(8,DF.zoom*1.4);dfRendreApercu();}
      else if(a==="zoom-"){DF.zoom=Math.max(0.5,DF.zoom/1.4);dfRendreApercu();}
      else if(a==="zoom0"){DF.zoom=1;dfRendreApercu();}
    });
  }
  m.hidden=false;
  dfRendreCadre();
  dfReconstruire();
  const q=document.getElementById("dfQ");
  if(q&&q.focus)q.focus();
}
function dfFermer(){
  const m=document.getElementById("dfEd");
  if(m)m.hidden=true;
}
function dfRendreCadre(){
  const m=document.getElementById("dfEd");
  if(!m)return;
  const c=dfCfg();
  const champ=(k,lib)=>'<label class="df-champ"><span>'+lib+'</span><input type="text" data-cfg="'+k+
    '" value="'+esc(c[k])+'" maxlength="120"></label>';
  m.innerHTML='<div class="modal-box df-box">'+
    '<div class="modal-head"><span class="modal-title">Plans — fabrication et assemblage</span>'+
      '<input type="search" id="dfQ" class="df-q" placeholder="Chercher : repère, valeur, net, référence…" value="'+esc(DF.q)+
      '" aria-label="Chercher dans les plans" autocomplete="off">'+
      '<span class="df-n" id="dfN"></span>'+
      '<button class="tb" type="button" data-a="pdf" title="Télécharger le PDF : texte cherchable, signets par feuille et par composant">⬇ Exporter PDF</button>'+
      '<button class="tb" type="button" data-a="fermer" title="Fermer (Échap)">✕</button></div>'+
    '<div class="modal-body df-corps">'+
      '<aside class="df-cfg">'+
        '<div class="df-res" id="dfRes"></div>'+
        '<div class="df-h">Feuilles</div>'+
        DF_FEUILLES.map(([k,lib])=>'<label class="df-case"><input type="checkbox" data-feuille="'+k+'"'+
          (c.feuilles[k]?" checked":"")+'> '+lib+'</label>').join("")+
        '<div class="df-h">Format</div>'+
        '<select class="tbsel" data-cfg="format">'+Object.keys(DF_FORMATS).map(f=>'<option value="'+f+'"'+
          (c.format===f?" selected":"")+'>'+f+' paysage ('+DF_FORMATS[f].w+' × '+DF_FORMATS[f].h+' mm)</option>').join("")+'</select>'+
        '<div class="df-h">Cartouche</div>'+
        champ("societe","Société")+champ("auteur","Dessiné par")+champ("verifie","Vérifié par")+champ("approuve","Approuvé par")+
        '<div class="df-h">Notes ajoutées au plan de fabrication</div>'+
        '<textarea data-cfg="notes" class="df-notes" placeholder="Une note par ligne">'+esc(c.notes)+'</textarea>'+
      '</aside>'+
      '<main class="df-apercu"><div class="df-onglets" id="dfOnglets"></div><div class="df-feuille" id="dfFeuille"></div></main>'+
    '</div></div>';
}
let dfMinuterie=null;
/* Les champs se reconstruisent à la frappe, mais pas à chaque lettre : une
   carte de mille composants refait ses feuilles en quelques dizaines de
   millisecondes, et la frappe ne doit pas attendre. */
function dfReconstruire(){
  if(dfMinuterie)clearTimeout(dfMinuterie);
  const go=()=>{
    dfMinuterie=null;
    DF.doc=dfDocument();
    if(DF.page>=DF.doc.feuilles.length)DF.page=0;
    dfChercherUi(true);
  };
  if(DF.doc)dfMinuterie=setTimeout(go,180);else go();
}
function dfChercherUi(garderPage){
  if(!DF.doc)return;
  DF.hits=dfChercher(DF.doc,DF.q);
  DF.actif=-1;
  if(DF.hits.length&&!garderPage){
    const ici=DF.hits.findIndex(h=>h.p===DF.page);
    DF.actif=ici>=0?ici:0;
    DF.page=DF.hits[DF.actif].p;
  }
  dfRendreResultats();
  dfRendreApercu();
}
function dfAller(i){
  if(i<0||i>=DF.hits.length)return;
  DF.actif=i;DF.page=DF.hits[i].p;
  dfRendreResultats();dfRendreApercu();
}
function dfRendreResultats(){
  const n=document.getElementById("dfN"), r=document.getElementById("dfRes");
  if(!n||!r)return;
  const q=DF.q.trim();
  n.textContent=q?(DF.hits.length?DF.hits.length+" résultat(s)":"aucun résultat"):"";
  if(!q){r.innerHTML="";return;}
  const max=200;
  r.innerHTML='<div class="df-h">Résultats</div>'+(DF.hits.length?"":'<p class="df-vide">Rien ne correspond dans les plans.</p>')+
    DF.hits.slice(0,max).map((h,i)=>'<button type="button" class="df-hit-l'+(i===DF.actif?" on":"")+
      '" data-a="hit" data-i="'+i+'"><b>'+esc(h.s.length>48?h.s.slice(0,47)+"…":h.s)+'</b><span>'+
      esc((DF_CAT[h.cat]||h.cat||"texte")+(h.lieu?" · "+h.lieu:"")+" · f. "+(h.p+1))+'</span></button>').join("")+
    (DF.hits.length>max?'<p class="df-vide">… et '+(DF.hits.length-max)+' autre(s).</p>':"");
}
function dfRendreApercu(){
  const o=document.getElementById("dfOnglets"), f=document.getElementById("dfFeuille");
  if(!o||!f||!DF.doc)return;
  const F=DF.doc.feuilles;
  if(!F.length){
    o.innerHTML="";
    f.innerHTML='<p class="df-vide">Aucune feuille choisie : cochez au moins une feuille à gauche.</p>';
    return;
  }
  const parPage=new Map();
  for(const h of DF.hits)parPage.set(h.p,(parPage.get(h.p)||0)+1);
  o.innerHTML=F.map((x,i)=>'<button type="button" class="df-onglet'+(i===DF.page?" on":"")+'" data-a="page" data-p="'+i+'">'+
      (i+1)+". "+esc(x.titre)+(parPage.get(i)?' <i>'+parPage.get(i)+'</i>':"")+'</button>').join("")+
    '<span class="df-zoom"><button type="button" class="tb" data-a="zoom-" title="Réduire">−</button>'+
    '<button type="button" class="tb" data-a="zoom0" title="Page entière">'+Math.round(DF.zoom*100)+' %</button>'+
    '<button type="button" class="tb" data-a="zoom+" title="Agrandir">+</button></span>';
  const hits=DF.hits.map((h,i)=>({...h.box,p:h.p,actif:i===DF.actif})).filter(h=>h.p===DF.page);
  f.innerHTML=dfSvg(F[DF.page],hits);
  const svg=f.querySelector&&f.querySelector("svg");
  if(svg&&svg.style){svg.style.width=(DF.zoom*100)+"%";svg.style.height="auto";}
  const on=f.querySelector&&f.querySelector(".df-hit.on");
  if(on&&on.scrollIntoView)on.scrollIntoView({block:"center",inline:"center",behavior:"smooth"});
}
function dfExporter(){
  const doc=DF.doc||dfDocument();
  const pdf=dfPdfOctets(doc);
  if(!pdf){hint("Aucune feuille choisie : rien à exporter.");return null;}
  dl(new Blob([pdf],{type:"application/pdf"}),pcbFile("-PLANS.pdf","plans.pdf"));
  hint("Plans exportés : "+doc.feuilles.length+" feuille(s), texte cherchable (Ctrl+F dans le lecteur PDF).");
  return pdf;
}
(function dfBrancher(){
  if(typeof document==="undefined"||!document.getElementById)return;
  const b=document.getElementById("bPlans");
  if(b)b.onclick=dfOuvrir;
})();
