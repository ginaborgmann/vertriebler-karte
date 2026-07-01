# Vertriebler-Karte mit gemeinsamer Supabase-Datenbank

Kostenloses GitHub-Pages-Tool mit OpenStreetMap/Leaflet und gemeinsamer Supabase-Datenbank.

## Dateien

- `index.html` – Website
- `styles.css` – Design
- `app.js` – Logik
- `config.example.js` – Vorlage für deine Supabase-Zugangsdaten
- `setup.sql` – Datenbank-Tabelle für Supabase

## Schritt 1: Supabase einrichten

1. Bei Supabase ein neues Projekt erstellen.
2. Im Projekt links auf **SQL Editor** gehen.
3. Inhalt aus `setup.sql` einfügen.
4. Auf **Run** klicken.

## Schritt 2: Zugangsdaten eintragen

1. Datei `config.example.js` kopieren oder umbenennen in `config.js`.
2. In Supabase zu **Project Settings > API** gehen.
3. `Project URL` in `SUPABASE_URL` eintragen.
4. `anon public` Key in `SUPABASE_ANON_KEY` eintragen.

Beispiel:

```js
window.APP_CONFIG = {
  SUPABASE_URL: 'https://deinprojekt.supabase.co',
  SUPABASE_ANON_KEY: 'dein-anon-key'
};
```

## Schritt 3: GitHub Pages

1. Neues GitHub-Repository erstellen.
2. Alle Dateien hochladen, auch die neue `config.js`.
3. Repository > **Settings > Pages**.
4. Branch `main`, Ordner `/root` auswählen.
5. Speichern.

## Wichtig

- Die Karte funktioniert nur mit Internet, weil Leaflet und OpenStreetMap-Kacheln online geladen werden.
- Wenn die Karte weiß/grau bleibt, einmal Browser-Cache leeren oder hart neu laden: Windows `Strg + F5`, Mac `Cmd + Shift + R`.
- Aktuell kann jeder mit Link Daten sehen, hinzufügen und löschen. Für echten Betrieb sollte später ein Admin-Schutz ergänzt werden.
