let db;
let map;
let routeLayer;
let pointMarkers = [];
let people = [];
let pointCount = 2; // Start + Ziel 1
const MAX_POINTS = 6; // Start + maximal 5 Ziele

const $ = (id) => document.getElementById(id);

function setStatus(msg, type = 'ok') {
  const el = $('status');
  el.textContent = msg;
  el.style.background = type === 'error' ? '#fee2e2' : '#dcfce7';
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}

function initSupabase() {
  if (!window.SUPABASE_URL || !window.SUPABASE_PUBLISHABLE_KEY || window.SUPABASE_PUBLISHABLE_KEY.includes('HIER_')) {
    setStatus('Bitte zuerst config.js mit Supabase URL und Publishable Key prüfen.', 'error');
    return false;
  }
  db = supabase.createClient(window.SUPABASE_URL, window.SUPABASE_PUBLISHABLE_KEY);
  return true;
}

function initMap() {
  map = L.map('routeMap').setView([51.1657, 10.4515], 6);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap'
  }).addTo(map);
}

async function loadPeople() {
  const { data, error } = await db.from('vertriebler').select('*').order('name');
  if (error) {
    setStatus('Vertriebler konnten nicht geladen werden: ' + error.message, 'error');
    return;
  }
  people = data || [];
  renderPoints();
}

function personOptions() {
  return people
    .filter(p => p.lat && p.lon)
    .map(p => `<option value="${p.id}">${escapeHtml(p.name)} (${escapeHtml(p.plz)})</option>`)
    .join('');
}

function renderPoints() {
  const wrap = $('points');
  const oldValues = readCurrentPointValues(false);
  wrap.innerHTML = '';

  for (let i = 0; i < pointCount; i++) {
    const isStart = i === 0;
    const old = oldValues[i] || { mode: 'plz', plz: '', personId: '' };
    const title = isStart ? 'Start' : `Ziel ${i}`;
    const removeButton = !isStart && pointCount > 2
      ? `<button type="button" class="danger" onclick="removePoint(${i})">Entfernen</button>`
      : '';

    wrap.insertAdjacentHTML('beforeend', `
      <div class="point" data-index="${i}">
        <div class="point-head"><strong>${title}</strong>${removeButton}</div>
        <div class="row">
          <label>Art</label>
          <select class="mode" onchange="togglePointMode(${i})">
            <option value="plz" ${old.mode === 'plz' ? 'selected' : ''}>PLZ eingeben</option>
            <option value="person" ${old.mode === 'person' ? 'selected' : ''}>Vertriebler auswählen</option>
          </select>
        </div>
        <div class="row plz-row">
          <label>PLZ</label>
          <input class="plz" inputmode="numeric" maxlength="5" placeholder="z. B. 49074" value="${escapeHtml(old.plz)}" />
        </div>
        <div class="row person-row">
          <label>Vertriebler</label>
          <select class="personId">
            <option value="">Bitte auswählen</option>
            ${personOptions()}
          </select>
        </div>
      </div>
    `);

    const point = wrap.querySelector(`.point[data-index="${i}"]`);
    point.querySelector('.personId').value = old.personId || '';
    togglePointMode(i);
  }

  $('addPointBtn').disabled = pointCount >= MAX_POINTS;
}

function readCurrentPointValues(throwErrors = true) {
  const values = [];
  document.querySelectorAll('.point').forEach((el, i) => {
    const mode = el.querySelector('.mode').value;
    const plz = el.querySelector('.plz').value.trim();
    const personId = el.querySelector('.personId').value;
    values[i] = { mode, plz, personId };
  });
  return values;
}

window.togglePointMode = function(index) {
  const el = document.querySelector(`.point[data-index="${index}"]`);
  if (!el) return;
  const mode = el.querySelector('.mode').value;
  el.querySelector('.plz-row').style.display = mode === 'plz' ? '' : 'none';
  el.querySelector('.person-row').style.display = mode === 'person' ? '' : 'none';
};

window.removePoint = function(index) {
  const values = readCurrentPointValues(false);
  values.splice(index, 1);
  pointCount = Math.max(2, pointCount - 1);
  renderPoints();
  setTimeout(() => {
    document.querySelectorAll('.point').forEach((el, i) => {
      if (!values[i]) return;
      el.querySelector('.mode').value = values[i].mode;
      el.querySelector('.plz').value = values[i].plz;
      el.querySelector('.personId').value = values[i].personId;
      togglePointMode(i);
    });
  }, 0);
};

