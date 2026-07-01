let db;
let map;
let markers = [];
let people = [];

const $ = (id) => document.getElementById(id);

function fail(msg){
  $('status').textContent = msg;
  $('status').style.background = '#fee2e2';
}
function ok(msg){
  $('status').textContent = msg;
  $('status').style.background = '#dcfce7';
}

function initSupabase(){
  if (!window.SUPABASE_URL || !window.SUPABASE_PUBLISHABLE_KEY || window.SUPABASE_PUBLISHABLE_KEY.includes('HIER_')) {
    fail('Bitte in config.js die SUPABASE_URL und den SUPABASE_PUBLISHABLE_KEY eintragen.');
    return false;
  }
  db = supabase.createClient(window.SUPABASE_URL, window.SUPABASE_PUBLISHABLE_KEY);
  return true;
}

function initMap(){
  map = L.map('map').setView([51.1657, 10.4515], 6);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap'
  }).addTo(map);
}

async function geocodePlz(plz){
  const key = 'geo_' + plz;
  const cached = localStorage.getItem(key);
  if (cached) return JSON.parse(cached);
  const url = `https://nominatim.openstreetmap.org/search?format=json&countrycodes=de&postalcode=${encodeURIComponent(plz)}&limit=1`;
  const res = await fetch(url, {headers: {'Accept': 'application/json'}});
  const data = await res.json();
  if (!data || !data.length) throw new Error('PLZ nicht gefunden: ' + plz);
  const pos = {lat: Number(data[0].lat), lon: Number(data[0].lon)};
  localStorage.setItem(key, JSON.stringify(pos));
  await new Promise(r => setTimeout(r, 1100));
  return pos;
}

function distanceKm(a,b){
  const R=6371;
  const dLat=(b.lat-a.lat)*Math.PI/180;
  const dLon=(b.lon-a.lon)*Math.PI/180;
  const lat1=a.lat*Math.PI/180;
  const lat2=b.lat*Math.PI/180;
  const x=Math.sin(dLat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;
  return 2*R*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));
}
function minutesEstimate(km){ return Math.max(1, Math.round((km/55)*60)); }

function parseBulk(text){
  return text.split(/\r?\n/).map(l=>l.trim()).filter(Boolean).map(line=>{
    const parts = line.split(/\t|;|,/).map(p=>p.trim()).filter(Boolean);
    if (parts.length < 2) return null;
    const plz = parts[parts.length-1].match(/\b\d{5}\b/)?.[0];
    const name = parts.slice(0, parts.length-1).join(' ').trim();
    if (!name || !plz) return null;
    return {name, plz};
  }).filter(Boolean);
}

async function loadPeople(){
  const {data, error} = await db.from('vertriebler').select('*').order('name');
  if (error){ fail('Fehler beim Laden: ' + error.message); return; }
  people = data || [];
  renderList();
  renderMarkers();
}

function renderList(){
  if (!people.length) { $('list').innerHTML = '<p>Noch keine Vertriebler gespeichert.</p>'; return; }
  $('list').innerHTML = people.map(p=>`<div class="person"><div><b>${escapeHtml(p.name)}</b><br><small>${escapeHtml(p.plz)}</small></div><button class="delete" onclick="deletePerson(${p.id})">Löschen</button></div>`).join('');
}
function escapeHtml(s){ return String(s).replace(/[&<>"]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

function renderMarkers(bestId=null){
  markers.forEach(m=>m.remove()); markers=[];
  const bounds=[];
  people.forEach(p=>{
    if (p.lat && p.lon){
      const m=L.marker([p.lat,p.lon]).addTo(map).bindPopup(`<b>${escapeHtml(p.name)}</b><br>PLZ ${escapeHtml(p.plz)}`);
      markers.push(m); bounds.push([p.lat,p.lon]);
      if (p.id===bestId) m.openPopup();
    }
  });
  if(bounds.length) map.fitBounds(bounds,{padding:[30,30]});
}

async function saveBulk(){
  const rows = parseBulk($('bulkInput').value);
  if (!rows.length){ fail('Keine gültigen Zeilen gefunden. Bitte Name und PLZ einfügen.'); return; }
  ok('Geokodiere PLZ und speichere... bitte warten.');
  const out=[];
  for (const r of rows){
    try { const pos = await geocodePlz(r.plz); out.push({...r, lat:pos.lat, lon:pos.lon}); }
    catch(e){ fail(e.message); return; }
  }
  const {error} = await db.from('vertriebler').insert(out);
  if(error){ fail('Speichern fehlgeschlagen: ' + error.message); return; }
  $('bulkInput').value=''; ok(`${out.length} Vertriebler gespeichert.`); await loadPeople();
}

async function searchNearest(){
  const plz = $('searchPlz').value.trim();
  if(!/^\d{5}$/.test(plz)){ $('result').textContent='Bitte eine 5-stellige PLZ eingeben.'; return; }
  if(!people.length){ $('result').textContent='Noch keine Vertriebler gespeichert.'; return; }
  let pos;
  try { pos = await geocodePlz(plz); } catch(e){ $('result').textContent=e.message; return; }
  const withGeo = people.filter(p=>p.lat && p.lon);
  if(!withGeo.length){ $('result').textContent='Keine Vertriebler mit Koordinaten gespeichert.'; return; }
  const ranked = withGeo.map(p=>({p, km: distanceKm(pos,{lat:p.lat,lon:p.lon})})).sort((a,b)=>a.km-b.km);
 const top5 = ranked.slice(0, 5);

$('result').innerHTML =
  `<b>Die nächsten Vertriebler:</b><br>` +
  top5.map((item, index) => {
    const km = Math.round(item.km * 10) / 10;
    const min = minutesEstimate(km);
    return `${index + 1}. <b>${escapeHtml(item.p.name)}</b> – PLZ ${escapeHtml(item.p.plz)} – <b>${km} km</b> – ca. <b>${min} Min.</b>`;
  }).join('<br>');

const best = top5[0];
  L.marker([pos.lat,pos.lon]).addTo(map).bindPopup('Gesuchte PLZ '+plz).openPopup();
  map.setView([best.p.lat,best.p.lon], 10);
  renderMarkers(best.p.id);
}

async function deletePerson(id){
  if(!confirm('Diesen Vertriebler löschen?')) return;
  const {error}=await db.from('vertriebler').delete().eq('id',id);
  if(error){ fail('Löschen fehlgeschlagen: '+error.message); return; }
  ok('Gelöscht.'); await loadPeople();
}
window.deletePerson=deletePerson;

window.addEventListener('DOMContentLoaded', async()=>{
  initMap();
  if(!initSupabase()) return;
  $('saveBtn').addEventListener('click', saveBulk);
  $('reloadBtn').addEventListener('click', loadPeople);
  $('searchBtn').addEventListener('click', searchNearest);
  await loadPeople();
});
