# Vertriebler-Karte einfach

Funktionen:
- Nur Name + PLZ
- Excel/Google-Sheets Import mit 2 Spalten: Name und PLZ
- Gemeinsame Daten über Supabase
- PLZ-Suche: nächster Vertriebler mit km und geschätzten Minuten
- OpenStreetMap-Karte

## Dateien
- `index.html`
- `app.js`
- `styles.css`
- `config.js`
- `setup.sql`

## Supabase
Du hast die Tabelle bereits erstellt. Falls nicht, den Inhalt aus `setup.sql` im Supabase SQL Editor ausführen.

## config.js
In `config.js` musst du nur den Publishable Key eintragen:

```js
window.SUPABASE_URL = "https://gaoihgqhnoooljlfhxgw.supabase.co";
window.SUPABASE_ANON_KEY = "DEIN_PUBLISHABLE_KEY";
```

Nicht den Secret Key verwenden.

## GitHub Pages
Alle Dateien in das Repository hochladen und GitHub Pages auf `main` / `/root` stellen.
