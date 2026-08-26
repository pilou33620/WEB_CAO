# -*- coding: utf-8 -*-
# =============================================================================
# visionneuse-ipc2581/test/banc-essai.py
# Banc d'essai du parseur IPC-2581 et du modele JSON qu'il alimente.
#
#     python visionneuse-ipc2581/test/banc-essai.py
#
# Pourquoi en Python et non en JavaScript comme les deux editeurs : ce qui se
# teste ici est justement la moitie qui n'est pas dans le navigateur. Un
# navigateur ne peut pas executer ipc2581_parser.py -- c'est toute la raison
# d'etre de la route /api/ipc2581 -- et c'est pourtant la que vivent la
# geometrie, l'empilage et les permittivites, c'est-a-dire ce qui se trompe
# silencieusement.
#
# Pourquoi une carte ecrite ici plutot qu'un vrai fichier de fabricant : un
# IPC-2581 reel pese une dizaine de mega-octets, et sa place n'est pas dans
# l'historique (voir .gitignore). La carte ci-dessous tient en deux ecrans,
# elle est deterministe, et chaque valeur qu'elle porte est choisie pour etre
# verifiable a la main : une piste de 20 mm et une de 10 mm, donc 30 mm de
# cuivre, un Dk de 4.37 qu'il faut aller chercher dans une <Spec>, un via a
# l'endroit exact ou la piste s'arrete.
#
# Sa structure est copiee sur celle d'un export du commerce, pas inventee :
# meme espace de noms, meme imbrication Ecad/CadData/Step/LayerFeature/Set,
# memes deux ecritures de permittivite. Un test qui passerait sur une
# structure de fantaisie ne prouverait rien.
# =============================================================================
import io
import os
import sys
import zipfile

RACINE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, RACINE)

import ipc2581_json                                          # noqa: E402
from ipc2581_parser import IPC2581ParseError                 # noqa: E402


