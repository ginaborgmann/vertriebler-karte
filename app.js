const avgKmPerMinute = 0.8; // einfache Fahrzeit-Schätzung: 48 km/h
let supabaseClient;
let advisors = [];
let map;
let markers = [];
let searchMarker = null;
let nearestLine = null;

const $ = (id) => document.getElementById(id);

function setStatus(message, type = "muted") {
  const el = $("status");
  el.className = type;
  el.textContent = message;
}

function cleanPlz(value) {
  const match = String(value || "").match(/\b\d{5}\b/);
  return match ? match[0] : "";
}

function parseRows(text) {
  return text.split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const parts = line.split(/\t|;|,/).map(p => p.trim()).filter(Boolean);
      if (parts.length >= 2) return { name: parts[0], plz: cleanPlz(parts[1]) };
      const plz = cleanPlz(line);
      const name = line.replace(plz, "").trim();
      return { name, plz };
    })
    .filter(row => row.name && row.plz);
}

async function geocodePlz(plz) {
  const response = await fetch(`https://api.zippopotam.us/de/${plz}`);
  if (!response.ok) throw new Error(`PLZ ${plz} wurde nicht gefunden.`);
  const data = await response.json();
  const place = data.places?.[0];
  if (!place) throw new Error(`PLZ ${plz} wurde nicht gefunden.`);
  return { lat: Number(place.latitude), lon: Number(place.longitude), place: place["place name"] };
}

function distanceKm(a, b) {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLon = (b.lon - a.lon) * Math.PI / 180;
  const lat1 = a.lat * Math.PI / 180;
  const lat2 = b.lat * Math.PI / 180;
  const x = Math.sin(dLat/2)**2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon/2)**2;
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1-x));
}

function ensureConfig() {
  if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY || window.SUPABASE_ANON_KEY.includes("HIER_")) {
    throw new Error("Bitte zuerst in config.js den Supabase Publishable Key eintragen.");
  }
}

function initMap() {
  map = L.map("map").setView([51.1657, 10.4515], 6);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap"
  }).addTo(map);
}

function renderMarkers(highlightId = null) {
  markers.forEach(m => map.removeLayer(m));
  markers = [];
  advisors.forEach(a => {
    const marker = L.marker([a.lat, a.lon]).addTo(map);
    marker.bindPopup(`<b>${escapeHtml(a.name)}</b><br>PLZ ${escapeHtml(a.plz)}`);
    markers.push(marker);
    if (a.id === highlightId) marker.openPopup();
  });
  if (markers.length) {
    const group = L.featureGroup(markers);
    map.fitBounds(group.getBounds().pad(0.25));
  }
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"]/g, s => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[s]));
}

function renderList() {
  const list = $("advisorList");
  if (!advisors.length) {
    list.innerHTML = `<p class="muted">Noch keine Vertriebler gespeichert.</p>`;
    return;
  }
  list.innerHTML = advisors.map(a => `
    <div class="item">
      <div><b>${escapeHtml(a.name)}</b><span>PLZ ${escapeHtml(a.plz)}</span></div>
      <button class="danger" onclick="deleteAdvisor(${a.id})">Löschen</button>
    </div>
  `).join("");
}

async function loadAdvisors() {
  const { data, error } = await supabaseClient.from("vertriebler").select("*").order("name");
  if (error) throw error;
  advisors = data || [];
  renderList();
  renderMarkers();
}

async function importAdvisors() {
  try {
    const rows = parseRows($("bulkInput").value);
    if (!rows.length) return setStatus("Bitte Namen und PLZ einfügen.", "error");
    setStatus(`Verarbeite ${rows.length} Einträge...`);
    const prepared = [];
    for (const row of rows) {
      const geo = await geocodePlz(row.plz);
      prepared.push({ name: row.name, plz: row.plz, lat: geo.lat, lon: geo.lon });
    }
    const { error } = await supabaseClient.from("vertriebler").insert(prepared);
    if (error) throw error;
    $("bulkInput").value = "";
    setStatus(`${prepared.length} Vertriebler gespeichert.`, "success");
    await loadAdvisors();
  } catch (err) {
    setStatus(err.message || String(err), "error");
  }
}

async function searchNearest() {
  try {
    if (!advisors.length) return $("result").innerHTML = `<span class="error">Noch keine Vertriebler gespeichert.</span>`;
    const plz = cleanPlz($("searchPlz").value);
    if (!plz) return $("result").innerHTML = `<span class="error">Bitte eine gültige 5-stellige PLZ eingeben.</span>`;
    const start = await geocodePlz(plz);
    const ranked = advisors.map(a => ({ ...a, km: distanceKm(start, a) })).sort((a,b) => a.km - b.km);
    const best = ranked[0];
    const minutes = Math.max(1, Math.round(best.km / avgKmPerMinute));
    $("result").innerHTML = `<strong>${escapeHtml(best.name)}</strong>ist am nächsten: <b>${best.km.toFixed(1)} km</b> entfernt, ca. <b>${minutes} Minuten</b> Fahrzeit.`;

    if (searchMarker) map.removeLayer(searchMarker);
    if (nearestLine) map.removeLayer(nearestLine);
    searchMarker = L.marker([start.lat, start.lon]).addTo(map).bindPopup(`Such-PLZ ${plz}`).openPopup();
    nearestLine = L.polyline([[start.lat, start.lon], [best.lat, best.lon]], { weight: 4 }).addTo(map);
    renderMarkers(best.id);
    map.fitBounds(L.featureGroup([searchMarker, nearestLine]).getBounds().pad(0.3));
  } catch (err) {
    $("result").innerHTML = `<span class="error">${escapeHtml(err.message || String(err))}</span>`;
  }
}

async function deleteAdvisor(id) {
  if (!confirm("Diesen Vertriebler wirklich löschen?")) return;
  const { error } = await supabaseClient.from("vertriebler").delete().eq("id", id);
  if (error) return alert(error.message);
  await loadAdvisors();
}
window.deleteAdvisor = deleteAdvisor;

document.addEventListener("DOMContentLoaded", async () => {
  initMap();
  try {
    ensureConfig();
    supabaseClient = supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
    $("importBtn").addEventListener("click", importAdvisors);
    $("reloadBtn").addEventListener("click", loadAdvisors);
    $("searchBtn").addEventListener("click", searchNearest);
    $("searchPlz").addEventListener("keydown", e => { if (e.key === "Enter") searchNearest(); });
    await loadAdvisors();
    setStatus("Bereit.");
  } catch (err) {
    setStatus(err.message || String(err), "error");
    $("result").innerHTML = `<span class="error">${escapeHtml(err.message || String(err))}</span>`;
  }
});
