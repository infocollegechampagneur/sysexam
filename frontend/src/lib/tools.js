export const TOOLS = [
  { id: "antidote", label: "Antidote", kind: "desktop", desc: "Correcteur et dictionnaires (logiciel installé sur le poste)" },
  { id: "wordq", label: "WordQ", kind: "desktop", desc: "Prédiction de mots et synthèse vocale (logiciel installé)" },
  { id: "lexibar", label: "Lexibar", kind: "desktop", desc: "Barre d'aide à l'écriture (logiciel installé)" },
  { id: "usito", label: "Usito", kind: "web", url: "https://usito.usherbrooke.ca/", desc: "Dictionnaire en ligne — usito.usherbrooke.ca" },
  { id: "wordreference", label: "WordReference", kind: "web", url: "https://www.wordreference.com/fren/", desc: "Dictionnaire bilingue — wordreference.com" },
];

export const EXAM_TYPES = [
  { id: "form", label: "Formulaire", desc: "Choix multiples, réponses courtes et questions à développement, comme Microsoft Forms." },
  { id: "redaction", label: "Rédaction", desc: "Un sujet et un éditeur de texte enrichi de type Word pour une composition libre." },
  { id: "document", label: "Document téléversé", desc: "Votre fichier PDF ou Word affiché à l'élève, avec zone de réponse et questions optionnelles." },
];

export const STATUS_LABELS = { draft: "Brouillon", open: "Ouvert", closed: "Fermé" };
export const SESSION_LABELS = { in_progress: "En cours", locked: "Bloqué", submitted: "Remis" };

export const EVENT_LABELS = {
  joined: "Début", rejoined: "Reconnexion", submitted: "Remise", unlocked: "Déverrouillage",
  tab_hidden: "Autre onglet / site web", window_blur: "Autre fenêtre / application", fullscreen_exit: "Sortie plein écran",
  paste_attempt: "Coller bloqué", copy_attempt: "Copier bloqué", cut_attempt: "Couper bloqué",
  shortcut: "Raccourci bloqué", devtools: "Outils dév.", print_attempt: "Impression/capture",
  contextmenu: "Clic droit", tool_focus: "Outil web permis", external_focus: "Logiciel externe (permis)",
  fullscreen_exit_tool: "Plein écran (outil)", returned: "Retour dans l'examen", time_up: "Temps écoulé",
  locked: "Examen bloqué", extra_time: "Temps supp.", message_read: "Message lu", teacher_message: "Avertissement envoyé",
  clipboard_tool: "Copier/coller (zone de réponse, permis)", antidote_correct: "Correction Antidote", antidote_dict: "Dictionnaires Antidote", antidote_guide: "Guides Antidote", tool_opened: "Logiciel permis ouvert", tool_closed: "Logiciel permis fermé", tool_launch: "Lancement d'un logiciel permis",
  forbidden_app: "Application interdite", emergency_exit: "Sortie d'urgence", emergency_exit_failed: "Code d'urgence incorrect", reopened: "Copie rouverte",
};

export const COUNTED = new Set(["tab_hidden", "window_blur", "fullscreen_exit", "paste_attempt", "copy_attempt", "cut_attempt", "shortcut", "devtools", "print_attempt", "forbidden_app"]);

export const stripHtml = (html) => {
  const d = document.createElement("div");
  d.innerHTML = html || "";
  return d.textContent || "";
};

export const wordCount = (html) => (stripHtml(html).trim().match(/\S+/g) || []).length;

export const fmtTime = (iso) => (iso ? new Date(iso).toLocaleString("fr-CA", { dateStyle: "short", timeStyle: "medium" }) : "—");
