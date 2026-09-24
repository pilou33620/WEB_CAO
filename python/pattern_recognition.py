#!/usr/bin/python3
# -*- coding: utf-8 -*-
"""
Module de reconnaissance de motifs de circuits (Pattern Recognition) pour WEB_CAO.
Bibliothèque standard uniquement (math, re, collections, typing).

Reconnaît :
1. Régulateurs de tension linéaires (LDO, 78xx, LM317...) et à découpage (Buck/Boost + L).
2. Bus numériques (I2C avec résistances de pull-up, SPI, UART).
3. Oscillateurs (Quartz + 2 condensateurs de charge à la masse).
4. Filtres (RC passe-bas, filtres actifs).
5. Amplificateurs (AOP, amplis audio, transistors polarisés).
6. Inférence de courants typiques pour le solveur DC (point 4 de A-FAIRE.md).
"""

from collections import defaultdict
import re
from typing import Any, Dict, List, Optional, Tuple

# Expressions régulières pour les composants clés
_RE_REG_78XX = re.compile(r"(?:LM|MC|L)?78(?:05|08|09|12|15|24|33|L05|L12)\b", re.IGNORECASE)
_RE_REG_79XX = re.compile(r"(?:LM|MC|L)?79(?:05|12|15)\b", re.IGNORECASE)
_RE_REG_LDO = re.compile(r"(?:AMS1117|LM1117|LD1117|LP2985|MCP1700|TLV700|MIC5205|LP5907|TPS7\d{4})", re.IGNORECASE)
_RE_REG_ADJ = re.compile(r"(?:LM317|LM337|LM1086|LT1085)", re.IGNORECASE)

_RE_SWITCHER = re.compile(r"(?:LM2596|LM2576|TPS54\d{3}|MP1584|MP2307|XL4015|MC34063|MT3608)", re.IGNORECASE)

_RE_OPAMP = re.compile(r"(?:TL07[124]|TL08[124]|NE5532|LM358|LM324|OP07|MCP600[124]|OPA\d{3}|AD8\d{3})", re.IGNORECASE)
_RE_AUDIO_AMP = re.compile(r"(?:LM386|TDA2822|TDA7297|PAM8403|TPA3116)", re.IGNORECASE)

_RE_POWER_NET = re.compile(r"VCC|VDD|VBAT|3V3|3\.3V|5V|12V|\bPWR\b|AVCC|DVCC|\+V", re.IGNORECASE)
# « 0V » seul, pas le 0V de 10V / 20V : ces rails ne sont pas des masses
_RE_GROUND_NET = re.compile(r"GND|VSS|(?<![\d.])0V(?!\d)", re.IGNORECASE)
_RE_I2C_NET = re.compile(r"I2C|(?<![A-Z])(?:SDA|SCL)(?![A-Z])", re.IGNORECASE)
# Passifs dont la valeur peut porter une fréquence (ferrite 600R@100MHz...)
_RE_REF_PASSIF = re.compile(r"^(?:R|C|L|FB|D|TP)\d", re.IGNORECASE)


def _nets_masse(nets: Dict[str, List[Any]]) -> List[str]:
    """Noms des nets de masse présents dans le schéma."""
    return [n for n in nets if _RE_GROUND_NET.search(n)]


def _relie(pins: List[Any], ref: str) -> bool:
    return any(p.get("ref") == ref or p.get("component") == ref for p in pins)


def _valeur_en_ohms(val_str: str) -> Optional[float]:
    """Convertit une chaîne (ex: '4.7k', '100R', '10k', '330') en Ohms."""
    if not val_str:
        return None
    s = val_str.strip().upper().replace("OHM", "").replace("Ω", "").replace("R", ".")
    mult = 1.0
    if "K" in s:
        mult = 1e3
        s = s.replace("K", ".")
    elif "M" in s:
        mult = 1e6
        s = s.replace("M", ".")
    try:
        if s.endswith("."):
            s = s[:-1]
        return float(s) * mult
    except ValueError:
        return None


