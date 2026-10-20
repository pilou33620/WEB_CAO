/* Ajouté par les bancs (éditeur PCB, visionneuse) DANS la portée des fichiers
   évalués : remplace le temps d'un appel à simZTrace les trois peintres par des
   relevés, pour vérifier que chacun voit l'état (SIM.objets) de SON lot. Deux
   lots : peints après simPourChaqueLot, le lot 1 se peignait deux fois. */
function essaiLotsZTrace(){
  const garde={a:simCarteActive,t:simZTraceLot,v:simZValeurs,n:simZNumeroLot,
               lots:SIM.lots,res:SIM.res,obj:SIM.objets,ouvert:SIM.ouvert};
  const vu=[];
  const releve=quoi=>function(){
    const lot=[].slice.call(arguments).find(x=>x&&x.objets);
    vu.push(quoi+" "+(lot?lot.rang:"?")+(lot&&SIM.objets===lot.objets?"":" (état d'un autre lot)"));
    return [];
  };
  try{
    simCarteActive=()=>true;
    simZTraceLot=releve("cuivre"); simZValeurs=releve("valeurs"); simZNumeroLot=releve("numéro");
    const o1=[{}], o2=[{}];
    SIM.lots=[{rang:1,res:{segments:[{}]},objets:o1},{rang:2,res:{segments:[{}]},objets:o2}];
    SIM.res=SIM.lots[0].res; SIM.objets=o1;
    simZTrace({},1);
  }finally{
    simCarteActive=garde.a; simZTraceLot=garde.t; simZValeurs=garde.v; simZNumeroLot=garde.n;
    SIM.lots=garde.lots; SIM.res=garde.res; SIM.objets=garde.obj; SIM.ouvert=garde.ouvert;
  }
  return vu;
}
