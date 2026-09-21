# 👾 Spiele-Dashboard

Eine mobile-optimierte Progressive Web App (PWA) für digitale Spielehelfer, Punkte-Tracker und kleine Retro-Browsergames. Baut komplett auf **Vanilla HTML, CSS und JavaScript** auf – schlank, ohne externe Abhängigkeiten und perfekt für die Nutzung auf dem Smartphone am Spieletisch.

![PWA Ready](https://img.shields.io/badge/PWA-Ready-brightgreen)
![No Frameworks](https://img.shields.io/badge/Dependencies-None-blue)
![License](https://img.shields.io/badge/License-MIT-orange)

---

## 📱 Features

* **PWA & Offline-First:** Kann auf Smartphones (iOS & Android) als App auf dem Homescreen installiert werden und funktioniert dank Service Worker auch ohne Internetverbindung.
* **Mobile-First UI:** Dunkles, modernes Kacheldesign mit einklappbaren Kategorien, großen Touch-Zonen und Eingabe-Optimierung für Mobilgeräte.
* **Plattformunabhängige Game Engines:** Alle Arcade-Spiele nutzen eine *Fixed-Timestep Game Loop* (60 FPS), die flüssige Physik und identische Spielgeschwindigkeit auf allen Displays (60Hz, 90Hz, 120Hz) und allen Browsern (Chrome, Safari, Firefox Mobile) garantiert.

---

## 🎲 Übersicht der Spiele & Helfer

### 📊 Spielehelfer & Punkte-Tracker
* **✨ Qwirkle:** Punkte-Eingabe mit automatischer Differenzanzeige zum Führenden, Kronen-Markierung, 12-Punkte-Qwirkle-Aktion und +6 Endspiel-Bonus.
* **🦄 Cabo:** Rundenbasierter Punkte-Tracker mit automatischer Kamikaze-Aktion (0 Pkt für Auslöser, 50 Pkt für andere), 100er-Reset-Regel (genau 100 Pkt. sinken auf 50) und Verlierer-Auswertung ab 101 Punkten.
* **🧙‍♂️ Wizard:** Rundenberechnung inklusive Ansagen, Stich-Erfassung und automatischer Punkteauswertung für alle Spieler.
* **🃏 Flip7:** Schnelles Punktezählen für Kartenrunden.
* **🪵 Mölkky:** Punkte-Tracker mit Erkennung von Fehleingaben und automatischer Rücksetzung bei Überstreiten der 50-Punkte-Grenze.
* **⛳ Minigolf:** Digitaler Zettel für Minigolf-Runden mit Bahn-Navigation und automatischer Endauswertung.

### 🕹️ Arcade & Mini-Games
* **🏇 Flappy-Henri:** Retro Flappy-Bird-Klon. Enthält Parallax-Hintergründe, Lego- & Röhren-Hindernisse und Highscore-Speicherung.
* **🏃‍♀️ Charlie Runner:** Endless-Runner im Stil des Chrome-Dino-Spiels mit detailreicher Pixel-Art-Grafik.

---

## 📁 Projektstruktur

```text
.
├── index.html          # Hauptübersicht mit PWA-Integration & Kategorien
├── styles.css          # Zentraels CSS-Design (CSS-Variablen, Responsive Grid)
├── manifest.json       # PWA-Manifest für WebApp-Installation
├── sw.js               # Service Worker für Caching & Offline-Betrieb
└── spiele/             # Alle eigenständigen Spiele und Helfer
    ├── cabo.html
    ├── charlie_run.html
    ├── flappy_henri.html
    ├── flip7.html
    ├── minigolf.html
    ├── moelkky.html
    ├── qwirkle.html
    └── wizard.html
