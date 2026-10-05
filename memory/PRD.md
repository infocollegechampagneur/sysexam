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
- Iteration 2: class rosters (import CSV/paste, roster-restricted join by name/matricule), extra time % per student + teacher-granted minutes, group export (all copies PDF/Word), write directly in uploaded docs (DOCX editable in editor; PDF text boxes via pdf.js + annotated PDF export via pdf-lib)

## Backlog
- Iteration 3: PDF highlight & underline marks (drag), shown to teacher and burned into annotated PDF export
- Iteration 4: 5 highlighter colors (in UI + annotated PDF), rebrand to MonExamEnLigne, landing reduced to centered student join card
- Iteration 5: "Nom de l'enseignant" field on join (auto-filled + read-only when exam uses a class list), stored on session & shown in copies; teacher can edit display name (PUT /api/auth/me)
- Iteration 6: clearer "signalements" threshold + block setting with rule preview, "locked" event in history, locked alerts (banner + toast) on results page, locked count on dashboard, history filter for flags only
- Iteration 7: unlock dialog (grant +1/+2 signalements keeping counter, or reset), teacher message shown to student on unlock (must confirm reading), detailed history: pasted/copied text snippets, time away per exit, activity summary by category
- Iteration 8: surveillance report PDF (summary table + per-student timeline), live teacher warnings to student during exam (presets, read receipt)
- Iteration 9: Emergent independence — files moved to MongoDB GridFS (Emergent storage removed), CORS multi-origin, requirements-prod.txt, render.yaml, .htaccess for SiteGround, Electron Windows app (desktop/) with kiosk + content protection + nav lock + tool child windows, GitHub Actions build, "Application Windows obligatoire" setting, client badge; guide in /app/DEPLOIEMENT.md
- Iteration 10: MSI target (GPO, fixed upgradeCode), optional signing via GitHub secrets, external config C:\ProgramData\MonExamEnLigne\config.json, desktop tool launch buttons + running detection (tasklist) logged in history, keep-awake workflow + UptimeRobot guide
- Iteration 11: forbidden apps detection (desktop, visible windows), emergency exit code (per exam + offline fallback), teacher lock/reopen/lock-all/unlock-all, class broadcast; deployment checklist in DEPLOIEMENT.md
- P1: Safe Exam Browser config file (.seb) export per exam
- P2: Statistics per question, server-side export with watermark

## 2026-06 — Correctif Antidote / outils de bureau
- Quand Antidote/WordQ/Lexibar sont permis : copier/coller autorisé dans la zone de réponse (`[data-answer-zone]`, événement `clipboard_tool` non compté), sortie plein écran → `fullscreen_exit_tool` (non compté). Copier depuis l'énoncé reste bloqué/compté.
- Note affichée à l'enseignant dans les réglages (desktop-tools-notice). Détection des logiciels seulement dans l'app Windows (.msi).
- Testé : iteration_5.json (62/62 backend, E2E OK).

## 2026-06 — Bouton Antidote + historique des collages
- Bouton « Corriger avec Antidote » dans l'éditeur (si Antidote permis) : copie le texte, ouvre Antidote dans l'app Windows, événement `antidote_correct` (non compté).
- Les collages dans la zone de réponse envoient le texte (`text`, max 3000 car.) ; `PasteHistory.jsx` l'affiche à l'enseignant dans la fiche élève.
- Instructions de déploiement (Siteground + Atlas + Render + .msi) remises dans le chat ; détails dans /app/DEPLOIEMENT.md.
- Testé : iteration_6.json (66/66 backend, E2E OK).

## 2026-06 — Alerte collage, comparaison, guide Antidote, production écrite
- Backend : `clipboard_tool` stocke words/similarity/before_words/suspect (≥40 mots) ; `text_similarity()`.
- Surveillance en direct (Results.jsx) : toast « Collage important » + badge ambre sur la carte élève.
- PasteHistory : verdict par collage (correction / remanié / texte nouveau / zone vide).
- ExamIntro : guide Antidote en 5 étapes si Antidote permis.
- Section « Production écrite » avec compteur de mots (SessionDetail + export CopyContent), compteur sur réponses longues.
- Testé : iteration_7.json (70/70 backend, E2E OK).

