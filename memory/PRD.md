# ÉxamSécure — PRD

## Original problem statement
App web d'examens pour élèves en environnement contrôlé : pas de copier-coller, pas de changement de page (IA), anti-plagiat. Écriture dynamique Word/PDF, formulaires type Microsoft Forms, outils permis : WordQ, Antidote, Lexibar, usito.usherbrooke.ca, WordReference. Le responsable choisit ce qu'il accepte. Blocage d'Internet sauf outils permis. L'enseignant choisit le type d'examen et peut téléverser son fichier Word/PDF.

## User choices
- Auth : enseignant avec compte (JWT) ; élèves = code d'examen + nom
- Types : formulaire + rédaction (+ document téléversé)
- Infractions : avertissement + journal + verrouillage après X (réglable)
- Outils : Usito/WordReference en fenêtre contrôlée ; WordQ/Antidote/Lexibar « permis »
- Correction manuelle par l'enseignant

## Architecture
FastAPI (server.py, auth.py, storage.py, seed.py) + MongoDB + React (Tiptap editor, html2pdf). Emergent Object Storage for exam files; mammoth converts .docx to HTML.

## Implemented (2026-06)
- Teacher auth (register/login/refresh/logout), seeded teacher lynchs2757@gmail.com
- Dashboard, exam builder (3 types, questions MCQ/short/long, file upload PDF/DOCX, tools & security settings, status)
- Student join, intro rules, locked exam shell: fullscreen gate, clipboard/contextmenu/shortcut block, tab/blur/fullscreen detection, violations counter, auto-lock, timer + auto-submit, autosave
- Allowed web tools open in popup (not counted); desktop tools tolerated on blur
- Live monitoring (5s polling), event timeline, unlock, manual grading per question, export PDF/Word
- Limitation: web app cannot block internet/OS apps — recommend Safe Exam Browser for full lockdown

## Backlog
- P1: Safe Exam Browser config file (.seb) export per exam
- P1: Class lists / roster restricting who can join
- P2: Bulk export of all copies (ZIP), statistics per question
- P2: Accommodations (extra time per student)
