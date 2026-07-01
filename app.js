const $ = (id) => document.getElementById(id);
let supabaseClient = null;
let advisors = [];
let markers = [];
let nearestMarker = null;

const map = L.map('map').setView([51.1657, 10.4515], 6);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap'
}).addTo(map);

function setStatus(msg, error = false) {
  $('status').textContent = msg;
  $('status').style.color = error ? '#9b1c1c' : '#285c2d';
}

function initSupabase() {
  const url = localStorage.getItem('SUPABASE_URL') || '';
  const key = localStorage.getItem('SUPABASE_KEY') || '';
  $('supabaseUrl').value = url;
  $('supabaseKey').value = key;
  if (!url || !key || !window.supabase) return false;
  supabaseClient = window.supabase.createClient(url, key);
  return true;
}

async function geocodeZip(zip) {
  const cacheKey = `geo:${zip}`;
  const cached = localStorage.getItem(cacheKey);
  if (cached) return JSON.parse(cached);
  const url = `https://nominatim.openstreetmap.org/search?format=json&countrycodes=de&postalcode=${encodeURIComponent(zip)}&limit=1`;
  const res = await fetch(url, { headers: { 'Accept': 'application/json' }});
  const data = await res.json();
  if (!data.length) throw new Error(`PLZ nicht gefunden: ${zip}`);
  const point = { lat: Number(data[0].lat), lon: Number(data[0].lon), label: data[0].display_name };
  localStorage.setItem(cacheKey, JSON.stringify(point));
  return point;
}

function distanceKm(a, b) {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLon = (b.lon - a.lon) * Math.PI / 180;
  const lat1 = a.lat * Math.PI / 180;
  const lat2 = b.lat * Math.PI / 180;
  const x = Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1-x));
}

function estimateMinutes(km) {
  return Math.max(5, Math.round((km / 55) * 60 + 8));
}

async function loadAdvisors() {
  if (!supabaseClient && !initSupabase()) {
    setStatus('Bitte zuerst Supabase verbinden.', true);
    return;
  }
  const { data, error } = await supabaseClient.from('vertriebler').select('*').order('name');
  if (error) { setStatus('Fehler beim Laden: ' + error.message, true); return; }
  advisors = data || [];
  renderAdvisors();
  renderMarkers();
  setStatus(`${advisors.length} Vertriebler geladen.`);
}

function renderAdvisors() {
  const list = $('advisorList');
  if (!advisors.length) { list.innerHTML = '<p class="hint">Noch keine Vertriebler gespeichert.</p>'; return; }
  list.innerHTML = advisors.map(a => `
    <div class="advisor-card">
      <strong>${escapeHtml(a.name)}</strong>
      <div>${escapeHtml(a.plz || '')} ${escapeHtml(a.ort || '')}</div>
      <div>${escapeHtml(a.telefon || '')}</div>
      <div>${escapeHtml(a.email || '')}</div>
      <button onclick="deleteAdvisor(${a.id})">Löschen</button>
    </div>`).join('');
}

function renderMarkers() {
  markers.forEach(m => m.remove());
  markers = [];
  advisors.filter(a => a.lat && a.lon).forEach(a => {
    const m = L.marker([a.lat, a.lon]).addTo(map).bindPopup(`<b>${escapeHtml(a.name)}</b><br>${escapeHtml(a.plz)} ${escapeHtml(a.ort || '')}`);
    markers.push(m);
  });
}

async function saveBulk() {
  if (!supabaseClient && !initSupabase()) { setStatus('Bitte zuerst Supabase verbinden.', true); return; }
  const lines = $('bulkInput').value.split('\n').map(l => l.trim()).filter(Boolean);
  const rows = [];
  for (const line of lines) {
    if (line.toLowerCase().startsWith('name;')) continue;
    const [name, plz, ort='', telefon='', email=''] = line.split(';').map(x => (x || '').trim());
    if (!name || !plz) continue;
    setStatus(`Geokodiere ${name} (${plz}) ...`);
    const geo = await geocodeZip(plz);
    rows.push({ name, plz, ort, telefon, email, lat: geo.lat, lon: geo.lon });
    await new Promise(r => setTimeout(r, 900));
  }
  if (!rows.length) { setStatus('Keine gültigen Zeilen gefunden.', true); return; }
  const { error } = await supabaseClient.from('vertriebler').insert(rows);
  if (error) { setStatus('Fehler beim Speichern: ' + error.message, true); return; }
  $('bulkInput').value = '';
  setStatus(`${rows.length} Vertriebler gespeichert.`);
  await loadAdvisors();
}

async function searchNearest() {
  const zip = $('searchZip').value.trim();
  if (!zip) return;
  if (!advisors.length) await loadAdvisors();
  const origin = await geocodeZip(zip);
  const valid = advisors.filter(a => a.lat && a.lon);
  if (!valid.length) { $('nearestResult').textContent = 'Keine Berater mit Koordinaten gefunden.'; return; }
  const ranked = valid.map(a => ({ ...a, km: distanceKm(origin, { lat: a.lat, lon: a.lon }) })).sort((a,b) => a.km - b.km);
  const best = ranked[0];
  const min = estimateMinutes(best.km);
  $('nearestResult').classList.remove('empty');
  $('nearestResult').innerHTML = `<b>Nächstgelegener Berater:</b><br>${escapeHtml(best.name)}<br>${escapeHtml(best.plz)} ${escapeHtml(best.ort || '')}<br><b>${best.km.toFixed(1)} km</b> entfernt · ca. <b>${min} Minuten</b> Fahrzeit`;
  if (nearestMarker) nearestMarker.remove();
  nearestMarker = L.circleMarker([best.lat, best.lon], { radius: 14 }).addTo(map).bindPopup(`Nächster Berater: ${escapeHtml(best.name)}`).openPopup();
  map.fitBounds([[origin.lat, origin.lon], [best.lat, best.lon]], { padding: [60, 60] });
}

async function deleteAdvisor(id) {
  if (!confirm('Diesen Vertriebler löschen?')) return;
  const { error } = await supabaseClient.from('vertriebler').delete().eq('id', id);
  if (error) setStatus('Fehler beim Löschen: ' + error.message, true);
  else loadAdvisors();
}
window.deleteAdvisor = deleteAdvisor;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}

$('settingsBtn').addEventListener('click', () => $('settingsDialog').showModal());
$('saveSettingsBtn').addEventListener('click', () => {
  localStorage.setItem('SUPABASE_URL', $('supabaseUrl').value.trim());
  localStorage.setItem('SUPABASE_KEY', $('supabaseKey').value.trim());
  initSupabase();
  setStatus('Supabase gespeichert. Lade Daten ...');
  loadAdvisors();
});
$('saveBulkBtn').addEventListener('click', saveBulk);
$('searchBtn').addEventListener('click', searchNearest);
$('searchZip').addEventListener('keydown', e => { if (e.key === 'Enter') searchNearest(); });

initSupabase();
loadAdvisors();
