# Vertriebler-Karte

Kostenlose Web-App für GitHub Pages + Supabase.

## Funktionen
- OpenStreetMap-Karte
- gemeinsame Supabase-Datenbank
- mehrere Vertriebler gleichzeitig eintragen
- PLZ-Suche
- nächstgelegener Berater
- Entfernung in km
- grob geschätzte Fahrzeit in Minuten

## Supabase
Die Tabelle wurde bei dir bereits mit `setup.sql` angelegt. Falls nicht: Inhalt von `setup.sql` im Supabase SQL Editor ausführen.

## GitHub Pages
Alle Dateien in ein GitHub Repository hochladen und GitHub Pages auf `main` und `/root` stellen.

## Verbinden
Website öffnen → oben auf „Supabase verbinden“ klicken → Project URL und Publishable Key eintragen.

Wichtig: Niemals den Secret Key verwenden.

## Eingabeformat für Berater
Eine Zeile pro Berater:

Name; PLZ; Ort; Telefon; E-Mail

Beispiel:

Max Mustermann; 50667; Köln; 0221 123456; max@example.de