# =============================================================================
# La carte d'essai
# -----------------------------------------------------------------------------
# Deux couches de cuivre separees par 0,2 mm de dielectrique, un contour de
# 40 x 20, une piste coudee de 20 + 10 mm sur le dessus, la pastille et le via
# ou elle s'arrete, une resistance et son boitier.
#
# Trois details sont la expres, parce que trois corrections du parseur les ont
# rendus necessaires (voir l'entete de version d'ipc2581_parser.py) :
#   - la seconde piste tient sa largeur d'un <LineDescRef>, pas d'un
#     <LineDesc> local : c'est le dictionnaire de lignes qui doit repondre ;
#   - le <LineDesc> de la premiere piste n'a aucun enfant, ce qui suffisait a
#     le rendre faux au sens booleen, et toutes les pistes du fichier
#     ressortaient a une largeur nulle (v1.68) ;
#   - la permittivite ne vit pas sur la couche mais dans une <Spec> pointee
#     par un <SpecRef>, sous <CadHeader>, ecrite en « type + Property »
#     (v1.70). C'est la forme la plus courante, et c'est celle qui manquait.
# =============================================================================
CARTE = u"""<?xml version="1.0" encoding="UTF-8"?>
<IPC-2581 revision="B" xmlns="http://webstds.ipc.org/2581">
 <Content roleRef="owner">
  <FunctionMode mode="USERDEF" level="1"/>
  <StepRef name="CARTE-ESSAI"/>
  <DictionaryLineDesc units="MILLIMETER">
   <EntryLineDesc id="l25"><LineDesc lineEnd="ROUND" lineWidth="0.25"/></EntryLineDesc>
  </DictionaryLineDesc>
  <DictionaryStandard units="MILLIMETER">
   <EntryStandard id="c100"><Circle diameter="1.0"/></EntryStandard>
   <EntryStandard id="r160"><RectCenter width="1.6" height="0.9"/></EntryStandard>
  </DictionaryStandard>
 </Content>
 <Ecad name="essai">
  <CadHeader units="MILLIMETER">
   <Spec name="DielectricLayer-1-2_Dielectric">
    <Dielectric type="DIELECTRIC_CONSTANT">
     <Property value="4.37"/>
    </Dielectric>
   </Spec>
   <Spec name="DielectricLayer-1-2_Perte">
    <Dielectric type="LOSS_TANGENT">
     <Property value="0.022"/>
    </Dielectric>
   </Spec>
  </CadHeader>
  <CadData>
   <Layer name="Conductor-1" layerFunction="SIGNAL" side="TOP" polarity="POSITIVE"/>
   <Layer name="DielectricLayer-1-2" layerFunction="DIELPREG" side="INTERNAL"/>
   <Layer name="Conductor-2" layerFunction="PLANE" side="BOTTOM" polarity="POSITIVE"/>
   <Layer name="Hole1-2" layerFunction="DRILL" side="ALL"/>
   <Layer name="Symbol-A" layerFunction="SILKSCREEN" side="TOP"/>
   <Stackup overallThickness="0.27">
    <StackupGroup name="AllStackupLayers" thickness="0.27">
     <StackupLayer layerOrGroupRef="Conductor-1" thickness="0.035" sequence="1"/>
     <StackupLayer layerOrGroupRef="DielectricLayer-1-2" thickness="0.2" sequence="2">
      <SpecRef id="DielectricLayer-1-2_Dielectric"/>
      <SpecRef id="DielectricLayer-1-2_Perte"/>
     </StackupLayer>
     <StackupLayer layerOrGroupRef="Conductor-2" thickness="0.035" sequence="3"/>
    </StackupGroup>
   </Stackup>
   <Step name="CARTE-ESSAI">
    <Datum x="0" y="0"/>
    <Profile>
     <Polygon>
      <PolyBegin x="0" y="0"/>
      <PolyStepSegment x="40" y="0"/>
      <PolyStepSegment x="40" y="20"/>
      <PolyStepSegment x="0" y="20"/>
      <PolyStepSegment x="0" y="0"/>
     </Polygon>
    </Profile>
    <Package name="R0603" type="CHIP" height="0.45">
     <Pin number="1" name="1" type="SURFACE">
      <Location x="-0.75" y="0"/>
      <StandardPrimitiveRef id="r160"/>
     </Pin>
     <Pin number="2" name="2" type="SURFACE">
      <Location x="0.75" y="0"/>
      <StandardPrimitiveRef id="r160"/>
     </Pin>
    </Package>
    <Component refDes="R1" packageRef="R0603" part="RES-10K"
               layerRef="Component-1-A" mountType="SMT" height="0.45">
     <Xform rotation="90"/>
     <Location x="10" y="10"/>
    </Component>
    <LogicalNet name="SIG_A" netClass="SIGNAL">
     <PinRef componentRef="R1" pin="1"/>
    </LogicalNet>
    <LayerFeature layerRef="Conductor-1">
     <Set net="SIG_A">
      <Features>
       <Line startX="5" startY="5" endX="25" endY="5">
        <LineDesc lineEnd="ROUND" lineWidth="0.2"/>
       </Line>
       <Line startX="25" startY="5" endX="25" endY="15">
        <LineDescRef id="l25"/>
       </Line>
      </Features>
     </Set>
     <Set net="SIG_A" padUsage="TERMINATION" geometry="c100">
      <Pad>
       <Location x="25" y="15"/>
       <StandardPrimitiveRef id="c100"/>
      </Pad>
     </Set>
    </LayerFeature>
    <LayerFeature layerRef="Hole1-2">
     <Set net="SIG_A" padUsage="VIA" geometry="v25">
      <Hole name="R0.125" diameter="0.25" platingStatus="PLATED"
            plusTol="0" minusTol="0" x="25" y="15"/>
     </Set>
    </LayerFeature>
   </Step>
  </CadData>
 </Ecad>
</IPC-2581>
"""
OCTETS = CARTE.encode("utf-8")


# =============================================================================
# Le harnais : meme forme que celui des deux editeurs (un T() par cas), en
# Python. Un cas rate n'arrete pas les autres -- on veut la liste complete de
# ce qui casse, pas le premier echec.
# =============================================================================
CAS = []
ECHECS = []


def T(titre, fonction):
    CAS.append(titre)
    try:
        fonction()
    except Exception as exc:                                  # noqa: BLE001
        ECHECS.append((titre, exc))
        print(u"  ECHEC  %s" % titre)
        print(u"         %s" % exc)
    else:
        print(u"  ok     %s" % titre)


