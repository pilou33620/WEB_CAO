"use strict";
/* =============================================================================
   commun/echappe.js
   Échappement HTML d'un texte avant innerHTML ou un attribut entre guillemets,
   pour toutes les pages de WEB_CAO. Chargé en premier par chacune d'elles.
   null et undefined donnent une chaîne vide ; un nombre s'écrit (0 compris).
   ============================================================================= */
const ESC_HTML={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;","`":"&#96;"};
function esc(s){
  return s==null?"":String(s).replace(/[&<>"'`]/g,ch=>ESC_HTML[ch]);
}
