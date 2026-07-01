let db;
let map;
let routeMarkers = [];
let routeLine = null;
let people = [];
let pointCount = 2;

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

function escapeHtml(s){
  return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}

async function loadPeople(){
  const {data, error} = await db.from('vertriebler').select('*').order('name');
  if (error){ fail('Fehler beim Laden: ' + error.message); return; }
  people = data || [];
  ok(`${people.length} Vertriebler geladen.`);
  renderPoints();
}

function renderPoints(){
  const options = people.map(p => `<option value="${p.id}">${escapeHtml(p.name)} - ${escapeHtml(p.plz)}</option>`).join('');
  let html = '';

  for (let i = 0; i < pointCount; i++) {
    const label = i === 0 ? 'Start' : `Ziel ${i}`;
    html += `
      <div class="route-point">
        <h3>${label}</h3>
        <label>Art</label>
        <select id="type_${i}" onchange="togglePointType(${i})">
          <option value="plz">PLZ eingeben</option>
          <option value="person">Vertriebler auswählen</option>
        </select>

        <input id="plz_${i}" placeholder="PLZ, z. B. 49074" maxlength="5" />

        <select id="person_${i}" style="display:none">
          <option value="">Vertriebler wählen...</option>
          ${options}
        </select>
      </div>
    `;
  }

  $('routePoints').innerHTML = html;
  $('addPointBtn').disabled = pointCount >= 5;
}

window.togglePointType = function(i){
  const type = $(`type_${i}`).value;
  $(`plz_${i}`).style.display = type === 'plz' ? 'block' : 'none';
  $(`person_${i}`).style.display = type === 'person' ? 'block' : 'none';
};

function addPoint(){
  if (pointCount >= 5) return;
  pointCount++;
  renderPoints();
}

async function geocodePlz(plz){
  const key = 'geo_' + plz;
  const cached = localStorage.getItem(key);
  if (cached) return JSON.parse(cached);

  const url = `https://nominatim.openstreetmap.org/search?format=json&countrycodes=de&postalcode=${encodeURIComponent(plz)}&limit=1`;
  const res = await fetch(url, {headers: {'Accept': 'application/json'}});
  const data = await res.json();
  if (!data || !data.length) throw new Error('PLZ nicht gefunden: ' + plz);

  const pos = {lat: Number(data[0].lat), lon: Number(data[0].lon), label: plz};
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

function minutesEstimate(km){
  return Math.max(1, Math.round((km / 55) * 60));
}

async function getPoint(i){
  const type = $(`type_${i}`).value;

  if (type === 'person') {
    const id = Number($(`person_${i}`).value);
    const p = people.find(x => x.id === id);
    if (!p) throw new Error(`Bitte bei Punkt ${i + 1} einen Vertriebler auswählen.`);
    if (!p.lat || !p.lon) throw new Error(`${p.name} hat keine Koordinaten. Bitte Vertriebler neu mit PLZ speichern.`);
    return {lat: p.lat, lon: p.lon, label: p.name + ' (' + p.plz + ')'};
  }

  const plz = $(`plz_${i}`).value.trim();
  if (!/^\d{5}$/.test(plz)) throw new Error(`Bitte bei Punkt ${i + 1} eine 5-stellige PLZ eingeben.`);
  const pos = await geocodePlz(plz);
  return {...pos, label: 'PLZ ' + plz};
}

function clearMap(){
  routeMarkers.forEach(m => m.remove());
  routeMarkers = [];
  if (routeLine) routeLine.remove();
  routeLine = null;
}

async function calculateRoute(){
  try {
    ok('Route wird berechnet...');
    const points = [];

    for (let i = 0; i < pointCount; i++) {
      points.push(await getPoint(i));
    }

    let totalKm = 0;
    let totalMin = 0;
    let rows = '';

    for (let i = 0; i < points.length - 1; i++) {
      const km = Math.round(distanceKm(points[i], points[i+1]) * 10) / 10;
      const min = minutesEstimate(km);
      totalKm += km;
      totalMin += min;
      rows += `<div class="route-leg"><b>${escapeHtml(points[i].label)}</b> → <b>${escapeHtml(points[i+1].label)}</b><br>${km} km | ca. ${min} Min.</div>`;
    }

    const backKm = Math.round(distanceKm(points[points.length - 1], points[0]) * 10) / 10;
    const backMin = minutesEstimate(backKm);
    totalKm += backKm;
    totalMin += backMin;
    rows += `<div class="route-leg"><b>Zurück:</b> ${escapeHtml(points[points.length - 1].label)} → ${escapeHtml(points[0].label)}<br>${backKm} km | ca. ${backMin} Min.</div>`;

    $('routeResult').innerHTML = rows + `<hr><h3>Gesamt: ${Math.round(totalKm * 10) / 10} km | ca. ${totalMin} Min.</h3>`;

    clearMap();
    const latlngs = points.map(p => [p.lat, p.lon]);
    latlngs.push([points[0].lat, points[0].lon]);
    routeLine = L.polyline(latlngs, {weight: 4}).addTo(map);

    points.forEach((p, i) => {
      const m = L.marker([p.lat, p.lon]).addTo(map).bindPopup(`${i === 0 ? 'Start' : 'Ziel ' + i}: ${escapeHtml(p.label)}`);
      routeMarkers.push(m);
    });

    map.fitBounds(routeLine.getBounds(), {padding:[30,30]});
    ok('Route berechnet. Fahrzeit ist geschätzt.');
  } catch (e) {
    fail(e.message);
  }
}

window.addEventListener('DOMContentLoaded', async () => {
  initMap();
  if (!initSupabase()) return;
  $('addPointBtn').addEventListener('click', addPoint);
  $('calcRouteBtn').addEventListener('click', calculateRoute);
  await loadPeople();
});
