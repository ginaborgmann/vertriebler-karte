const STORAGE_URL = 'vertriebler_supabase_url';
const STORAGE_KEY = 'vertriebler_supabase_key';
const TABLE = 'vertriebler';

let map, supabaseClient;
let advisors = [];
let markers = [];
let searchMarker = null;
let nearestMarker = null;

const $ = (id) => document.getElementById(id);

function setStatus(text, isError = false) {
  $('status').textContent = text || '';
  $('status').style.color = isError ? '#b91c1c' : '#065f46';
}

function initMap() {
  map = L.map('map').setView([51.1657, 10.4515], 6);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap-Mitwirkende'
  }).addTo(map);
}

function loadConfig() {
  const url = localStorage.getItem(STORAGE_URL) || '';
  const key = localStorage.getItem(STORAGE_KEY) || '';
  $('supabaseUrl').value = url;
  $('supabaseKey').value = key;
  if (!url || !key) {
    setStatus('Bitte zuerst Supabase verbinden.', true);
    return false;
  }
  supabaseClient = window.supabase.createClient(url, key);
  return true;
}

async function geocode(query) {
  const cacheKey = 'geo_' + query.trim().toLowerCase();
  const cached = localStorage.getItem(cacheKey);
  if (cached) return JSON.parse(cached);
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=de&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { 'Accept': 'application/json' }});
  const data = await res.json();
  if (!data.length) throw new Error('Adresse/PLZ nicht gefunden: ' + query);
  const point = { lat: Number(data[0].lat), lon: Number(data[0].lon), label: data[0].display_name };
  localStorage.setItem(cacheKey, JSON.stringify(point));
  return point;
}

function distanceKm(aLat, aLon, bLat, bLon) {
  const R = 6371;
  const dLat = (bLat - aLat) * Math.PI / 180;
  const dLon = (bLon - aLon) * Math.PI / 180;
  const lat1 = aLat * Math.PI / 180;
  const lat2 = bLat * Math.PI / 180;
  const x = Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1-x));
}

function minutesEstimate(km) {
  return Math.max(3, Math.round((km / 55) * 60));
}

async function loadAdvisors() {
  if (!supabaseClient && !loadConfig()) return;
  setStatus('Lade Berater...');
  const { data, error } = await supabaseClient.from(TABLE).select('*').order('name');
  if (error) { setStatus('Fehler beim Laden: ' + error.message, true); return; }
  advisors = data || [];
  renderAdvisors();
  renderMarkers();
  setStatus(`${advisors.length} Berater geladen.`);
}

function renderMarkers() {
  markers.forEach(m => m.remove());
  markers = [];
  advisors.forEach(a => {
    if (a.breitengrad && a.laengengrad) {
      const m = L.marker([a.breitengrad, a.laengengrad]).addTo(map);
      m.bindPopup(`<strong>${escapeHtml(a.name)}</strong><br>${escapeHtml(a.plz || '')} ${escapeHtml(a.ort || '')}<br>${escapeHtml(a.telefon || '')}<br>${escapeHtml(a.email || '')}`);
      markers.push(m);
    }
  });
}

function renderAdvisors() {
  const box = $('beraterList');
  box.innerHTML = '';
  if (!advisors.length) { box.textContent = 'Noch keine Berater eingetragen.'; return; }
  advisors.forEach(a => {
    const div = document.createElement('div');
    div.className = 'card';
    div.innerHTML = `<strong>${escapeHtml(a.name)}</strong>${escapeHtml(a.plz || '')} ${escapeHtml(a.ort || '')}<br>${escapeHtml(a.telefon || '')}<br>${escapeHtml(a.email || '')}<br>`;
    const del = document.createElement('button');
    del.textContent = 'Löschen';
    del.onclick = () => deleteAdvisor(a.id);
    div.appendChild(del);
    box.appendChild(div);
  });
}

