const CACHE_KEY = 'vertriebler-map-geocode-cache-v3';
const TABLE_NAME = 'sales_people';

const CONFIG = window.APP_CONFIG || {};
const SUPABASE_URL = CONFIG.SUPABASE_URL || 'HIER_DEINE_SUPABASE_URL_EINTRAGEN';
const SUPABASE_ANON_KEY = CONFIG.SUPABASE_ANON_KEY || 'HIER_DEINEN_SUPABASE_ANON_KEY_EINTRAGEN';

let salesPeople = [];
let geocodeCache = loadJson(CACHE_KEY, {});
let markers = [];
let searchMarker = null;
let distanceLines = [];
let map = null;
let db = null;

window.addEventListener('DOMContentLoaded', init);

function init() {
  const isConfigured = SUPABASE_URL.startsWith('https://') && !SUPABASE_ANON_KEY.startsWith('HIER_');

  if (!window.L) {
    showMapWarning('Die Karte konnte nicht geladen werden. Prüfe deine Internetverbindung oder ob der Leaflet-Link blockiert wird.');
    setStatus('Karte fehlt');
    return;
  }

  map = L.map('map').setView([51.1657, 10.4515], 6);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);
  setTimeout(() => map.invalidateSize(), 250);

  if (isConfigured) {
    if (!window.supabase) {
      showMapWarning('Supabase konnte nicht geladen werden. Prüfe deine Internetverbindung oder ob jsDelivr blockiert wird.');
      setStatus('Supabase fehlt');
    } else {
      db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
  } else {
    document.getElementById('setupWarning').hidden = false;
    setStatus('Supabase fehlt');
  }

  bindEvents();
  loadSalesPeople();
}

function bindEvents() {
  document.getElementById('singleForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await addSalesPeople([{ name: form.get('name'), contact: form.get('contact'), zip: form.get('zip'), city: form.get('city') }]);
    event.currentTarget.reset();
  });

  document.getElementById('batchBtn').addEventListener('click', async () => {
    const batchInput = document.getElementById('batchInput');
    const rows = batchInput.value.split('\n').map(row => row.trim()).filter(Boolean);
    const people = rows.map(row => {
      const [name, contact, zip, city] = row.split(';').map(value => (value || '').trim());
      return { name, contact, zip, city };
    }).filter(person => person.name && person.zip);

    if (!people.length) return alert('Bitte mindestens eine gültige Zeile eintragen: Name;Kontakt;PLZ;Ort');
    await addSalesPeople(people);
    batchInput.value = '';
  });

  document.getElementById('clearBtn').addEventListener('click', async () => {
    if (!confirm('Alle Vertriebler wirklich aus der gemeinsamen Online-Datenbank löschen?')) return;
    await ensureConfigured();
    setStatus('Lösche…');
    const { error } = await db.from(TABLE_NAME).delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) return showError(error);
    await loadSalesPeople();
  });

  document.getElementById('refreshBtn').addEventListener('click', loadSalesPeople);
  document.getElementById('exportBtn').addEventListener('click', () => downloadJson('vertriebler-daten.json', salesPeople));

  document.getElementById('searchForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const zip = document.getElementById('searchZip').value.trim();
    const radiusKm = Number(document.getElementById('radiusKm').value || 50);
    const origin = await geocodeZip(zip);
    if (!origin) return alert('PLZ wurde nicht gefunden.');

    showSearchMarker(origin, zip);
    const withDistance = salesPeople
      .filter(person => Number.isFinite(person.lat) && Number.isFinite(person.lon))
      .map(person => ({ ...person, distanceKm: distanceKm(origin.lat, origin.lon, person.lat, person.lon) }))
      .sort((a, b) => a.distanceKm - b.distanceKm);

    const nearby = withDistance.filter(person => person.distanceKm <= radiusKm);
    showResult(nearby, withDistance[0], radiusKm);
    render(withDistance[0]?.id);
  });
}

async function loadSalesPeople() {
  if (!db) {
    salesPeople = [];
    render();
    return;
  }

  setStatus('Lade Daten…');
  const { data, error } = await db.from(TABLE_NAME).select('*').order('created_at', { ascending: false });
  if (error) return showError(error);
  salesPeople = data.map(row => ({
    id: row.id,
    name: row.name,
    contact: row.contact || '',
    zip: row.zip,
    city: row.city || '',
    lat: Number(row.lat),
    lon: Number(row.lon),
    createdAt: row.created_at
  }));
  setStatus(`${salesPeople.length} online gespeichert`);
  render();
}

async function addSalesPeople(people) {
  await ensureConfigured();
  setStatus('Bereite Speicherung vor…');

  const rowsToInsert = [];
  for (const person of people) {
    const location = await geocodeZip(person.zip, person.city);
    if (!location) {
      alert(`PLZ nicht gefunden: ${person.zip} (${person.name})`);
      continue;
    }
    rowsToInsert.push({
      name: String(person.name).trim(),
      contact: String(person.contact || '').trim(),
      zip: String(person.zip).trim(),
      city: String(person.city || location.city || '').trim(),
      lat: location.lat,
      lon: location.lon
    });
    await sleep(1050);
  }

  if (!rowsToInsert.length) return;
  setStatus('Speichere online…');
  const { error } = await db.from(TABLE_NAME).insert(rowsToInsert);
  if (error) return showError(error);
  await loadSalesPeople();
}