def egal(vu, attendu, quoi):
    if vu != attendu:
        raise AssertionError(u"%s : %r attendu, %r vu" % (quoi, attendu, vu))


def proche(vu, attendu, quoi, tol=1e-6):
    if abs(float(vu) - float(attendu)) > tol:
        raise AssertionError(u"%s : %s attendu, %s vu" % (quoi, attendu, vu))


def vrai(condition, quoi):
    if not condition:
        raise AssertionError(quoi)


# Une seule lecture pour tous les cas qui portent sur la carte d'essai : le
# parseur ne garde pas d'etat d'un fichier a l'autre, et relire vingt fois le
# meme XML n'apprendrait rien de plus.
DESIGN = ipc2581_json.charger_octets(OCTETS, "carte-essai.xml")
MODELE = ipc2581_json.design_en_dict(DESIGN, "carte-essai.xml")


def couche(nom):
    """La couche d'empilage portant ce nom, ou lever."""
    for c in DESIGN.stackup:
        if c.name == nom:
            return c
    raise AssertionError(u"couche %s absente de l'empilage" % nom)


def pistes():
    """Toutes les pistes de la carte, quel que soit leur net."""
    out = []
    for net in DESIGN.nets.values():
        out.extend(net.tracks)
    return out


print(u"")
print(u"Banc d'essai de la visionneuse IPC-2581")
print(u"-" * 62)

# -- Unites et empilage -------------------------------------------------------
T(u"les unites viennent de <CadHeader>",
  lambda: egal(DESIGN.units, "MILLIMETER", u"unites"))

T(u"l'empilage a ses trois couches, dans l'ordre des sequences",
  lambda: egal([c.name for c in DESIGN.stackup],
               ["Conductor-1", "DielectricLayer-1-2", "Conductor-2"],
               u"noms de l'empilage"))

T(u"l'epaisseur d'une couche est lue",
  lambda: proche(couche("DielectricLayer-1-2").thickness, 0.2,
                 u"epaisseur du dielectrique"))

T(u"l'epaisseur totale vient de <Stackup overallThickness>",
  lambda: proche(DESIGN.total_thickness, 0.27, u"epaisseur de la carte"))

T(u"layerFunction distingue le conducteur, le plan et le dielectrique",
  lambda: egal([couche("Conductor-1").layer_type,
                couche("DielectricLayer-1-2").layer_type,
                couche("Conductor-2").layer_type],
               ["SIGNAL", "DIELPREG", "PLANE"], u"types de couche"))

# -- Permittivite : la correction 1.70 ---------------------------------------
T(u"le Dk se lit dans une <Spec> pointee par <SpecRef> (forme type+Property)",
  lambda: egal(couche("DielectricLayer-1-2").dk, "4.37", u"Dk du dielectrique"))

T(u"le Df de la meme couche se lit de la meme facon",
  lambda: egal(couche("DielectricLayer-1-2").df, "0.022", u"Df du dielectrique"))

T(u"une couche sans <SpecRef> n'invente pas de permittivite",
  lambda: egal(couche("Conductor-1").dk, "", u"Dk d'un conducteur"))

# -- Contour ------------------------------------------------------------------
T(u"le contour de carte est lu depuis <Profile>",
  lambda: vrai(DESIGN.board_outline is not None, u"aucun contour de carte"))

T(u"le contour fait bien 40 x 20",
  lambda: egal([(round(p.x, 3), round(p.y, 3))
                for p in DESIGN.board_outline.outline[:4]],
               [(0.0, 0.0), (40.0, 0.0), (40.0, 20.0), (0.0, 20.0)],
               u"sommets du contour"))

# -- Pistes : la correction 1.68 ---------------------------------------------
T(u"les deux pistes de la carte sont lues",
  lambda: egal(len(pistes()), 2, u"nombre de pistes"))

T(u"un <LineDesc> sans enfant donne quand meme sa largeur",
  lambda: proche(sorted(p.width for p in pistes())[0], 0.2,
                 u"largeur de la piste a <LineDesc>"))

T(u"un <LineDescRef> va chercher sa largeur dans le dictionnaire",
  lambda: proche(sorted(p.width for p in pistes())[1], 0.25,
                 u"largeur de la piste a <LineDescRef>"))

