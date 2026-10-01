import uuid


def _q(type_, text, options=None, points=1):
    return {"id": str(uuid.uuid4()), "type": type_, "text": text, "options": options or [], "points": points}


def sample_exams():
    return [
        {
            "title": "Examen de français – Synthèse de texte",
            "subject": "Français, 4e secondaire",
            "instructions": "Lisez attentivement chaque question. Vous pouvez utiliser Antidote et le dictionnaire Usito.",
            "exam_type": "form",
            "duration_minutes": 60,
            "questions": [
                _q("mcq", "Quel est le participe passé du verbe « résoudre » ?", ["résolu", "résout", "résoudu", "résolvé"], 1),
                _q("short", "Donnez un synonyme du mot « éphémère ».", points=1),
                _q("long", "Résumez en 150 mots les principaux arguments du texte « L'école de demain ».", points=8),
            ],
            "writing_prompt": "",
            "settings": {"allowed_tools": ["antidote", "usito"], "max_violations": 3, "lock_on_max": True,
                         "require_fullscreen": True, "block_clipboard": True, "browser_spellcheck": False},
            "status": "open",
            "code": "FRA401",
        },
        {
            "title": "Rédaction d'histoire – La Révolution tranquille",
            "subject": "Histoire du Québec et du Canada",
            "instructions": "Rédigez un texte argumentatif d'environ 500 mots. WordQ et Lexibar sont permis.",
            "exam_type": "redaction",
            "duration_minutes": 90,
            "questions": [],
            "writing_prompt": "Dans quelle mesure la Révolution tranquille a-t-elle transformé la société québécoise ? Appuyez votre réponse sur au moins trois faits historiques.",
            "settings": {"allowed_tools": ["wordq", "lexibar", "antidote", "usito", "wordreference"], "max_violations": 5,
                         "lock_on_max": True, "require_fullscreen": True, "block_clipboard": True, "browser_spellcheck": False},
            "status": "open",
            "code": "HIS301",
        },
        {
            "title": "Évaluation de mathématiques SN4",
            "subject": "Mathématiques, séquence SN",
            "instructions": "Montrez toutes vos démarches. Aucun outil d'aide n'est permis.",
            "exam_type": "form",
            "duration_minutes": 75,
            "questions": [
                _q("mcq", "Quelle est la pente de la droite passant par (1, 2) et (3, 8) ?", ["2", "3", "4", "6"], 2),
                _q("long", "Résolvez le système : 2x + y = 7 et x − y = 2. Montrez votre démarche.", points=4),
            ],
            "writing_prompt": "",
            "settings": {"allowed_tools": [], "max_violations": 2, "lock_on_max": True,
                         "require_fullscreen": True, "block_clipboard": True, "browser_spellcheck": False},
            "status": "draft",
            "code": "MAT402",
        },
    ]