def _extraire_tension_ldo(val_str: str) -> Optional[float]:
    """Déduit la tension de sortie d'après la valeur (ex: AMS1117-3.3 -> 3.3).

    Ne lit que la VALEUR, jamais le repère : U5 ou U12 ne sont pas des tensions.
    """
    m = re.search(r"[-_ ](1\.8|2\.5|3\.3|5\.0|5|12|15)\b", val_str)
    if m:
        return float(m.group(1))
    return None


def _tension_78xx(val_str: str) -> Optional[float]:
    """Tension d'un 78xx / 79xx d'après ses deux derniers chiffres (7809 -> 9, 7912 -> -12)."""
    m = re.search(r"7([89])L?(\d{2})", val_str.upper())
    if not m:
        return None
    code = int(m.group(2))
    v = 3.3 if code == 33 else float(code)
    return -v if m.group(1) == "9" else v


def identifier_alimentations(
    components: Dict[str, Any],
    nets: Dict[str, List[Any]]
) -> List[Dict[str, Any]]:
    """Détecte les régulateurs linéaires et les alimentations à découpage."""
    resultats = []

    # 1. Régulateurs linéaires
    for ref, comp in components.items():
        val = str(comp.get("val") or comp.get("value") or "").strip()
        nom = (ref + " " + val).upper()

        type_reg = None
        v_out = None

        if _RE_REG_78XX.search(nom):
            type_reg = "linear_fixed_positive"
            v_out = _tension_78xx(val) or 5.0
        elif _RE_REG_79XX.search(nom):
            type_reg = "linear_fixed_negative"
            v_out = _tension_78xx(val) or -5.0
        elif _RE_REG_LDO.search(nom):
            type_reg = "ldo"
            v_out = _extraire_tension_ldo(val) or 3.3
        elif _RE_REG_ADJ.search(nom):
            type_reg = "linear_adjustable"
            v_out = None

        if type_reg:
            # Cherche les condensateurs et passifs voisins sur les mêmes nets
            comp_nets = []
            for n_name, pins in nets.items():
                if any(p.get("ref") == ref or p.get("component") == ref for p in pins):
                    comp_nets.append(n_name)

            cin_list = []
            cout_list = []
            associes = []

            for n_name in comp_nets:
                is_in_net = bool(re.search(r"IN|VCC|VBAT|RAW|VIN|12V|24V", n_name, re.IGNORECASE))
                is_out_net = bool(re.search(r"OUT|VOUT|3V3|3\.3V|5V|1V8|2V5", n_name, re.IGNORECASE))
                for p in nets.get(n_name, []):
                    c_ref = p.get("ref") or p.get("component") or ""
                    if c_ref and c_ref != ref:
                        if c_ref.startswith("C"):
                            if c_ref not in associes:
                                associes.append(c_ref)
                            if is_in_net and not is_out_net and c_ref not in cin_list:
                                cin_list.append(c_ref)
                            elif is_out_net and c_ref not in cout_list:
                                cout_list.append(c_ref)
                            elif c_ref in cin_list or c_ref in cout_list:
                                # Revu sur un net neutre (la masse) : déjà rangé
                                pass
                            elif not cin_list:
                                cin_list.append(c_ref)
                            elif c_ref not in cout_list:
                                cout_list.append(c_ref)
                        elif c_ref.startswith("R") and c_ref not in associes:
                            associes.append(c_ref)

            resultats.append({
                "id": f"alim_{ref.lower()}",
                "type": "power_supply",
                "subtype": type_reg,
                "label": f"Alimentation {val or ref}",
                "main_component": ref,
                "value": val,
                "output_voltage": v_out,
                "components": [ref] + associes,
                "role_map": {
                    "ic": ref,
                    "cin": cin_list,
                    "cout": cout_list,
                    "passives": [c for c in associes if c not in cin_list and c not in cout_list]
                },
                "layout_template": "ldo_inline",
                "nets": comp_nets,
                "suggested_netclass": "Alimentation",
                "sim_recommendation": "DC_DROP"
            })

    # 2. Hacheurs / Switching regulators (présence d'un contrôleur + inductance L sur le même net)
    for ref, comp in components.items():
        val = str(comp.get("val") or comp.get("value") or "").strip()
        nom = (ref + " " + val).upper()

        if _RE_SWITCHER.search(nom):
            # Cherche l'inductance connectée et les diodes / capas
            comp_nets = []
            inductors = []
            diodes = []
            cin_list = []
            cout_list = []
            feedback_res = []

            for n_name, pins in nets.items():
                has_ic = any(p.get("ref") == ref or p.get("component") == ref for p in pins)
                if has_ic:
                    comp_nets.append(n_name)
                    is_sw_net = bool(re.search(r"SW|LX|IND|COIL", n_name, re.IGNORECASE))
                    is_in_net = bool(re.search(r"IN|VIN|VCC|VBAT|RAW", n_name, re.IGNORECASE))
                    is_out_net = bool(re.search(r"OUT|VOUT|3V3|5V|FB", n_name, re.IGNORECASE))

                    for p in pins:
                        c_ref = p.get("ref") or p.get("component") or ""
                        if c_ref.startswith("L") and c_ref not in inductors:
                            inductors.append(c_ref)
                        elif c_ref.startswith("D") and c_ref not in diodes:
                            diodes.append(c_ref)
                        elif c_ref.startswith("C"):
                            if is_in_net and c_ref not in cin_list:
                                cin_list.append(c_ref)
                            elif is_out_net and c_ref not in cout_list:
                                cout_list.append(c_ref)
                        elif c_ref.startswith("R") and c_ref not in feedback_res:
                            feedback_res.append(c_ref)

            # Cherche aussi sur les nets de l'inductance pour trouver cout
            for ind_ref in inductors:
                for n_name, pins in nets.items():
                    if any(p.get("ref") == ind_ref or p.get("component") == ind_ref for p in pins):
                        if n_name not in comp_nets:
                            comp_nets.append(n_name)
                        for p in pins:
                            c_ref = p.get("ref") or p.get("component") or ""
                            if c_ref.startswith("C") and c_ref not in cin_list and c_ref not in cout_list:
                                cout_list.append(c_ref)

            associes = list(inductors) + list(diodes) + list(cin_list) + list(cout_list) + list(feedback_res)
            # Déduplication
            unique_comps = []
            for c in [ref] + associes:
                if c and c not in unique_comps:
                    unique_comps.append(c)

            resultats.append({
                "id": f"buck_{ref.lower()}",
                "type": "power_supply",
                "subtype": "switching_regulator",
                "label": f"Hacheur {val or ref}",
                "main_component": ref,
                "value": val,
                "components": unique_comps,
                "role_map": {
                    "ic": ref,
                    "sw_inductor": inductors[0] if inductors else None,
                    "inductors": inductors,
                    "diodes": diodes,
                    "cin": cin_list,
                    "cout": cout_list,
                    "feedback": feedback_res
                },
                "layout_template": "buck_compact",
                "nets": comp_nets,
                "suggested_netclass": "Alimentation",
                "sim_recommendation": "DC_DROP_AND_EM"
            })

    return resultats