## 2026-06 — Comptes gérés par l'admin
- Inscription publique supprimée (`/auth/register` retiré). `ADMIN_EMAIL` = rôle `admin` (forcé au démarrage).
- Page `/enseignant/comptes` (admins) : créer des comptes (mot de passe temporaire généré), nommer/retirer admin, désactiver/réactiver, réinitialiser le mot de passe. Protections : pas d'auto-rétrogradation/désactivation.
- Changement de mot de passe obligatoire à la 1re connexion (`must_change_password`, page `/enseignant/mot-de-passe`), aussi accessible via icône clé dans la nav.
- Comptes désactivés : 403 au login et sur toutes les routes.
- Testé : iteration_8.json (17/17 backend, E2E OK).

## 2026-06 — Courriel de bienvenue, import, journal admin
- `mailer.py` : SMTP (smtp2go, STARTTLS 2525) via env SMTP_HOST/PORT/USERNAME/PASSWORD, MAIL_FROM(_NAME). Envoi à la création d'un compte et à la réinitialisation (`email_sent` dans la réponse). GET /admin/mail-status.
- POST /admin/users/import (Nom;courriel par ligne) → comptes + mots de passe générés + courriels.
- Journal : collection `login_log` (à chaque login) ; GET /admin/activity (examens par enseignant, connexions). Onglet « Journal d'activité » dans la page Comptes.
- Testé : iteration_9.json.

## 2026-06 — Navigation + outils de bureau (desktop 1.1.0)
- Boutons retour : Login → accueil ; en-tête enseignant → « Espace élève » ; accueil → « Retour à l'espace enseignant » si connecté.
- Antidote : flux Ctrl+C+C (Agent Antidote) ; bouton sélectionne le texte ; plus de lancement d'Antidote.exe (ouvrait les dictionnaires).
- Desktop : détection des exécutables par jokers (`search`), WordQ 5/6 et Lexibar ; processus multiples (`processes`) ; auto-ouverture WordQ/Lexibar au début de l'examen (`autoLaunchTools`) ; `tools-installed` IPC ; avertissement si outil non trouvé.
- Anti-triche desktop : fenêtre recouverte (document.hidden) avec outils permis → `external_focus` non compté.
- Testé : iteration_10.json (frontend OK). Desktop non testable ici.

## 2026-06 — Pré-vérification des applications (desktop 1.1.1)
- PreCheck.jsx (desktop seulement) : liste les applications interdites ouvertes avant le démarrage, bouton « Fermer automatiquement » (IPC close-forbidden → taskkill), démarrage bloqué tant que non propre.
- main.js : filtre des fenêtres cachées (OleMainThreadWndName, Default IME…) pour éviter les faux positifs Edge/Teams en arrière-plan ; WordQ → WordQ.exe/WordQ6.exe (plus WordQMouse.exe) ; tri des exécutables par nom le plus court.
- Antidote : bouton barre d'outils = rappel Ctrl+C+C ; indication pour activer l'Agent Antidote (Réglages → Connectix).
- Testé : iteration_11.json (mock window.monExam).

