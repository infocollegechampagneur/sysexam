#!/usr/bin/env python3
"""Test de charge MonExamEnLigne : simule N élèves qui font un examen (poll 5 s + sauvegarde 8 s), puis affiche les temps de réponse.

Prérequis : Python 3.9+ et `pip install httpx` (ou `pip install -r` rien d'autre).
Usage :  python3 test-charge.py --url https://api-examen.champagneur.qc.ca --code ABC123 --eleves 500 --minutes 5
Préparez un examen de TEST ouvert, SANS liste de classe, sans « application Windows obligatoire », sans plage horaire.
Les copies créées s'appellent « Test charge 0001 »… : supprimez-les ensuite avec « Vider les copies » (Suivi).
"""
import argparse
import asyncio
import random
import statistics
import time

import httpx

p = argparse.ArgumentParser()
p.add_argument("--url", required=True, help="Adresse de l'API, sans /api")
p.add_argument("--code", required=True, help="Code de l'examen de test (ouvert)")
p.add_argument("--eleves", type=int, default=500)
p.add_argument("--minutes", type=float, default=5)
p.add_argument("--entree", type=float, default=60, help="Secondes pour faire entrer tous les élèves (étalement)")
args = p.parse_args()

BASE = args.url.rstrip("/") + "/api"
TEXTE = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. " * 40
stats = {"join": [], "poll": [], "save": [], "erreurs": 0, "codes": {}}
fin = time.monotonic() + args.minutes * 60
actifs = 0


def note(kind, t0, r):
    stats[kind].append((time.monotonic() - t0) * 1000)
    if r.status_code >= 400:
        stats["erreurs"] += 1
        stats["codes"][r.status_code] = stats["codes"].get(r.status_code, 0) + 1


async def eleve(i, client):
    global actifs
    await asyncio.sleep(random.uniform(0, args.entree))
    t0 = time.monotonic()
    try:
        r = await client.post(f"{BASE}/student/join", json={"code": args.code, "student_name": f"Test charge {i:04d}", "student_number": f"TC{i:04d}"})
        note("join", t0, r)
        if r.status_code != 200:
            return
        tok = r.json()["token"]
    except Exception:
        stats["erreurs"] += 1
        return
    h = {"X-Session-Token": tok}
    actifs += 1
    prochain_poll = prochain_save = time.monotonic()
    texte = ""
    while time.monotonic() < fin:
        now = time.monotonic()
        try:
            if now >= prochain_poll:
                t0 = time.monotonic()
                note("poll", t0, await client.get(f"{BASE}/student/session", headers=h))
                prochain_poll = now + 5
            if now >= prochain_save:
                texte += TEXTE[: random.randint(20, 120)]
                t0 = time.monotonic()
                note("save", t0, await client.put(f"{BASE}/student/answers", headers=h, json={"answers": {"q1": texte[-500:]}, "essay_html": f"<p>{texte}</p>", "annotations": []}))
                prochain_save = now + 8
        except Exception:
            stats["erreurs"] += 1
        await asyncio.sleep(0.25)
    actifs -= 1


async def moniteur():
    while time.monotonic() < fin:
        await asyncio.sleep(15)
        p95 = statistics.quantiles(stats["poll"][-2000:], n=20)[18] if len(stats["poll"]) > 20 else 0
        print(f"[{int(args.minutes * 60 - (fin - time.monotonic())):>4}s] élèves actifs : {actifs:>4} | requêtes : {len(stats['poll']) + len(stats['save']):>7} | p95 poll : {p95:6.0f} ms | erreurs : {stats['erreurs']}", flush=True)


def resume(kind):
    v = stats[kind]
    if not v:
        return f"  {kind:5s} : aucune requête"
    q = statistics.quantiles(v, n=100)
    return f"  {kind:5s} : {len(v):>7} req | médiane {statistics.median(v):6.0f} ms | p95 {q[94]:6.0f} ms | p99 {q[98]:6.0f} ms | max {max(v):6.0f} ms"


async def main():
    print(f"Test : {args.eleves} élèves, {args.minutes} min, entrée étalée sur {args.entree} s → {BASE} (code {args.code})")
    limits = httpx.Limits(max_connections=args.eleves + 50, max_keepalive_connections=args.eleves + 50)
    async with httpx.AsyncClient(timeout=30, limits=limits, http2=False) as client:
        r = await client.get(f"{BASE}/student/exam-info/{args.code}")
        if r.status_code != 200:
            return print("Impossible de joindre l'API :", r.status_code, r.text[:200])
        await asyncio.gather(moniteur(), *(eleve(i, client) for i in range(1, args.eleves + 1)))
    total = len(stats["join"]) + len(stats["poll"]) + len(stats["save"])
    print("\n===== RÉSULTAT =====")
    print(resume("join")); print(resume("poll")); print(resume("save"))
    print(f"  total : {total} requêtes en {args.minutes} min ≈ {total / (args.minutes * 60):.0f} req/s | erreurs : {stats['erreurs']} {stats['codes'] or ''}")
    p95 = statistics.quantiles(stats["poll"], n=20)[18] if len(stats["poll"]) > 20 else 0
    verdict = "EXCELLENT" if p95 < 300 and not stats["erreurs"] else "CORRECT" if p95 < 1000 and stats["erreurs"] < total * 0.01 else "INSUFFISANT — réduire le nombre d'élèves simultanés ou augmenter la VM"
    print(f"  verdict : {verdict} (p95 des vérifications de session = {p95:.0f} ms ; objectif < 300 ms, acceptable < 1 s)")


asyncio.run(main())
