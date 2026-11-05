// Exercice volontairement compact, sans erreur de syntaxe.
const ateliers=[{nom:"Jardin",places:8},{nom:"Web",places:12}];function placesDisponibles(liste){return liste.reduce((total,atelier)=>total+atelier.places,0)}document.querySelector("#exercise").textContent=`${placesDisponibles(ateliers)} places dans nos ateliers`;