def identifier_bus_numeriques(
    components: Dict[str, Any],
    nets: Dict[str, List[Any]]
) -> List[Dict[str, Any]]:
    """Détecte les bus I2C, SPI et liaisons série UART."""
    resultats = []

    # 1. Bus I2C : repérage par noms de nets ou résistances de pull-up vers VCC
    i2c_nets = []
    pullup_resistors = []

    for net_name in nets:
        # SCL mais pas SCLK : l'horloge SPI n'est pas un bus I2C
        if _RE_I2C_NET.search(net_name):
            i2c_nets.append(net_name)

    # Vérification des pull-up : résistance dont une patte est sur le net et l'autre sur VCC
    for r_ref, r_comp in components.items():
        if not r_ref.startswith("R"):
            continue
        r_nets = []
        for n_name, pins in nets.items():
            if any(p.get("ref") == r_ref or p.get("component") == r_ref for p in pins):
                r_nets.append(n_name)

        # Si l'une des pattes va sur une alim et l'autre sur une ligne signal
        if len(r_nets) == 2:
            a, b = r_nets[0], r_nets[1]
            if _RE_POWER_NET.search(a) and not _RE_GROUND_NET.search(b):
                if b in i2c_nets:
                    pullup_resistors.append(r_ref)
            elif _RE_POWER_NET.search(b) and not _RE_GROUND_NET.search(a):
                if a in i2c_nets:
                    pullup_resistors.append(r_ref)

    if i2c_nets:
        resultats.append({
            "id": "bus_i2c",
            "type": "digital_bus",
            "subtype": "i2c",
            "label": "Bus I2C",
            "nets": list(set(i2c_nets)),
            "components": list(set(pullup_resistors)),
            "suggested_netclass": "Rapide",
            "sim_recommendation": "CROSSTALK"
        })

    # 2. Bus SPI
    spi_nets = []
    for net_name in nets:
        nu = net_name.upper()
        if any(term in nu for term in ["MOSI", "MISO", "SCK", "SCLK", "SPI"]):
            spi_nets.append(net_name)

    if len(spi_nets) >= 2:
        resultats.append({
            "id": "bus_spi",
            "type": "digital_bus",
            "subtype": "spi",
            "label": "Bus SPI",
            "nets": spi_nets,
            "components": [],
            "suggested_netclass": "Rapide",
            "sim_recommendation": "CROSSTALK"
        })

    # 3. UART
    uart_nets = []
    for net_name in nets:
        nu = net_name.upper()
        if "TX" in nu or "RX" in nu or "UART" in nu:
            uart_nets.append(net_name)

    if len(uart_nets) >= 2:
        resultats.append({
            "id": "bus_uart",
            "type": "digital_bus",
            "subtype": "uart",
            "label": "Liaison UART (TX/RX)",
            "nets": uart_nets,
            "components": [],
            "suggested_netclass": "Signal",
            "sim_recommendation": None
        })

    return resultats


