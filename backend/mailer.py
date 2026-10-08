import os
import smtplib
import ssl
import logging
from email.message import EmailMessage
from html import escape

log = logging.getLogger("mailer")


def mail_configured() -> bool:
    return all(os.environ.get(k) for k in ("SMTP_HOST", "SMTP_USERNAME", "SMTP_PASSWORD", "MAIL_FROM"))


def site_url() -> str:
    return os.environ["FRONTEND_URL"].split(",")[0].strip().rstrip("/")


def send_mail(to: str, subject: str, text: str, html: str) -> None:
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = f"{os.environ.get('MAIL_FROM_NAME', 'MonExamEnLigne')} <{os.environ['MAIL_FROM']}>"
    msg["To"] = to
    msg.set_content(text)
    msg.add_alternative(html, subtype="html")
    with smtplib.SMTP(os.environ["SMTP_HOST"], int(os.environ.get("SMTP_PORT", "2525")), timeout=20) as smtp:
        smtp.ehlo()
        smtp.starttls(context=ssl.create_default_context())
        smtp.ehlo()
        smtp.login(os.environ["SMTP_USERNAME"], os.environ["SMTP_PASSWORD"])
        smtp.send_message(msg)


def welcome_message(name: str, email: str, password: str, reset: bool = False) -> tuple[str, str, str]:
    url = site_url()
    title = "Votre mot de passe a été réinitialisé" if reset else "Bienvenue sur MonExamEnLigne"
    intro = "Votre administrateur a réinitialisé votre mot de passe." if reset else "Un compte enseignant a été créé pour vous sur MonExamEnLigne, la plateforme d'examens sécurisés de votre école."
    text = (f"Bonjour {name},\n\n{intro}\n\n"
            f"Adresse du site : {url}/connexion\nCourriel : {email}\nMot de passe temporaire : {password}\n\n"
            "À votre première connexion, vous devrez choisir un nouveau mot de passe.\n\n— L'équipe MonExamEnLigne")
    html = f"""<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#0f172a">
<h2 style="color:#1e3a8a">{title}</h2>
<p>Bonjour {escape(name)},</p><p>{intro}</p>
<table style="border-collapse:collapse;margin:16px 0">
<tr><td style="padding:6px 12px;color:#64748b">Site</td><td style="padding:6px 12px"><a href="{escape(url)}/connexion">{escape(url)}/connexion</a></td></tr>
<tr><td style="padding:6px 12px;color:#64748b">Courriel</td><td style="padding:6px 12px">{escape(email)}</td></tr>
<tr><td style="padding:6px 12px;color:#64748b">Mot de passe temporaire</td><td style="padding:6px 12px;font-family:monospace;font-size:16px;font-weight:bold">{escape(password)}</td></tr>
</table>
<p>À votre première connexion, vous devrez choisir un nouveau mot de passe.</p>
<p style="color:#64748b;font-size:12px">— L'équipe MonExamEnLigne</p></div>"""
    return title, text, html


def send_welcome(to: str, name: str, password: str, reset: bool = False) -> bool:
    if not mail_configured():
        return False
    subject, text, html = welcome_message(name, to, password, reset)
    try:
        send_mail(to, subject, text, html)
        return True
    except Exception as e:  # noqa: BLE001
        log.error("Envoi du courriel à %s échoué : %s", to, type(e).__name__)
        return False


def send_help_alert(to: str, student: str, exam_title: str, reason: str, when: str) -> bool:
    if not mail_configured():
        return False
    subject = f"🙋 {student} a besoin d'aide — {exam_title}"
    text = f"L'élève {student} demande de l'aide pendant l'examen « {exam_title} » ({when}).\n" + (f"Motif : {reason}\n" if reason else "") + f"\nSurveillance : {site_url()}/enseignant"
    html = f"""<div style="font-family:Arial,sans-serif;max-width:560px;color:#0f172a">
<h2 style="color:#b45309;margin:0 0 8px">🙋 {escape(student)} a besoin d'aide</h2>
<p style="margin:0 0 12px">Examen : <strong>{escape(exam_title)}</strong> · {escape(when)}</p>
{f'<p style="margin:0 0 12px">Motif : {escape(reason)}</p>' if reason else ''}
<p><a href="{escape(site_url())}/enseignant" style="background:#1e3a8a;color:#fff;padding:8px 14px;border-radius:6px;text-decoration:none">Ouvrir la surveillance</a></p></div>"""
    try:
        send_mail(to, subject, text, html)
        return True
    except Exception as e:  # noqa: BLE001
        log.error("Alerte d'aide à %s échouée : %s", to, type(e).__name__)
        return False
