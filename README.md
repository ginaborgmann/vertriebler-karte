# Vertriebler-Karte

Kostenlose GitHub-Pages-Webseite mit OpenStreetMap + Supabase.

## Start
1. Dateien in GitHub hochladen.
2. GitHub Pages aktivieren: Settings → Pages → Deploy from branch → main → /(root).
3. In Supabase den SQL-Code aus `setup.sql` ausführen.
4. Webseite öffnen und oben auf **Supabase verbinden** klicken.
5. Project URL und Publishable/Anon Key eintragen.

## Eingabeformat für mehrere Vertriebler

```text
Name; PLZ; Ort; Telefon; E-Mail
Max Mustermann; 50667; Köln; 0221 12345; max@example.de
Erika Beispiel; 10115; Berlin; 030 12345; erika@example.de
```

## Hinweis
Die Fahrzeit ist eine grobe Schätzung auf Basis der Luftlinien-Entfernung. Für echte Fahrzeiten per Straße wäre später ein Routing-Dienst nötig.