def identifier_oscillateurs(
    components: Dict[str, Any],
    nets: Dict[str, List[Any]]
) -> List[Dict[str, Any]]:
    """Détecte les quartz / résonateurs avec leurs deux condensateurs de charge."""
    resultats = []
    masses = _nets_masse(nets)

    for ref, comp in components.items():
        val = str(comp.get("val") or comp.get("value") or "").upper()
        type_c = str(comp.get("type") or "").lower()

        freq_dans_valeur = ("MHZ" in val or "KHZ" in val) and not _RE_REF_PASSIF.match(ref)
        is_crystal = ref.startswith("Y") or ref.startswith("X") or freq_dans_valeur or "crystal" in type_c
        if not is_crystal:
            continue

        # Trouve les deux nets du quartz
        q_nets = []
        for n_name, pins in nets.items():
            if any(p.get("ref") == ref or p.get("component") == ref for p in pins):
                q_nets.append(n_name)

        caps = []
        for n_name in q_nets:
            for p in nets.get(n_name, []):
                c_ref = p.get("ref") or p.get("component") or ""
                if c_ref.startswith("C"):
                    # Vérifie si l'autre côté va à la masse
                    for gnd_name in masses:
                        if _relie(nets.get(gnd_name, []), c_ref):
                            if c_ref not in caps:
                                caps.append(c_ref)

        resultats.append({
            "id": f"osc_{ref.lower()}",
            "type": "oscillator",
            "subtype": "crystal",
            "label": f"Oscillateur {val or ref}",
            "main_component": ref,
            "value": val,
            "components": [ref] + caps,
            "role_map": {
                "crystal": ref,
                "c_load_1": caps[0] if len(caps) > 0 else None,
                "c_load_2": caps[1] if len(caps) > 1 else None,
                "c_loads": caps
            },
            "layout_template": "crystal_symmetric",
            "nets": q_nets,
            "suggested_netclass": "Rapide",
            "sim_recommendation": "CROSSTALK_AND_LENGTH"
        })

    return resultats