function addPoint() {
  if (pointCount >= MAX_POINTS) {
    setStatus('Maximal 5 Ziele möglich.', 'error');
    return;
  }
  pointCount++;
  renderPoints();
}

async function geocodePlz(plz) {
  if (!/^\d{5}$/.test(plz)) throw new Error('Ungültige PLZ: ' + plz);
  const key = 'geo_' + plz;
  const cached = localStorage.getItem(key);
  if (cached) return JSON.parse(cached);

  const url = `https://nominatim.openstreetmap.org/search?format=json&countrycodes=de&postalcode=${encodeURIComponent(plz)}&limit=1`;
  const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
  const data = await res.json();
  if (!data || !data.length) throw new Error('PLZ nicht gefunden: ' + plz);

  const pos = { label: 'PLZ ' + plz, lat: Number(data[0].lat), lon: Number(data[0].lon) };
  localStorage.setItem(key, JSON.stringify(pos));
  await new Promise(r => setTimeout(r, 1100));
  return pos;
}

async function resolvePoint(input, index) {
  if (input.mode === 'person') {
    const p = people.find(x => String(x.id) === String(input.personId));
    if (!p) throw new Error(`Punkt ${index + 1}: Vertriebler auswählen.`);
    if (!p.lat || !p.lon) throw new Error(`${p.name} hat keine Koordinaten gespeichert.`);
    return { label: p.name + ' (' + p.plz + ')', lat: Number(p.lat), lon: Number(p.lon) };
  }
  return await geocodePlz(input.plz);
}

async function calculateRoute() {
  try {
    setStatus('Route wird berechnet...');
    const inputs = readCurrentPointValues();
    if (inputs.length < 2) throw new Error('Bitte mindestens Start und ein Ziel eintragen.');

    const points = [];
    for (let i = 0; i < inputs.length; i++) {
      points.push(await resolvePoint(inputs[i], i));
    }

    const coords = points.map(p => `${p.lon},${p.lat}`).join(';');
    const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=false`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.code !== 'Ok' || !data.routes || !data.routes.length) {
      throw new Error('Route konnte nicht berechnet werden.');
    }

    const route = data.routes[0];
    renderRoute(points, route);
    setStatus('Route berechnet.');
  } catch (err) {
    setStatus(err.message, 'error');
  }
}

function formatMinutes(seconds) {
  const min = Math.round(seconds / 60);
  if (min < 60) return `${min} Min.`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h} Std. ${m} Min.`;
}

function renderRoute(points, route) {
  if (routeLayer) routeLayer.remove();
  pointMarkers.forEach(m => m.remove());
  pointMarkers = [];

  routeLayer = L.geoJSON(route.geometry, { weight: 5 }).addTo(map);

  points.forEach((p, i) => {
    const label = i === 0 ? 'Start' : `Ziel ${i}`;
    const marker = L.marker([p.lat, p.lon]).addTo(map).bindPopup(`<b>${label}</b><br>${escapeHtml(p.label)}`);
    pointMarkers.push(marker);
  });

  map.fitBounds(routeLayer.getBounds(), { padding: [30, 30] });

  const legs = route.legs || [];
  let totalDistance = 0;
  let totalDuration = 0;

  const html = legs.map((leg, i) => {
    totalDistance += leg.distance;
    totalDuration += leg.duration;
    const km = (leg.distance / 1000).toFixed(1).replace('.', ',');
    return `<div class="result-line"><b>${escapeHtml(points[i].label)}</b> → <b>${escapeHtml(points[i+1].label)}</b><br>${km} km | ${formatMinutes(leg.duration)}</div>`;
  }).join('');

  $('routeResult').innerHTML = html + `<div class="total">Gesamt: ${(totalDistance / 1000).toFixed(1).replace('.', ',')} km | ${formatMinutes(totalDuration)}</div>`;
}

window.addEventListener('DOMContentLoaded', async () => {
  initMap();
  if (!initSupabase()) return;
  $('addPointBtn').addEventListener('click', addPoint);
  $('calcBtn').addEventListener('click', calculateRoute);
  await loadPeople();
});
