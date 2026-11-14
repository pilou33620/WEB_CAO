
// ouvert par double-clic, hors ligne : les fichiers du dépôt sont juste à côté
if(location.protocol==='file:')[].forEach.call(document.querySelectorAll('a[data-local]'),function(a){a.href=a.getAttribute('data-local');});
(function(){
 var q=document.getElementById('q'),secs=[].slice.call(document.querySelectorAll('main section')),
     liens=[].slice.call(document.querySelectorAll('nav a[data-s]')),vide=document.getElementById('vide');
 function norme(s){return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');}
 secs.forEach(function(s){s._t=norme(s.textContent);});
 q.addEventListener('input',function(){
  var mots=norme(q.value).split(/\s+/).filter(Boolean),reste=0;
  secs.forEach(function(s){var ok=mots.every(function(m){return s._t.indexOf(m)>=0;});
   s.classList.toggle('cache',!ok);if(ok)reste++;});
  liens.forEach(function(a){var s=document.getElementById(a.dataset.s);a.classList.toggle('cache',s.classList.contains('cache'));});
  vide.style.display=reste?'none':'block';
 });
})();