def identifier_filtres(
    components: Dict[str, Any],
    nets: Dict[str, List[Any]]
) -> List[Dict[str, Any]]:
    """Détecte les filtres RC passe-bas (R série + C à la masse)."""
    resultats = []
    masses = _nets_masse(nets)

    for r_ref in [r for r in components if r.startswith("R")]:
        r_nets = []
        for n_name, pins in nets.items():
            if any(p.get("ref") == r_ref or p.get("component") == r_ref for p in pins):
                r_nets.append(n_name)

        if len(r_nets) != 2:
            continue

        for n_name in r_nets:
            if _RE_POWER_NET.search(n_name) or _RE_GROUND_NET.search(n_name):
                continue
            for p in nets.get(n_name, []):
                c_ref = p.get("ref") or p.get("component") or ""
                if c_ref.startswith("C"):
                    # Capa reliée à GND ?
                    has_gnd = False
                    for gnd_net in masses:
                        if _relie(nets.get(gnd_net, []), c_ref):
                            has_gnd = True
                            break
                    if has_gnd:
                        resultats.append({
                            "id": f"flt_{r_ref.lower()}_{c_ref.lower()}",
                            "type": "filter",
                            "subtype": "rc_lowpass",
                            "label": f"Filtre RC ({r_ref}+{c_ref})",
                            "components": [r_ref, c_ref],
                            "role_map": {
                                "r_series": r_ref,
                                "c_shunt": c_ref
                            },
                            "layout_template": "filter_inline",
                            "nets": [n_name],
                            "suggested_netclass": "Analogique",
                            "sim_recommendation": None
                        })

    return resultats


def _est_led(ref: str, comp: Dict[str, Any]) -> bool:
    val = str(comp.get("val") or comp.get("value") or "").upper()
    type_c = str(comp.get("type") or "").lower()
    return "led" in type_c or ref.upper().startswith("LED") or "LED" in val


def estimer_courants_dc(
    patterns: List[Dict[str, Any]],
    components: Dict[str, Any],
    nets: Optional[Dict[str, List[Any]]] = None
) -> List[Dict[str, Any]]:
    """Estime les courants DC consommés pour alimenter le solveur DC (A-FAIRE.md).

    Avec `nets`, une résistance n'est comptée comme limitation de LED que si
    elle partage un net avec une LED : un filtre RC de 1 kΩ n'en est pas une.
    Sans `nets`, l'heuristique d'origine (toute R de 100 Ω à 4,7 kΩ) s'applique.
    """
    courants = []
    refs_led = {r for r, c in components.items() if _est_led(r, c)}

    # 1. Courants déduits des régulateurs
    for pat in patterns:
        if pat.get("type") == "power_supply":
            v_out = pat.get("output_voltage")
            ref = pat.get("main_component", "")
            # Consommation de repos estimée
            i_quiescent_ma = 10.0 if pat.get("subtype") == "ldo" else 25.0
            courants.append({
                "source": ref,
                "composant": ref,
                "net": pat["nets"][0] if pat.get("nets") else "VCC",
                "courant_ma": i_quiescent_ma,
                "role": "source",
                "type": "repos_regulateur",
                "tension_v": v_out
            })

    # 2. Détection de LEDs avec résistance de limitation
    for r_ref, r_comp in components.items():
        if not r_ref.startswith("R"):
            continue
        val = str(r_comp.get("val") or r_comp.get("value") or "")
        ohms = _valeur_en_ohms(val)
        if nets is not None:
            voisins = {
                p.get("ref") or p.get("component")
                for pins in nets.values() if _relie(pins, r_ref)
                for p in pins
            }
            if not voisins & refs_led:
                continue
        if ohms and 100 <= ohms <= 4700:
            # Courant LED typique pour V_rail = 3.3V ou 5V
            i_led_ma = round(((3.3 - 2.0) / ohms) * 1000, 1)
            if i_led_ma > 0.5:
                courants.append({
                    "source": r_ref,
                    "composant": r_ref,
                    "net": "LED",
                    "courant_ma": i_led_ma,
                    "role": "charge",
                    "type": "consommation_led"
                })

    # 3. Consommation estimée pour les circuits intégrés et microcontrôleurs
    for ref, comp in components.items():
        type_c = str(comp.get("type") or "").lower()
        val = str(comp.get("val") or comp.get("value") or "").upper()
        if ref.startswith("U") or type_c == "ic" or any(k in val for k in ["MCU", "STM32", "ESP", "ATMEGA", "PIC"]):
            if any(c.get("composant") == ref for c in courants):
                continue
            i_ic = 50.0 if any(k in val for k in ["STM32", "MCU", "ESP", "ATMEGA", "PIC", "CORTEX"]) else 30.0
            courants.append({
                "source": ref,
                "composant": ref,
                "net": "VDD",
                "courant_ma": i_ic,
                "role": "charge",
                "type": "consommation_ic"
            })

    return courants