## 2026-06 — Intégration Antidote Connectix (desktop 1.2.0)
- `lib/antidote.js` : AgentTexteur TipTap via `@druide-informatique/antidote-api-js` (WebSocket ws://localhost:PORT d'AgentConnectix) ; corrections appliquées directement dans l'éditeur.
- main.js : IPC `antidote-port` (registre HKLM\SOFTWARE\Druide informatique inc.\Connectix → AgentConnectixConsole.exe --api), cache 60 s.
- Bouton « Corriger avec Antidote » : API Connectix si disponible, sinon repli Ctrl+C+C.
- Testé : iteration_12.json (replis). WebSocket réel non testable ici.

## 2026-06 — Dictionnaires/Guides Antidote + rapport outils
- RichEditor : boutons « Dictionnaires » et « Guides » (desktop + Connectix) via lanceDictionnaires/lanceGuides sur le mot sélectionné ; événements antidote_dict / antidote_guide.
- `lib/toolUsage.js` : agrégation durée d'ouverture (tool_opened/closed), consultations web (tool_focus/returned), actions Antidote, collages. Affiché dans SessionDetail (ToolUsageCard) et dans le rapport PDF (colonne + bloc par élève).
- Testé : iteration_13.json.

## 2026-06 — Fermeture des applis + avant-plan WordQ (desktop 1.2.1)
- close-forbidden : taskkill en parallèle avec timeout 6 s, repli PowerShell Stop-Process ; PreCheck : timeout 20 s + avertissement si applis restantes.
- Filtre fenêtres cachées élargi (OLE*, *Broker*, Push Notifications).
- bringToFront (PowerShell SetForegroundWindow) après lancement ; IPC focus-tool ; bouton outil déjà ouvert → avant-plan ; alwaysOnTop relâché quand des outils desktop sont permis.
- Testé : iteration_14.json (mocks).

## 2026-06 — Scan rapide + temps/outils en direct (desktop 1.2.2)
- scanForbidden : PowerShell Get-Process limité aux processus interdits (bien plus rapide que tasklist /v) ; PreCheck sans scans concurrents (6 s).
- Enseignant : +5/+10/+15 min pendant l'examen ; panneau « Outils permis pour cet élève » (PUT /sessions/{id}/tools → tools_override, fusionné dans GET /student/session). Élève : toast + outil ajouté dans la barre en ≤5 s.
- Testé : iteration_15.json.

## 2026-06 — Correctifs Antidote reconnexion + scan robuste (desktop 1.2.3)
- antidote.js : reconnexion automatique quand la WebSocket Connectix est fermée (impl.estInitialise), cache réinitialisé à sessionTerminee, erreur explicite au lieu d'un clic muet.
- main.js : scanForbidden PowerShell (chemin complet, -ExecutionPolicy Bypass) avec repli tasklist /v en cas d'échec ; journalisation détaillée.
- Testé : iteration_16.json (WebSocket simulée).

## 2026-06 — Pause (examen, élève, tous les examens) + Lexibar (desktop 1.2.4)
- Backend : exam.paused_at/pause_message, session.paused_at/paused_seconds ; deadline_of ajoute le temps de pause ; POST /exams/{id}/pause|resume, /exams/pause-many|resume-many, /sessions/{id}/pause|resume ; GET /student/session → paused, pause_message.
- Frontend : PausedOverlay (élève, chronomètre figé, anti-triche inactif) ; PauseControls.jsx (ExamPauseControl dans ClassControls, SessionPauseControl dans SessionDetail, AllExamsPauseControl dans Dashboard) ; badges « En pause ».
- Lexibar : chemins LexibarLP5X / Haylem ajoutés (config.json).
- Testé : iteration_17.json.

## 2026-06 — Confirmation de remise (desktop 1.2.5)
- POST /student/submit retourne un reçu (code 8 car., heure, questions répondues, mots, annotations) ; idempotent.
- SubmittedScreen : reçu + bouton « Fermer l'application » (IPC quit-app) ; dialogue de remise : questions sans réponse + nb de mots ; remise avec 6 tentatives et avertissement « NE FERMEZ PAS ».
- Testé : iteration_18.json.

## 2026-06 — Bonnes réponses QCM (multi) + consignes/corrigé
- Question: `correct` (indices, plusieurs possibles), `hint` (élève), `expected` (enseignant). Masqués côté élève (`public_exam`), flag `multi` exposé.
- Élève : cases à cocher si plusieurs bonnes réponses (réponse = liste), sinon radio ; `hint` affiché.
- Enseignant : badge ✓/✗ auto + points/score préremplis dans SessionDetail ; corrigé affiché. Testé iteration_19 (6/6 backend, e2e OK).