async function geocodeZip(zip, city = '') {
  const cleanZip = String(zip).trim();
  const cacheKey = `${cleanZip}|${String(city).trim().toLowerCase()}`;
  if (geocodeCache[cacheKey]) return geocodeCache[cacheKey];

  const query = new URLSearchParams({ postalcode: cleanZip, country: 'Germany', format: 'jsonv2', addressdetails: '1', limit: '1' });
  if (city) query.set('city', city);

  const response = await fetch(`https://nominatim.openstreetmap.org/search?${query.toString()}`, { headers: { 'Accept': 'application/json' } });
  if (!response.ok) return null;
  const data = await response.json();
  if (!data.length) return null;

  const item = data[0];
  const location = { lat: Number(item.lat), lon: Number(item.lon), city: item.address?.city || item.address?.town || item.address?.village || city || '' };
  geocodeCache[cacheKey] = location;
  saveJson(CACHE_KEY, geocodeCache);
  return location;
}

function render(highlightId = null) {
  const salesList = document.getElementById('salesList');
  markers.forEach(marker => marker.remove());
  distanceLines.forEach(line => line.remove());
  markers = [];
  distanceLines = [];
  salesList.innerHTML = '';

  if (!salesPeople.length) {
    salesList.innerHTML = '<p class="hint">Noch keine Vertriebler gespeichert.</p>';
    return;
  }

  salesPeople.forEach(person => {
    const marker = L.marker([person.lat, person.lon]).addTo(map);
    marker.bindPopup(`<strong>${escapeHtml(person.name)}</strong><br>${escapeHtml(person.zip)} ${escapeHtml(person.city)}<br>${escapeHtml(person.contact || '')}`);
    marker.on('click', () => focusPerson(person));
    markers.push(marker);

    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <strong>${escapeHtml(person.name)}${person.id === highlightId ? '<span class="badge">nächster</span>' : ''}</strong>
      <small>${escapeHtml(person.zip)} ${escapeHtml(person.city)}<br>${escapeHtml(person.contact || 'Kein Kontakt hinterlegt')}</small>
      <button type="button">Auf Karte anzeigen</button>
    `;
    card.querySelector('button').addEventListener('click', () => focusPerson(person));
    salesList.appendChild(card);
  });

  if (markers.length) map.fitBounds(L.featureGroup(markers).getBounds().pad(0.2));
}

function focusPerson(person) {
  map.setView([person.lat, person.lon], 11);
  const marker = markers.find(m => m.getLatLng().lat === person.lat && m.getLatLng().lng === person.lon);
  marker?.openPopup();
}
function showSearchMarker(origin, zip) { if (searchMarker) searchMarker.remove(); searchMarker = L.circleMarker([origin.lat, origin.lon], { radius: 10 }).addTo(map).bindPopup(`Such-PLZ: ${escapeHtml(zip)}`).openPopup(); }
function showResult(nearby, nearest, radiusKm) { const nearestResult = document.getElementById('nearestResult'); nearestResult.style.display = 'block'; if (!nearest) { nearestResult.innerHTML = 'Noch keine Vertriebler gespeichert.'; return; } nearestResult.innerHTML = `<strong>Nächster Berater:</strong> ${escapeHtml(nearest.name)} – ${nearest.distanceKm.toFixed(1)} km entfernt.<br><strong>Im Umkreis von ${radiusKm} km:</strong> ${nearby.length || 'keine'}`; distanceLines.forEach(line => line.remove()); distanceLines = []; if (searchMarker && nearest) { const start = searchMarker.getLatLng(); const line = L.polyline([[start.lat, start.lng], [nearest.lat, nearest.lon]], { weight: 4, dashArray: '8 8' }).addTo(map); distanceLines.push(line); map.fitBounds(line.getBounds().pad(0.4)); } }
async function ensureConfigured() { if (!db) throw new Error('Supabase ist noch nicht eingerichtet. Bitte config.example.js in config.js umbenennen und Supabase-Werte eintragen.'); }
function showMapWarning(message) { const el = document.getElementById('mapWarning'); el.hidden = false; el.innerHTML = `<strong>Problem:</strong> ${escapeHtml(message)}`; }
function showError(error) { console.error(error); setStatus('Fehler'); alert(error.message || String(error)); }
function setStatus(text) { document.getElementById('syncStatus').textContent = text; }
function distanceKm(lat1, lon1, lat2, lon2) { const r = 6371; const dLat = toRad(lat2 - lat1); const dLon = toRad(lon2 - lon1); const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2; return 2 * r * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); }
function toRad(deg) { return deg * Math.PI / 180; }
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function loadJson(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; } }
function saveJson(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char])); }
function downloadJson(filename, data) { const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url); }