async function addBatch() {
  if (!supabaseClient && !loadConfig()) return;
  const lines = $('batchInput').value.split('\n').map(l => l.trim()).filter(Boolean);
  if (!lines.length) return setStatus('Bitte mindestens eine Zeile eintragen.', true);
  setStatus('Geokodiere und speichere...');
  const rows = [];
  for (const line of lines) {
    const [name, plz, ort = '', telefon = '', email = ''] = line.split(';').map(x => x.trim());
    if (!name || !plz) { setStatus('Jede Zeile braucht mindestens Name und PLZ.', true); return; }
    const geo = await geocode(`${plz} ${ort} Deutschland`);
    rows.push({ name, plz, ort, telefon, email, breitengrad: geo.lat, laengengrad: geo.lon });
    await new Promise(r => setTimeout(r, 350));
  }
  const { error } = await supabaseClient.from(TABLE).insert(rows);
  if (error) return setStatus('Fehler beim Speichern: ' + error.message, true);
  $('batchInput').value = '';
  await loadAdvisors();
  setStatus(`${rows.length} Berater gespeichert.`);
}

async function deleteAdvisor(id) {
  if (!confirm('Diesen Berater wirklich löschen?')) return;
  const { error } = await supabaseClient.from(TABLE).delete().eq('id', id);
  if (error) return setStatus('Fehler beim Löschen: ' + error.message, true);
  await loadAdvisors();
}

async function searchNearest() {
  const zip = $('searchZip').value.trim();
  if (!zip) return;
  if (!advisors.length) return $('nearestBox').textContent = 'Noch keine Berater vorhanden.';
  const origin = await geocode(`${zip} Deutschland`);
  if (searchMarker) searchMarker.remove();
  searchMarker = L.circleMarker([origin.lat, origin.lon], { radius: 9 }).addTo(map).bindPopup('Such-PLZ: ' + zip);
  const withDistance = advisors.filter(a => a.breitengrad && a.laengengrad).map(a => {
    const km = distanceKm(origin.lat, origin.lon, a.breitengrad, a.laengengrad);
    return { ...a, km, minutes: minutesEstimate(km) };
  }).sort((a,b) => a.km - b.km);
  const n = withDistance[0];
  if (!n) return $('nearestBox').textContent = 'Keine Berater mit Koordinaten gefunden.';
  $('nearestBox').innerHTML = `<strong>Nächstgelegener Berater:</strong><br>${escapeHtml(n.name)}<br>${escapeHtml(n.plz)} ${escapeHtml(n.ort || '')}<br><strong>${n.km.toFixed(1)} km</strong> entfernt<br>ca. <strong>${n.minutes} Minuten</strong> Fahrzeit`;
  if (nearestMarker) nearestMarker.remove();
  nearestMarker = L.marker([n.breitengrad, n.laengengrad]).addTo(map).bindPopup(`Nächster Berater: ${escapeHtml(n.name)}<br>${n.km.toFixed(1)} km / ca. ${n.minutes} Min.`).openPopup();
  map.fitBounds([[origin.lat, origin.lon], [n.breitengrad, n.laengengrad]], { padding: [40, 40] });
}

function escapeHtml(s) { return String(s ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }

window.addEventListener('load', () => {
  initMap();
  loadConfig();
  loadAdvisors();
  $('settingsBtn').onclick = () => $('settingsDialog').showModal();
  $('saveConfigBtn').onclick = () => {
    localStorage.setItem(STORAGE_URL, $('supabaseUrl').value.trim());
    localStorage.setItem(STORAGE_KEY, $('supabaseKey').value.trim());
    setTimeout(() => { loadConfig(); loadAdvisors(); }, 50);
  };
  $('clearConfigBtn').onclick = () => { localStorage.removeItem(STORAGE_URL); localStorage.removeItem(STORAGE_KEY); location.reload(); };
  $('addBatchBtn').onclick = addBatch;
  $('reloadBtn').onclick = loadAdvisors;
  $('searchBtn').onclick = searchNearest;
  $('searchZip').addEventListener('keydown', e => { if (e.key === 'Enter') searchNearest(); });
});
