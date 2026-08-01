(function () {
  "use strict";

  var DB_NAME = "meausa-road-trip-v6";
  var DB_VERSION = 1;
  var TRIP_KEY = "active-trip";
  var LEGACY_KEY = "meausa-cinematic-v5-1";
  var MIGRATION_KEY = "meausa-v6-migration-complete";
  var DATE_FORMAT = new Intl.DateTimeFormat("fr-FR", { weekday:"long", day:"2-digit", month:"long", year:"numeric" });
  var defaultTrip = {
    id:"active-trip", title:"Dallas → Utah", subtitle:"Road trip USA · Août 2026",
    start:"2026-08-17", end:"2026-08-31", archived:false, createdAt:"2026-08-17T08:00:00.000Z",
    stages:[
      { id:"dallas", name:"Dallas", location:"Dallas Fort Worth International Airport, Texas", date:"2026-08-18",
        story:"Arrivée au Texas. Récupération de la voiture et premiers plans du reportage.",
        lat:32.8998, lng:-97.0403, cover:{kind:"asset",url:"./travel/dallas.webp"}, done:false, docs:[], createdAt:"2026-08-18T08:00:00.000Z" },
      { id:"santafe", name:"Santa Fe", location:"Santa Fe, New Mexico", date:"2026-08-19",
        story:"Premiers kilomètres vers l’Ouest. Les paysages changent et l’aventure commence vraiment.",
        lat:35.687, lng:-105.9378, cover:{kind:"asset",url:"./travel/monument-valley.webp"}, done:false, docs:[], createdAt:"2026-08-19T08:00:00.000Z" },
      { id:"moab", name:"Moab", location:"Moab, Utah", date:"2026-08-20",
        story:"Roches rouges, route panoramique et séquences cinématographiques avant Snow College.",
        lat:38.5733, lng:-109.5498, cover:{kind:"asset",url:"./travel/moab.webp"}, done:false, docs:[], createdAt:"2026-08-20T08:00:00.000Z" }
    ]
  };
  var state = { trip:null, view:"voyage", sheet:null, selectedStageId:null, publicMode:false, toastTimer:null, maps:[], mapToken:0, db:null, objectUrls:new Map() };
  var app = document.getElementById("app");

  function clone(value){ return JSON.parse(JSON.stringify(value)); }
  function uid(prefix){ return (prefix||"id")+"-"+Math.random().toString(36).slice(2,9)+Date.now().toString(36); }
  function esc(value){ return String(value==null?"":value).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;"); }
  function attr(value){ return esc(value).split(String.fromCharCode(96)).join("&#096;"); }
  function formatDate(value){
    if(!value) return "Date à préciser";
    var date=new Date(value+"T12:00:00");
    if(Number.isNaN(date.getTime())) return value;
    var result=DATE_FORMAT.format(date);
    return result.charAt(0).toUpperCase()+result.slice(1);
  }
  function formatBytes(bytes){
    if(!bytes) return "0 Ko";
    var units=["o","Ko","Mo","Go"], index=Math.min(Math.floor(Math.log(bytes)/Math.log(1024)),units.length-1), number=bytes/Math.pow(1024,index);
    return number.toFixed(index===0||number>=10?0:1).replace(".",",")+" "+units[index];
  }
  function stages(){ return (state.trip&&state.trip.stages?state.trip.stages:[]).slice().sort(function(a,b){ return String(a.date||"").localeCompare(String(b.date||""))||String(a.createdAt||"").localeCompare(String(b.createdAt||"")); }); }
  function selected(){ return state.trip?state.trip.stages.find(function(item){return item.id===state.selectedStageId;})||null:null; }
  function findDoc(fileId){
    var found=null;
    if(!state.trip) return null;
    state.trip.stages.some(function(stage){ found=(stage.docs||[]).find(function(doc){return doc.id===fileId;})||null; return !!found; });
    return found;
  }
  function icon(name){
    var all={
      menu:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14M5 16h14"/></svg>',
      book:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11a2 2 0 0 1 2 2v16a2 2 0 0 0-2-2H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H13v18a2 2 0 0 1 2-2h2.5a2.5 2.5 0 0 1 2.5 2.5z"/></svg>',
      map:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 6 5-3 8 3 5-3v15l-5 3-8-3-5 3z"/><path d="M8 3v15M16 6v15"/></svg>',
      plus:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
      file:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5"/></svg>',
      archive:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16v14H4zM3 3h18v4H3z"/><path d="M9 11h6"/></svg>',
      pin:'<svg class="inline-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0z"/><circle cx="12" cy="10" r="2.5"/></svg>',
      download:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5M4 21h16"/></svg>',
      trash:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6"/></svg>',
      close:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>',
      arrow:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M14 7l5 5-5 5"/></svg>',
      eye:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z"/><circle cx="12" cy="12" r="2.5"/></svg>'
    };
    return all[name]||"";
  }
  function header(){
    return '<header class="topbar"><div class="brand-mark">M</div><div class="brand-copy"><small>MON ENFANT AUX USA</small><strong>ROAD TRIP</strong></div>'+
      '<button class="icon-button" data-action="open-menu" aria-label="Ouvrir le menu">'+icon("menu")+'</button></header>';
  }
  function navButton(view,label,name,extra){
    return '<button class="nav-button'+(state.view===view?" active":"")+(extra?" "+extra:"")+'" data-action="navigate" data-view="'+view+'">'+icon(name)+'<span>'+label+'</span></button>';
  }
  function nav(){
    return '<nav class="bottom-nav" aria-label="Navigation principale">'+navButton("voyage","Voyage","book")+navButton("carte","Carte","map")+
      '<button class="nav-button add-tab" data-action="add-stage">'+icon("plus")+'<span>Ajouter</span></button>'+
      navButton("documents","Documents","file")+navButton("archives","Réalisés","archive")+'</nav>';
  }
  function mapBlock(id,large){
    var list=stages(), done=list.filter(function(x){return x.done;}).length, progress=list.length?Math.round(done/list.length*100):0;
    return '<div class="map-card'+(large?" large":"")+'"><div class="leaf-map" id="'+id+'"></div><div class="map-summary"><div><strong>'+list.length+
      ' étape'+(list.length>1?"s":"")+'</strong><small>Parcours dans l’ordre des dates</small></div><div class="map-progress" style="--progress:'+progress+
      '%"><span>'+progress+'%</span></div></div></div>';
  }
  function cover(stage,index){
    var c=stage.cover||null, image;
    if(c&&c.kind==="asset"&&c.url) image='<img class="post-image" src="'+attr(c.url)+'" alt="'+attr("Photo de "+stage.name)+'" loading="'+(index===0?"eager":"lazy")+'">';
    else if(c&&c.kind==="stored"&&c.id) image='<img class="post-image" data-file-cover="'+attr(c.id)+'" alt="'+attr("Photo de "+stage.name)+'">';
    else image='<div class="post-image" style="display:grid;place-items:center;background:linear-gradient(145deg,#d9e5e1,#f2e6d6);color:#6c7b80">'+icon("map")+'</div>';
    return '<div class="post-image-wrap">'+image+'<span class="post-number">Étape '+(index+1)+'</span></div>';
  }
  function stageCard(stage,index){
    var count=(stage.docs||[]).length;
    var controls=state.publicMode?"":'<footer class="post-footer"><button data-action="edit-stage" data-stage-id="'+attr(stage.id)+'">Modifier</button>'+
      '<button data-action="open-stage-docs" data-stage-id="'+attr(stage.id)+'">'+count+' document'+(count>1?"s":"")+'</button>'+
      '<button class="done-button'+(stage.done?" is-done":"")+'" data-action="toggle-done" data-stage-id="'+attr(stage.id)+'">'+(stage.done?"✓ Réalisée":"Marquer réalisée")+'</button></footer>';
    return '<article class="post-card" id="stage-'+attr(stage.id)+'">'+cover(stage,index)+'<div class="post-body"><span class="place-line">'+icon("pin")+esc(stage.name)+
      ' · '+esc(stage.location)+'</span><time class="post-date" datetime="'+attr(stage.date||"")+'">'+esc(formatDate(stage.date))+'</time><h3 class="post-title">'+
      esc(stage.name)+'</h3><p class="post-story">'+esc(stage.story||"Une nouvelle étape du voyage.")+'</p>'+controls+'</div></article>';
  }
  function voyage(){
    var cards=stages().map(stageCard).join("");
    if(!cards) cards='<div class="empty-state"><b>Ton histoire commence ici.</b><p>Ajoute la première étape, une photo et les documents de réservation.</p><button class="primary-button" data-action="add-stage">Créer la première étape</button></div>';
    return '<main class="view"><section class="hero"><p class="eyebrow">Carnet en cours</p><h1 class="hero-title">'+esc(state.trip.title)+'</h1><p class="hero-subtitle">'+
      esc(state.trip.subtitle||"")+'</p></section>'+mapBlock("main-map",false)+'<section class="section"><div class="section-head"><h2 class="section-title"><span>•</span> Carnet de route</h2>'+
      '<button class="chip-button" data-action="toggle-public">'+(state.publicMode?"Quitter l’aperçu":"Aperçu public")+'</button></div><div class="timeline">'+cards+
      '</div></section></main>'+(state.publicMode?"":'<button class="floating-add" data-action="add-stage" aria-label="Ajouter une étape">+</button>');
  }
  function carte(){
    var rows=stages().map(function(stage,index){return '<button class="route-item'+(stage.done?" done":"")+'" data-action="go-to-stage" data-stage-id="'+attr(stage.id)+'"><b>'+
      (index+1)+'</b><span><strong>'+esc(stage.name)+'</strong><small>'+esc(stage.location)+'</small></span>'+icon("arrow")+'</button>';}).join("");
    return '<main class="view"><section class="page-head"><p class="eyebrow">Parcours</p><h1 class="page-title">'+esc(state.trip.title)+
      '</h1><p class="page-intro">La carte suit les étapes dans l’ordre chronologique. Le départ est fixé à Dallas.</p></section>'+mapBlock("route-map",true)+'<div class="route-list">'+rows+'</div></main>';
  }
  function docLabel(doc){
    var type=String(doc.type||"").toLowerCase();
    if(type.indexOf("pdf")>=0) return "PDF";
    if(type.indexOf("image")===0) return "IMG";
    if(type.indexOf("word")>=0||/\.docx?$/i.test(doc.name||"")) return "DOC";
    return "FICH";
  }
  function docRow(doc){
    var preview=String(doc.type||"").indexOf("image/")===0?'<img data-doc-thumb="'+attr(doc.id)+'" alt="">':esc(docLabel(doc));
    return '<div class="doc-row"><button class="doc-preview-button" data-action="open-file" data-file-id="'+attr(doc.id)+'"><span class="doc-icon">'+preview+
      '</span><span class="doc-copy"><strong>'+esc(doc.name)+'</strong><small>'+esc(docLabel(doc)+" · "+formatBytes(doc.size))+'</small></span></button><span class="doc-actions">'+
      '<button class="tiny-button" data-action="download-file" data-file-id="'+attr(doc.id)+'" aria-label="Télécharger">'+icon("download")+'</button>'+
      '<button class="tiny-button danger" data-action="delete-file" data-file-id="'+attr(doc.id)+'" aria-label="Supprimer">'+icon("trash")+'</button></span></div>';
  }
  function documents(){
    var groups=stages().map(function(stage){
      var rows=(stage.docs||[]).map(docRow).join("")||'<p class="no-docs">Aucun document pour cette étape.</p>';
      return '<section class="doc-group"><div class="doc-group-head"><h2>'+esc(stage.name)+'</h2><button data-action="open-stage-docs" data-stage-id="'+attr(stage.id)+'">+ Ajouter</button></div><div class="doc-list">'+rows+'</div></section>';
    }).join("")||'<div class="empty-state"><b>Aucune étape</b><p>Crée une étape avant d’ajouter une réservation.</p></div>';
    return '<main class="view"><section class="page-head"><p class="eyebrow">Coffre de voyage</p><h1 class="page-title">Documents</h1>'+
      '<p class="page-intro">Billets, hôtels, location de voiture et réservations restent visibles dans l’étape correspondante.</p></section><div class="document-groups">'+groups+'</div></main>';
  }
  function archives(){
    var content=state.trip.archived?'<article class="archive-card"><span class="status-pill">Voyage terminé</span><h2>'+esc(state.trip.title)+'</h2><p>'+stages().length+
      ' étapes conservées. Le carnet reste consultable avec toutes ses photos et ses documents.</p></article>':
      '<div class="empty-state"><b>Aucun voyage archivé</b><p>Lorsque le road trip sera terminé, tu pourras le conserver ici comme un album.</p><button class="primary-button" data-action="archive-trip">Terminer ce voyage</button></div>';
    return '<main class="view"><section class="page-head"><p class="eyebrow">Souvenirs</p><h1 class="page-title">Voyages réalisés</h1><p class="page-intro">Tes anciens carnets sont conservés avec leurs étapes.</p></section><div class="archive-list">'+content+'</div></main>';
  }
  function stageSheet(){
    var stage=selected(), c=stage&&stage.cover, preview=c&&c.kind==="asset"?'<img class="image-preview visible" id="stage-photo-preview" src="'+attr(c.url)+'" alt="Aperçu">':
      c&&c.kind==="stored"?'<img class="image-preview visible" id="stage-photo-preview" data-file-cover="'+attr(c.id)+'" alt="Aperçu">':'<img class="image-preview" id="stage-photo-preview" alt="Aperçu">';
    var extra=stage?'<button class="secondary-button form-danger" data-action="open-stage-docs" data-stage-id="'+attr(stage.id)+'">Gérer les documents de cette étape</button>'+
      '<button class="danger-button form-danger" data-action="delete-stage" data-stage-id="'+attr(stage.id)+'">Supprimer cette étape</button>':"";
    return '<div class="overlay" data-action="overlay-close"><section class="sheet" role="dialog" aria-modal="true"><div class="sheet-handle"></div><h2 class="sheet-title">'+
      (stage?"Modifier l’étape":"Nouvelle étape")+'</h2><p class="sheet-intro">Chaque étape devient une publication complète dans le carnet de route.</p>'+
      '<form id="stage-form" class="form-grid"><label class="field"><span>Nom de l’étape</span><input name="name" required placeholder="Ex. Snow College" value="'+attr(stage?stage.name:"")+'"></label>'+
      '<label class="field"><span>Adresse pour la carte</span><input name="location" required placeholder="Ex. Ephraim, Utah" value="'+attr(stage?stage.location:"")+'"><p class="field-hint">La position est calculée automatiquement.</p></label>'+
      '<label class="field"><span>Date</span><input type="date" name="date" value="'+attr(stage?stage.date:"")+'"></label>'+
      '<label class="field"><span>Photo principale</span><span class="file-pick">＋ Choisir une photo depuis l’iPhone<input type="file" name="photo" accept="image/*"></span>'+preview+'</label>'+
      '<label class="field"><span>Récit</span><textarea name="story" placeholder="Raconte ce moment…">'+esc(stage?stage.story:"")+'</textarea></label>'+
      '<div class="form-actions"><button class="secondary-button" type="button" data-action="close-sheet">Annuler</button><button class="primary-button" type="submit">'+(stage?"Enregistrer":"Publier l’étape")+'</button></div></form>'+extra+'</section></div>';
  }
  function docsSheet(){
    var stage=selected(); if(!stage) return "";
    var rows=(stage.docs||[]).map(docRow).join("")||'<p class="no-docs">Aucun fichier pour le moment.</p>';
    return '<div class="overlay" data-action="overlay-close"><section class="sheet" role="dialog" aria-modal="true"><div class="sheet-handle"></div><h2 class="sheet-title">Documents</h2><p class="sheet-intro">'+esc(stage.name)+
      ' · Ajoute les réservations et pièces utiles à cette étape.</p><label class="upload-zone">＋ Ajouter PDF, photo ou réservation<input id="document-upload" type="file" multiple accept="image/*,.pdf,.doc,.docx,.pages,.numbers,.txt">'+
      '<span class="upload-note">Jusqu’à 40 Mo par fichier · conservé sur cet appareil</span></label><p class="upload-progress" id="upload-progress" hidden></p><div class="doc-list" style="margin-top:14px">'+rows+
      '</div><button class="secondary-button form-danger" data-action="close-sheet">Fermer</button></section></div>';
  }
  function menuSheet(){
    return '<div class="overlay" data-action="overlay-close"><section class="sheet" role="dialog" aria-modal="true"><div class="sheet-handle"></div><h2 class="sheet-title">Le voyage</h2>'+
      '<p class="sheet-intro">Les photos et documents sont enregistrés dans l’application sur cet appareil.</p><div class="menu-list">'+
      '<button data-action="toggle-public"><span>'+icon("eye")+' Aperçu public</span><b>›</b></button><button data-action="export-backup"><span>Exporter une sauvegarde complète</span><b>↓</b></button>'+
      '<button data-action="trigger-import"><span>Importer une sauvegarde</span><b>↑</b></button><button data-action="archive-trip"><span>Terminer et archiver le voyage</span><b>✓</b></button>'+
      '<button class="danger-link" data-action="reset-trip"><span>Recommencer un nouveau road trip</span><b>↻</b></button></div><input id="backup-import" type="file" accept="application/json,.json" hidden>'+
      '<button class="secondary-button form-danger" data-action="close-sheet">Fermer</button></section></div>';
  }
  function viewerSheet(){
    var meta=findDoc(state.sheet&&state.sheet.fileId); if(!meta) return "";
    var type=String(meta.type||""), content=type.indexOf("image/")===0?'<img data-viewer-file="'+attr(meta.id)+'" alt="'+attr(meta.name)+'">':
      type.indexOf("pdf")>=0?'<iframe data-viewer-file="'+attr(meta.id)+'" title="'+attr(meta.name)+'"></iframe>':
      '<div class="viewer-unknown"><strong>'+esc(meta.name)+'</strong><span>Utilise le bouton de téléchargement pour ouvrir ce type de fichier.</span></div>';
    return '<div class="overlay" data-action="overlay-close"><section class="viewer" role="dialog" aria-modal="true"><header class="viewer-head"><strong>'+esc(meta.name)+'</strong>'+
      '<button class="tiny-button" data-action="download-file" data-file-id="'+attr(meta.id)+'">'+icon("download")+'</button><button class="tiny-button" data-action="close-sheet">'+icon("close")+
      '</button></header><div class="viewer-content">'+content+'</div></section></div>';
  }
  function sheet(){
    if(!state.sheet) return "";
    if(state.sheet.type==="stage") return stageSheet();
    if(state.sheet.type==="docs") return docsSheet();
    if(state.sheet.type==="menu") return menuSheet();
    if(state.sheet.type==="viewer") return viewerSheet();
    return "";
  }
  function destroyMaps(){
    state.mapToken+=1;
    state.maps.forEach(function(map){try{map.remove();}catch(error){}});
    state.maps=[];
  }
  function render(){
    if(!state.trip) return;
    destroyMaps();
    var content=state.view==="carte"?carte():state.view==="documents"?documents():state.view==="archives"?archives():voyage();
    app.innerHTML='<div class="app-shell">'+header()+content+nav()+sheet()+'</div>';
    hydrateImages(); hydrateViewer();
    setTimeout(function(){if(state.view==="voyage") initMap("main-map"); if(state.view==="carte") initMap("route-map");},30);
  }
  function toast(message,error){
    var old=document.querySelector(".toast"); if(old) old.remove();
    if(state.toastTimer) clearTimeout(state.toastTimer);
    var el=document.createElement("div"); el.className="toast"+(error?" error":""); el.textContent=message; document.body.appendChild(el);
    state.toastTimer=setTimeout(function(){el.remove();},3200);
  }

  function openDb(){
    return new Promise(function(resolve,reject){
      var request=indexedDB.open(DB_NAME,DB_VERSION);
      request.onupgradeneeded=function(){var db=request.result;if(!db.objectStoreNames.contains("settings"))db.createObjectStore("settings");if(!db.objectStoreNames.contains("files"))db.createObjectStore("files",{keyPath:"id"});};
      request.onsuccess=function(){resolve(request.result);};request.onerror=function(){reject(request.error);};
    });
  }
  function idbGet(store,key){return new Promise(function(resolve,reject){var tx=state.db.transaction(store,"readonly"),req=tx.objectStore(store).get(key);req.onsuccess=function(){resolve(req.result);};req.onerror=function(){reject(req.error);};});}
  function idbPut(store,value,key){return new Promise(function(resolve,reject){var tx=state.db.transaction(store,"readwrite"),target=tx.objectStore(store);if(key===undefined)target.put(value);else target.put(value,key);tx.oncomplete=function(){resolve(value);};tx.onerror=function(){reject(tx.error);};});}
  function idbDelete(store,key){return new Promise(function(resolve,reject){var tx=state.db.transaction(store,"readwrite");tx.objectStore(store).delete(key);tx.oncomplete=resolve;tx.onerror=function(){reject(tx.error);};});}
  function idbClear(store){return new Promise(function(resolve,reject){var tx=state.db.transaction(store,"readwrite");tx.objectStore(store).clear();tx.oncomplete=resolve;tx.onerror=function(){reject(tx.error);};});}
  function idbAll(store){return new Promise(function(resolve,reject){var tx=state.db.transaction(store,"readonly"),req=tx.objectStore(store).getAll();req.onsuccess=function(){resolve(req.result||[]);};req.onerror=function(){reject(req.error);};});}
  function saveTrip(){return idbPut("settings",clone(state.trip),TRIP_KEY);}
  function putFile(blob,name,type,forcedId){
    var record={id:forcedId||uid("file"),blob:blob,name:name||"fichier",type:type||blob.type||"application/octet-stream",size:blob.size||0,createdAt:new Date().toISOString()};
    return idbPut("files",record).then(function(){return record;});
  }
  function dataUrlBlob(data){return fetch(data).then(function(response){return response.blob();});}
  function assetUrl(url){var value=String(url||"");if(/dallas\.png$/i.test(value))return"./travel/dallas.webp";if(/monument-valley\.png$/i.test(value))return"./travel/monument-valley.webp";if(/moab\.png$/i.test(value))return"./travel/moab.webp";return value;}
  function normalize(input){
    var trip=Object.assign(clone(defaultTrip),input||{});
    trip.stages=Array.isArray(input&&input.stages)?input.stages.map(function(raw,index){
      var item=Object.assign({id:uid("stage"),name:"Étape "+(index+1),location:"",date:"",story:"",lat:null,lng:null,cover:null,done:false,docs:[],createdAt:new Date().toISOString()},raw||{});
      if(!item.cover&&typeof item.photo==="string"&&item.photo&&item.photo.indexOf("data:")!==0)item.cover={kind:"asset",url:assetUrl(item.photo)};
      if(item.cover&&item.cover.kind==="asset")item.cover.url=assetUrl(item.cover.url);
      item.docs=Array.isArray(item.docs)?item.docs:[];
      var identity=(String(item.id)+" "+String(item.name)+" "+String(item.location)).toLowerCase();
      if(identity.indexOf("dallas")>=0||identity.indexOf("fort worth")>=0){item.location="Dallas Fort Worth International Airport, Texas";item.lat=32.8998;item.lng=-97.0403;}
      else if(identity.indexOf("santa fe")>=0){item.lat=35.687;item.lng=-105.9378;}
      else if(identity.indexOf("moab")>=0){item.lat=38.5733;item.lng=-109.5498;}
      return item;
    }):clone(defaultTrip.stages);
    return trip;
  }
  async function migrate(legacy){
    var trip=normalize(legacy);
    for(var i=0;i<trip.stages.length;i+=1){
      var stage=trip.stages[i];
      if(typeof stage.photo==="string"&&stage.photo.indexOf("data:")===0){
        try{var imageBlob=await dataUrlBlob(stage.photo), image=await putFile(imageBlob,stage.name+"-photo",imageBlob.type);stage.cover={kind:"stored",id:image.id};}catch(error){}
      }
      var docs=[];
      for(var j=0;j<(stage.docs||[]).length;j+=1){
        var doc=stage.docs[j];
        if(doc&&typeof doc.data==="string"&&doc.data.indexOf("data:")===0){
          try{var blob=await dataUrlBlob(doc.data), record=await putFile(blob,doc.name,doc.type||blob.type,doc.id||undefined);docs.push({id:record.id,name:record.name,type:record.type,size:record.size});}catch(error){}
        }else if(doc&&doc.id&&doc.name)docs.push(doc);
      }
      stage.docs=docs;delete stage.photo;
    }
    localStorage.setItem(MIGRATION_KEY,"1");return trip;
  }
  async function loadTrip(){
    var saved=await idbGet("settings",TRIP_KEY);if(saved)return normalize(saved);
    if(!localStorage.getItem(MIGRATION_KEY)){
      try{var raw=localStorage.getItem(LEGACY_KEY);if(raw){var trip=await migrate(JSON.parse(raw));await idbPut("settings",trip,TRIP_KEY);toast("Anciennes étapes récupérées et corrigées.");return trip;}}catch(error){localStorage.setItem(MIGRATION_KEY,"1");}
    }
    var fresh=clone(defaultTrip);await idbPut("settings",fresh,TRIP_KEY);return fresh;
  }
  async function objectUrl(id){
    if(state.objectUrls.has(id))return state.objectUrls.get(id);
    var record=await idbGet("files",id);if(!record||!record.blob)return"";
    var url=URL.createObjectURL(record.blob);state.objectUrls.set(id,url);return url;
  }
  async function hydrateImages(){
    var elements=Array.from(document.querySelectorAll("[data-file-cover],[data-doc-thumb]"));
    await Promise.all(elements.map(async function(el){var id=el.getAttribute("data-file-cover")||el.getAttribute("data-doc-thumb"),url=await objectUrl(id);if(url&&el.isConnected)el.src=url;}));
  }
  async function hydrateViewer(){var el=document.querySelector("[data-viewer-file]");if(!el)return;var url=await objectUrl(el.getAttribute("data-viewer-file"));if(url&&el.isConnected)el.src=url;}
  function knownCoordinates(query){
    var value=String(query||"").toLowerCase(), list=[
      {terms:["dallas","fort worth","dfw"],lat:32.8998,lng:-97.0403},{terms:["santa fe"],lat:35.687,lng:-105.9378},{terms:["moab"],lat:38.5733,lng:-109.5498},
      {terms:["ephraim","snow college"],lat:39.3597,lng:-111.5863},{terms:["monument valley"],lat:36.998,lng:-110.0986},{terms:["salt lake city"],lat:40.7608,lng:-111.891},
      {terms:["las vegas"],lat:36.1699,lng:-115.1398},{terms:["los angeles"],lat:34.0522,lng:-118.2437},{terms:["miami"],lat:25.7617,lng:-80.1918},
      {terms:["key west"],lat:24.5551,lng:-81.78},{terms:["orlando"],lat:28.5383,lng:-81.3792},{terms:["new york"],lat:40.7128,lng:-74.006},{terms:["new orleans","nouvelle-orléans"],lat:29.9511,lng:-90.0715}
    ];
    return list.find(function(item){return item.terms.some(function(term){return value.indexOf(term)>=0;});})||null;
  }
  async function geocode(name,location){
    var query=[name,location].filter(Boolean).join(", "), known=knownCoordinates(query);if(known)return{lat:known.lat,lng:known.lng};
    try{var response=await fetch("https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=us&accept-language=fr&q="+encodeURIComponent(query));if(!response.ok)throw new Error();var data=await response.json();if(data&&data[0])return{lat:Number(data[0].lat),lng:Number(data[0].lon)};}catch(error){}
    return null;
  }
  function mapError(container,message){if(!container||container.querySelector(".map-error"))return;var el=document.createElement("div");el.className="map-error";el.textContent=message;container.appendChild(el);}
  async function initMap(id){
    var container=document.getElementById(id);if(!container||!window.L){mapError(container&&container.parentElement,"La carte n’a pas pu se charger.");return;}
    var token=state.mapToken, list=stages().filter(function(x){return Number.isFinite(Number(x.lat))&&Number.isFinite(Number(x.lng));});
    if(!list.length){mapError(container.parentElement,"Ajoute une adresse pour afficher le parcours.");return;}
    var map=L.map(container,{zoomControl:true,attributionControl:true,scrollWheelZoom:false});state.maps.push(map);
    L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",{maxZoom:19,subdomains:"abcd",attribution:"&copy; OpenStreetMap &copy; CARTO"}).addTo(map);
    var points=list.map(function(x){return[Number(x.lat),Number(x.lng)];});
    list.forEach(function(stage,index){L.marker(points[index],{icon:L.divIcon({className:"route-pin"+(stage.done?" done":""),html:String(index+1),iconSize:[34,34],iconAnchor:[17,17]})}).addTo(map).bindPopup("<strong>"+esc(stage.name)+"</strong><br>"+esc(stage.location));});
    var fallback=null;
    if(points.length>1){fallback=L.polyline(points,{color:"#f05a43",weight:4,opacity:.76,dashArray:"7 8",lineCap:"round"}).addTo(map);map.fitBounds(fallback.getBounds(),{padding:[34,34],maxZoom:8});}
    else map.setView(points[0],9);
    setTimeout(function(){if(container.isConnected)map.invalidateSize();},160);
    if(points.length>1)try{
      var coords=list.map(function(x){return Number(x.lng)+","+Number(x.lat);}).join(";"),response=await fetch("https://router.project-osrm.org/route/v1/driving/"+coords+"?overview=full&geometries=geojson");
      if(!response.ok)throw new Error();var data=await response.json();if(token!==state.mapToken||!container.isConnected||!data.routes||!data.routes[0])return;
      if(fallback)map.removeLayer(fallback);var route=L.geoJSON(data.routes[0].geometry,{style:{color:"#f05a43",weight:5,opacity:.93,lineCap:"round"}}).addTo(map);map.fitBounds(route.getBounds(),{padding:[35,35],maxZoom:8});
    }catch(error){mapError(container.parentElement,"Tracé simplifié : le service d’itinéraire est indisponible.");}
  }
  async function compressImage(file){
    if(!file||String(file.type).indexOf("image/")!==0)return file;
    try{var bitmap=await createImageBitmap(file),ratio=Math.min(1,1920/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement("canvas");canvas.width=Math.round(bitmap.width*ratio);canvas.height=Math.round(bitmap.height*ratio);canvas.getContext("2d").drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();var blob=await new Promise(function(resolve){canvas.toBlob(resolve,"image/jpeg",.84);});if(blob&&blob.size<file.size)return blob;}catch(error){}
    return file;
  }
  async function saveStage(form){
    var submit=form.querySelector('[type="submit"]');submit.disabled=true;submit.textContent="Enregistrement…";
    var current=selected(),data=new FormData(form),name=String(data.get("name")||"").trim(),location=String(data.get("location")||"").trim(),date=String(data.get("date")||""),story=String(data.get("story")||"").trim(),photo=data.get("photo"),cover=current?current.cover:null,old=cover&&cover.kind==="stored"?cover.id:null;
    try{
      if(photo&&photo.size){if(photo.size>40*1024*1024)throw new Error("La photo dépasse 40 Mo.");var compressed=await compressImage(photo),record=await putFile(compressed,photo.name,compressed.type||photo.type);cover={kind:"stored",id:record.id};}
      var same=current&&current.name===name&&current.location===location,coords=same&&Number.isFinite(Number(current.lat))?{lat:Number(current.lat),lng:Number(current.lng)}:await geocode(name,location);
      var stage={id:current?current.id:uid("stage"),name:name,location:location,date:date,story:story,lat:coords?coords.lat:null,lng:coords?coords.lng:null,cover:cover,done:current?!!current.done:false,docs:current?(current.docs||[]):[],createdAt:current?current.createdAt:new Date().toISOString()};
      if(current)state.trip.stages=state.trip.stages.map(function(x){return x.id===current.id?stage:x;});else state.trip.stages.push(stage);
      await saveTrip();if(old&&cover&&cover.id!==old)await removeFile(old);state.sheet=null;state.selectedStageId=null;render();toast(coords?"Étape enregistrée.":"Étape enregistrée. Adresse à préciser pour la carte.");
    }catch(error){submit.disabled=false;submit.textContent=current?"Enregistrer":"Publier l’étape";toast(error.message||"Impossible d’enregistrer.",true);}
  }
  async function addDocuments(files){
    var stage=selected();if(!stage||!files.length)return;var progress=document.getElementById("upload-progress");if(progress){progress.hidden=false;progress.textContent="Ajout des fichiers…";}
    try{for(var i=0;i<files.length;i+=1){var file=files[i];if(file.size>40*1024*1024){toast(file.name+" dépasse 40 Mo.",true);continue;}if(progress)progress.textContent="Ajout "+(i+1)+"/"+files.length+" · "+file.name;var record=await putFile(file,file.name,file.type);stage.docs.push({id:record.id,name:record.name,type:record.type,size:record.size});}await saveTrip();render();toast("Documents ajoutés à "+stage.name+".");}
    catch(error){toast("Impossible d’ajouter ce document.",true);}
  }
  async function removeFile(id){if(state.objectUrls.has(id)){URL.revokeObjectURL(state.objectUrls.get(id));state.objectUrls.delete(id);}await idbDelete("files",id);}
  async function deleteDocument(id){var meta=findDoc(id);if(!meta||!confirm("Supprimer « "+meta.name+" » ?"))return;state.trip.stages.forEach(function(stage){stage.docs=(stage.docs||[]).filter(function(doc){return doc.id!==id;});});await saveTrip();await removeFile(id);render();toast("Document supprimé.");}
  async function downloadFile(id){var meta=findDoc(id),url=await objectUrl(id);if(!meta||!url){toast("Ce fichier est introuvable.",true);return;}var a=document.createElement("a");a.href=url;a.download=meta.name||"document";a.target="_blank";document.body.appendChild(a);a.click();a.remove();}
  async function deleteStage(id){var stage=state.trip.stages.find(function(x){return x.id===id;});if(!stage||!confirm("Supprimer l’étape « "+stage.name+" » et ses documents ?"))return;var ids=(stage.docs||[]).map(function(x){return x.id;});if(stage.cover&&stage.cover.kind==="stored")ids.push(stage.cover.id);state.trip.stages=state.trip.stages.filter(function(x){return x.id!==id;});await saveTrip();for(var i=0;i<ids.length;i+=1)await removeFile(ids[i]);state.sheet=null;render();toast("Étape supprimée.");}
  function blobData(blob){return new Promise(function(resolve,reject){var reader=new FileReader();reader.onload=function(){resolve(String(reader.result));};reader.onerror=function(){reject(reader.error);};reader.readAsDataURL(blob);});}
  async function exportBackup(){
    try{var records=await idbAll("files"),files=[];for(var i=0;i<records.length;i+=1)files.push({id:records[i].id,name:records[i].name,type:records[i].type,size:records[i].size,data:await blobData(records[i].blob)});
      var payload={format:"meausa-road-trip-backup",version:6,exportedAt:new Date().toISOString(),trip:state.trip,files:files},blob=new Blob([JSON.stringify(payload)],{type:"application/json"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="MEAUSA-road-trip-sauvegarde.json";document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url);},3000);state.sheet=null;render();toast("Sauvegarde complète exportée.");
    }catch(error){toast("Impossible de créer la sauvegarde.",true);}
  }
  async function importBackup(file){
    try{var payload=JSON.parse(await file.text());if(!payload||payload.format!=="meausa-road-trip-backup"||!payload.trip)throw new Error();if(!confirm("Remplacer le voyage actuel par cette sauvegarde ?"))return;await idbClear("files");state.objectUrls.forEach(function(url){URL.revokeObjectURL(url);});state.objectUrls.clear();for(var i=0;i<(payload.files||[]).length;i+=1){var item=payload.files[i],blob=await dataUrlBlob(item.data);await putFile(blob,item.name,item.type,item.id);}state.trip=normalize(payload.trip);await saveTrip();state.sheet=null;state.view="voyage";render();toast("Sauvegarde restaurée.");}catch(error){toast("Cette sauvegarde ne peut pas être importée.",true);}
  }
  async function resetTrip(){if(!confirm("Effacer ce voyage, ses photos et tous ses documents ?"))return;await idbClear("files");state.objectUrls.forEach(function(url){URL.revokeObjectURL(url);});state.objectUrls.clear();state.trip=clone(defaultTrip);await saveTrip();state.sheet=null;state.view="voyage";render();toast("Nouveau road trip créé.");}

  app.addEventListener("submit",function(event){if(event.target&&event.target.id==="stage-form"){event.preventDefault();saveStage(event.target);}});
  app.addEventListener("change",function(event){
    var target=event.target;
    if(target&&target.name==="photo"&&target.files&&target.files[0]){var preview=document.getElementById("stage-photo-preview");if(preview){preview.src=URL.createObjectURL(target.files[0]);preview.classList.add("visible");}}
    if(target&&target.id==="document-upload")addDocuments(Array.from(target.files||[]));
    if(target&&target.id==="backup-import"&&target.files&&target.files[0])importBackup(target.files[0]);
  });
  app.addEventListener("click",async function(event){
    var button=event.target.closest("[data-action]");if(!button)return;var action=button.getAttribute("data-action");
    if(action==="overlay-close"&&event.target!==button)return;
    if(action==="overlay-close"||action==="close-sheet"){state.sheet=null;state.selectedStageId=null;render();return;}
    if(action==="navigate"){state.view=button.getAttribute("data-view")||"voyage";state.sheet=null;state.selectedStageId=null;scrollTo({top:0,behavior:"smooth"});render();return;}
    if(action==="open-menu"){state.sheet={type:"menu"};render();return;}
    if(action==="add-stage"){state.selectedStageId=null;state.sheet={type:"stage"};render();return;}
    if(action==="edit-stage"){state.selectedStageId=button.getAttribute("data-stage-id");state.sheet={type:"stage"};render();return;}
    if(action==="open-stage-docs"){state.selectedStageId=button.getAttribute("data-stage-id");state.sheet={type:"docs"};render();return;}
    if(action==="toggle-done"){var id=button.getAttribute("data-stage-id");state.trip.stages.forEach(function(x){if(x.id===id)x.done=!x.done;});await saveTrip();render();return;}
    if(action==="toggle-public"){state.publicMode=!state.publicMode;state.sheet=null;render();return;}
    if(action==="go-to-stage"){var stageId=button.getAttribute("data-stage-id");state.view="voyage";render();setTimeout(function(){var card=document.getElementById("stage-"+stageId);if(card)card.scrollIntoView({behavior:"smooth",block:"start"});},80);return;}
    if(action==="open-file"){state.sheet={type:"viewer",fileId:button.getAttribute("data-file-id")};render();return;}
    if(action==="download-file"){event.stopPropagation();await downloadFile(button.getAttribute("data-file-id"));return;}
    if(action==="delete-file"){event.stopPropagation();await deleteDocument(button.getAttribute("data-file-id"));return;}
    if(action==="delete-stage"){await deleteStage(button.getAttribute("data-stage-id"));return;}
    if(action==="archive-trip"){state.trip.archived=true;await saveTrip();state.sheet=null;state.view="archives";render();toast("Voyage archivé.");return;}
    if(action==="export-backup"){await exportBackup();return;}
    if(action==="trigger-import"){var input=document.getElementById("backup-import");if(input)input.click();return;}
    if(action==="reset-trip")await resetTrip();
  });
  async function start(){
    try{state.db=await openDb();state.trip=await loadTrip();render();if("serviceWorker"in navigator&&location.protocol.indexOf("http")===0)navigator.serviceWorker.register("./sw.js").catch(function(){});}
    catch(error){app.innerHTML='<div class="boot-screen"><div class="boot-mark">M</div><strong>Impossible d’ouvrir le carnet</strong><span>Recharge la page ou désactive la navigation privée.</span></div>';}
  }
  start();
}());