T(u"les pistes portent leur net et leur couche",
  lambda: egal(sorted(set((p.net_name, p.layer_name) for p in pistes())),
               [("SIG_A", "Conductor-1")], u"net et couche des pistes"))

# -- Pastilles, percages, vias ------------------------------------------------
T(u"la pastille du <Set> est lue",
  lambda: egal(len(DESIGN.standalone_pads), 1, u"nombre de pastilles"))

T(u"le percage est lu, avec son diametre et sa metallisation",
  lambda: egal([(round(t.diameter, 3), t.plating) for t in DESIGN.drills],
               [(0.25, "PLATED")], u"percages"))

T(u"un percage marque padUsage=VIA est reconnu comme via",
  lambda: vrai(any(t.padstack_ref for t in DESIGN.drills),
               u"le percage n'a pas de padstack de via"))

T(u"le via est a l'endroit ou la piste s'arrete",
  lambda: egal([(round(t.location.x, 3), round(t.location.y, 3))
                for t in DESIGN.drills],
               [(25.0, 15.0)], u"position du percage"))

# -- Composants et boitiers ---------------------------------------------------
T(u"le composant est lu avec son repere et son boitier",
  lambda: egal([(c.ref_des, c.package_ref) for c in DESIGN.components],
               [("R1", "R0603")], u"composants"))

T(u"la rotation du composant est lue",
  lambda: proche(DESIGN.components[0].rotation, 90, u"rotation de R1"))

T(u"le boitier est lu avec ses deux broches",
  lambda: egal(len(DESIGN.packages["R0603"].pins), 2,
               u"broches du boitier R0603"))

# -- Broche -> net : la correction 1.72 --------------------------------------
# La carte d'essai ne declare le net que d'une seule broche de R1 (la 1) :
# c'est expres, pour verifier que la broche 2 reste sans net plutot que d'en
# hasarder un.
T(u"le net d'une broche vient de <LogicalNet>, pas des <Pad> du <Pin>",
  lambda: egal(DESIGN.components[0].pin_nets, {"1": "SIG_A"},
               u"pin_nets de R1"))

T(u"une broche sans <PinRef> n'a pas de net invente",
  lambda: vrai("2" not in DESIGN.components[0].pin_nets,
               u"la broche 2 de R1 ne devrait porter aucun net"))

# -- Le modele JSON de la visionneuse ----------------------------------------
T(u"le modele annonce son format",
  lambda: egal(MODELE["format"], ipc2581_json.FORMAT, u"format du modele"))

T(u"les couches deviennent un index, l'empilage d'abord",
  lambda: egal(MODELE["couches"][:3],
               ["Conductor-1", "DielectricLayer-1-2", "Conductor-2"],
               u"index des couches"))

T(u"une piste designe sa couche et son net par leur rang",
  lambda: vrai(all(isinstance(p["c"], int) and isinstance(p["n"], int)
                   for p in MODELE["pistes"]),
               u"une piste ne porte pas des rangs entiers"))

def modele_broches_r1():
    return {p["num"]: p.get("n") for p in
            next(c for c in MODELE["composants"] if c["ref"] == "R1")["pins"]}


def mdl_net_nom(rang):
    return MODELE["nets"][rang] if rang is not None and rang >= 0 else None


T(u"dans le modele, la broche 1 de R1 porte le rang de SIG_A",
  lambda: egal(mdl_net_nom(modele_broches_r1()["1"]), "SIG_A",
               u"net de la broche 1"))

T(u"la broche 2 de R1 ressort sans net, plutot qu'avec un net invente",
  lambda: egal(modele_broches_r1().get("2"), None, u"net de la broche 2"))

T(u"le cuivre total est la somme des deux pistes (20 + 10 mm)",
  lambda: proche(MODELE["stats"]["longueur_cuivre"], 30.0,
                 u"longueur de cuivre", 0.01))

T(u"les statistiques comptent ce que la carte contient",
  lambda: egal([MODELE["stats"]["pistes"], MODELE["stats"]["percages"],
                MODELE["stats"]["composants"], MODELE["stats"]["empilage"]],
               [2, 1, 1, 3], u"statistiques"))

T(u"un percage metallise est compte comme tel",
  lambda: egal(MODELE["stats"]["percages_metallises"], 1,
               u"percages metallises"))