def analyser_motifs_schema(data: Dict[str, Any]) -> Dict[str, Any]:
    """Point d'entrée principal pour analyser un schéma.

    Args:
        data: Dict contenant "components", "nets" et facultativement "zones".

    Returns:
        Dict avec la liste complète des motifs, suggestions de classes, courants et zones.
    """
    components = data.get("components", {})
    nets = data.get("nets", {})
    zones_brutes = data.get("zones") or data.get("rooms") or []

    alims = identifier_alimentations(components, nets)
    bus = identifier_bus_numeriques(components, nets)
    oscs = identifier_oscillateurs(components, nets)
    filtres = identifier_filtres(components, nets)

    motifs_auto = alims + bus + oscs + filtres
    courants = estimer_courants_dc(alims, components, nets)

    # Intégration des zones schématiques définies par l'utilisateur
    zones_motifs = []
    zones_export = []
    for i, z in enumerate(zones_brutes):
        if not isinstance(z, dict):
            continue
        z_id = z.get("id") or f"zone_{i+1}"
        z_nom = z.get("name") or z.get("nom") or f"Zone {i+1}"
        z_cat = (z.get("category") or z.get("categorie") or "general").lower()
        z_col = z.get("color") or z.get("couleur") or "#3fa0ea"
        z_comps = z.get("components") or z.get("composants") or []
        if not isinstance(z_comps, list):
            z_comps = []

        # Tente d'associer un gabarit selon la catégorie de zone
        template = "cluster_free"
        if "alim" in z_cat or "power" in z_cat or "buck" in z_cat:
            template = "buck_compact" if any(c.startswith("L") for c in z_comps) else "ldo_inline"
        elif "mcu" in z_cat or "micro" in z_cat or "numerique" in z_cat:
            template = "mcu_decoupling"
        elif "osc" in z_cat or "clock" in z_cat or "quartz" in z_cat:
            template = "crystal_symmetric"
        elif "filt" in z_cat:
            template = "filter_inline"

        # Tente d'identifier le composant ancre dans la zone
        anchor = None
        for c in z_comps:
            if c.startswith("U") or c.startswith("IC") or c.startswith("Y"):
                anchor = c
                break
        if not anchor and z_comps:
            anchor = z_comps[0]

        zone_obj = {
            "id": z_id,
            "type": "schematic_zone",
            "subtype": z_cat,
            "label": f"Zone: {z_nom}",
            "zone_name": z_nom,
            "category": z_cat,
            "color": z_col,
            "main_component": anchor,
            "components": z_comps,
            "is_user_zone": True,
            "layout_template": template
        }
        zones_motifs.append(zone_obj)
        zones_export.append({
            "id": z_id,
            "nom": z_nom,
            "categorie": z_cat,
            "couleur": z_col,
            "composants": z_comps,
            "ancre": anchor
        })

    tous_motifs = zones_motifs + motifs_auto

    # Dictionnaire des classes de nets suggérées
    suggestions_netclasses = {}
    for pat in tous_motifs:
        nclass = pat.get("suggested_netclass")
        if nclass:
            for net in pat.get("nets", []):
                suggestions_netclasses[net] = nclass

    return {
        "succes": True,
        "total_motifs": len(tous_motifs),
        "motifs": tous_motifs,
        "zones": zones_export,
        "classes_suggerees": suggestions_netclasses,
        "courants_dc_estimes": courants
    }
