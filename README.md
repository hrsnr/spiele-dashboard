# Spiele-Dashboard mit Google-Drive Turnier-Sync

Statische Web-App (optimiert für **GitHub Pages**) mit zentraler Turnier-CSV auf **Google Drive** und parallelem Mehrgeräte-Betrieb über **Google Apps Script**.

## Funktionsweise im Turniermodus
* **Eine gemeinsame CSV-Datei auf Google Drive:** `urlaub_turnier.csv` im Zielordner [`1Oqvt-SfoJk4H5PwC1gEsb-7YZf5UqPaY`](https://drive.google.com/drive/folders/1Oqvt-SfoJk4H5PwC1gEsb-7YZf5UqPaY).
* **Kein Google-Login auf Mitspieler-Handys nötig:** Das Google Apps Script übernimmt die Schreibzugriffe mit `LockService` (reiht parallele Spielabschlüsse sicher hintereinander ein, ohne dass sich zwei Handys gegenseitig überschreiben).
* **Kein Live-Sync von Zwischenständen:** Erst nach Spielende und Klick auf **„🏆 In Urlaubs-Wertung speichern“** wird das Endergebnis hochgeladen (inkl. Duplikatschutz und lokalem Retry-Puffer bei kurzem Funkloch).
* **Schutz über PIN & Admin-Passwort:**
  * Lesen (Rangliste, Siegerehrung, Spieler-Chips) funktioniert ohne PIN.
  * Schreiben (Spieler anlegen, Partie speichern, Partie löschen) fragt einmalig pro Handy die **Turnier-PIN** ab.
  * Komplett-Reset & CSV-Vollimport erfordern das **Admin-Passwort** und legen vor dem Leeren automatisch ein CSV-Archiv auf Google Drive an.

---

## Einrichtung (einmalig in ca. 5 Minuten)

### Schritt 1: Google Apps Script anlegen
1. Öffne [script.google.com](https://script.google.com/) mit deinem Google-Konto (das Schreibrechte auf den Drive-Ordner hat) und klicke auf **Neues Projekt**.
2. Kopiere den kompletten Inhalt von [`google-apps-script/Code.gs`](google-apps-script/Code.gs) in den Editor (ersetze den vorhandenen Platzhalter-Code).
3. **Passwörter direkt in Google Apps Script anpassen** *(wichtig: nicht deine echten Passwörter ins öffentliche GitHub-Repo eintragen!)*:
   * Entweder in `Code.gs` im Apps-Script-Editor `DEFAULT_TOURNAMENT_PIN` und `DEFAULT_ADMIN_PASSWORD` ändern, **oder** unter **Projekteinstellungen → Skripteigenschaften** die beiden Schlüssel `TOURNAMENT_PIN` und `ADMIN_PASSWORD` anlegen.
4. *(Optional zum Testen)* Im Editor oben die Funktion `testSetup` auswählen und auf **Ausführen** klicken → Drive-Berechtigung erlauben. Dadurch wird `urlaub_turnier.csv` sofort im Drive-Ordner erstellt.
5. Auf **Bereitstellen → Neue Bereitstellung** klicken:
   * Typ: **Web-App**
   * Ausführen als: **Ich**
   * Zugriff: **Jeder**
6. Die angezeigte **Web-App-URL** (`https://script.google.com/macros/s/.../exec`) kopieren.

### Schritt 2: Web-App-URL im Projekt eintragen
1. Öffne [`tournament.js`](tournament.js) und trage ganz oben unter `CLOUD_CONFIG.appsScriptUrl` deine kopierte Web-App-URL ein:
   ```js
   const CLOUD_CONFIG = {
     appsScriptUrl: 'https://script.google.com/macros/s/DEINE_ID/exec',
     driveFolderUrl: 'https://drive.google.com/drive/folders/1Oqvt-SfoJk4H5PwC1gEsb-7YZf5UqPaY',
     pollIntervalMs: 25000
   };
   ```

### Schritt 3: Auf GitHub hochladen & GitHub Pages aktivieren
1. Lade alle Projektdateien (`index.html`, `styles.css`, `theme.js`, `tournament.js`, `sw.js`, `manifest.json`, `.nojekyll`, `spiele/`, `README.md`, optional `google-apps-script/`) in dein GitHub-Repository hoch *(eine eventuell vorhandene `backup.zip` muss nicht mit hochgeladen werden)*.
2. Öffne auf GitHub **Settings → Pages**:
   * **Source:** `Deploy from a branch`
   * **Branch:** `main` (Ordner `/ (root)`) → **Save**.
3. Nach ca. 1 Minute ist dein Dashboard unter `https://<dein-name>.github.io/<repo-name>/` erreichbar.

### Schritt 4: Testen
1. Öffne die GitHub-Pages-URL auf zwei Handys und aktiviere oben den Schalter **Turnier**.
2. Auf Handy 1 einen Spieler anlegen → Turnier-PIN eingeben → nach wenigen Sekunden (oder Klick auf `🔄 Sync`) erscheint der Spieler auch auf Handy 2.
3. Sobald im Drive-Ordner `urlaub_turnier.csv` angelegt wurde, öffnet der Button **„🌐 Drive-CSV“** im Dashboard direkt den öffentlichen Lese-Link zur CSV-Datei.