T(u"le contour ressort dans le modele",
  lambda: vrai(MODELE["contour"], u"le contour ne ressort pas dans le modele"))

T(u"l'empilage garde le Dk pour le calcul d'impedance de la page",
  lambda: egal([c["dk"] for c in MODELE["empilage"]], ["", "4.37", ""],
               u"Dk de l'empilage"))

T(u"le nom du fichier suit le modele, sans son chemin",
  lambda: egal(ipc2581_json.design_en_dict(
                   DESIGN, os.path.join("d", "carte.xml"))["fichier"],
               "carte.xml", u"nom du fichier"))


# -- Archives ZIP -------------------------------------------------------------
def zip_de(entrees):
    tampon = io.BytesIO()
    with zipfile.ZipFile(tampon, "w", zipfile.ZIP_DEFLATED) as arc:
        for nom, contenu in entrees:
            arc.writestr(nom, contenu)
    return tampon.getvalue()


T(u"une archive ZIP contenant la carte se lit comme la carte",
  lambda: egal(len(ipc2581_json.charger_octets(
                   zip_de([("carte.xml", OCTETS)]), "dossier.zip").components),
               1, u"composants lus depuis le ZIP"))


def zip_choisit_le_plus_gros():
    data = zip_de([("index.xml", b"<vide/>"), ("carte.xml", OCTETS)])
    design = ipc2581_json.charger_octets(data, "dossier.zip")
    egal(len(design.stackup), 3, u"empilage lu depuis le ZIP a deux fichiers")


T(u"dans une archive, c'est le plus gros IPC-2581 qui est pris",
  zip_choisit_le_plus_gros)


def zip_sans_ipc():
    try:
        ipc2581_json.charger_octets(zip_de([("lisez-moi.txt", b"rien ici")]),
                                    "dossier.zip")
    except IPC2581ParseError as exc:
        vrai("archive" in str(exc).lower(),
             u"le message ne parle pas de l'archive : %s" % exc)
    else:
        raise AssertionError(u"une archive sans IPC-2581 a ete acceptee")


T(u"une archive sans IPC-2581 est refusee en le disant", zip_sans_ipc)


# -- Refus : ce qui doit echouer, et proprement -------------------------------
def refus(data, quoi):
    try:
        ipc2581_json.charger_octets(data, quoi)
    except IPC2581ParseError:
        return
    except Exception as exc:                                  # noqa: BLE001
        raise AssertionError(u"%s : %s au lieu d'IPC2581ParseError"
                             % (quoi, type(exc).__name__))
    raise AssertionError(u"%s : accepte alors qu'il devrait etre refuse" % quoi)


T(u"un fichier vide est refuse", lambda: refus(b"", u"fichier vide"))
T(u"un XML mal forme est refuse",
  lambda: refus(b"<IPC-2581><oups>", u"XML tronque"))
T(u"un fichier qui n'est pas de l'XML est refuse",
  lambda: refus(b"ceci n'est pas un fichier IPC-2581", u"texte quelconque"))
T(u"une archive illisible est refusee",
  lambda: refus(b"PK\x03\x04 pas vraiment une archive", u"ZIP tronque"))


# -- Un XML valide mais vide de carte -----------------------------------------
def xml_sans_ecad():
    design = ipc2581_json.charger_octets(
        b'<?xml version="1.0"?><IPC-2581 xmlns="http://webstds.ipc.org/2581">'
        b'<Content roleRef="owner"/></IPC-2581>', "vide.xml")
    modele = ipc2581_json.design_en_dict(design, "vide.xml")
    egal(modele["stats"]["pistes"], 0, u"pistes d'un fichier sans <Ecad>")
    egal(modele["stats"]["empilage"], 0, u"empilage d'un fichier sans <Ecad>")


T(u"un IPC-2581 sans <Ecad> ressort vide plutot qu'en erreur", xml_sans_ecad)


# =============================================================================
print(u"-" * 62)
if ECHECS:
    print(u"%d cas, %d ECHEC(S)" % (len(CAS), len(ECHECS)))
    for titre, exc in ECHECS:
        print(u"  - %s : %s" % (titre, exc))
    sys.exit(1)
print(u"%d cas, tous passes" % len(CAS))
