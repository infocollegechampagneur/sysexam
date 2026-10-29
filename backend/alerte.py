"""Envoie un courriel d'alerte à ADMIN_EMAIL. Usage : python alerte.py "Sujet" "Texte" (appelé par surveillance.sh / sauvegarde.sh)."""
import sys
from dotenv import load_dotenv

load_dotenv()
from mailer import send_ops_alert  # noqa: E402

ok = send_ops_alert(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "")
print("alerte envoyée" if ok else "alerte NON envoyée (SMTP/ADMIN_EMAIL non configurés)")
sys.exit(0 if ok else 1)
