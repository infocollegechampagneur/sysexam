# MonExamEnLigne — Héberger l'API à l'école (remplacer Render)

**Objectif :** plus de mise en veille, plus de quota d'heures, et les données d'examen restent au Collège.
Le site web (frontend) reste sur SiteGround ; seuls l'API et la base de données passent sur une machine virtuelle (VM) de l'école.

**Recommandation (le plus facile et le plus stable) :** une VM **Ubuntu Server 24.04 LTS** + **Docker**. Trois « boîtes » démarrent avec une seule commande et redémarrent seules avec la VM :

| Boîte | Rôle |
|---|---|
| `api` | le serveur MonExamEnLigne (FastAPI), 4 processus en parallèle |
| `mongo` | la base de données MongoDB, stockée sur le disque de la VM |
| `caddy` | le HTTPS automatique (certificat Let's Encrypt gratuit, renouvelé seul) |

Capacité : avec **2 vCPU / 4 Go de RAM / 40 Go de disque**, cette configuration tient **500 élèves simultanés** (chaque copie se sauvegarde toutes les 5 secondes ≈ 100 requêtes/s, très loin des limites). Pour plus de marge : 4 vCPU / 8 Go.

> Pourquoi pas Windows Server ? Ça fonctionne aussi (Docker Desktop), mais Ubuntu + Docker demande moins d'entretien, redémarre plus proprement et n'a pas de licence. Si votre hyperviseur est VMware/Proxmox/Hyper-V, créez simplement une VM Ubuntu.

---

## 0. Ce qu'il faut préparer (avant de commencer)

- [ ] Une **VM Ubuntu Server 24.04** allumée en permanence, avec une **adresse IP interne fixe** (ex. `192.168.10.50`).
- [ ] Un **sous-domaine** pour l'API, ex. `api-examen.VOTREDOMAINE.qc.ca`, chez votre registraire (GoDaddy, SiteGround…).
- [ ] **L'IP publique de l'école** (fixe de préférence ; demandez à votre fournisseur Internet). Tapez « quelle est mon ip » dans Google depuis l'école.
- [ ] Sur le **pare-feu / routeur** de l'école : rediriger les ports **80 et 443 (TCP)** de l'IP publique vers l'IP de la VM. C'est la seule ouverture nécessaire. *(Si la TI refuse d'ouvrir des ports, voir l'annexe B « Cloudflare Tunnel ».)*
- [ ] Le dépôt GitHub du projet (celui que « Save to GitHub » alimente).
- [ ] Vos identifiants SMTP2GO (courriels) — déjà utilisés sur Render.

Durée totale : environ **1 h** la première fois.

---

## 1. DNS (5 min)

Chez votre registraire, ajoutez un enregistrement :

| Type | Nom | Valeur | TTL |
|---|---|---|---|
| A | `api-examen` | *IP publique de l'école* | 600 |

Vérification (depuis n'importe quel PC, après 5-30 min) : `nslookup api-examen.VOTREDOMAINE.qc.ca` doit répondre l'IP publique de l'école.

---

## 2. Installer Docker sur la VM (10 min)

Connectez-vous à la VM (console ou SSH) et collez :

```bash
sudo apt update && sudo apt -y upgrade
sudo apt -y install ca-certificates curl git
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
sudo systemctl enable docker
# fuseau horaire et pare-feu de la VM
sudo timedatectl set-timezone America/Toronto
sudo ufw allow OpenSSH && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp && sudo ufw --force enable
```

Déconnectez-vous puis reconnectez-vous (pour que `docker` fonctionne sans `sudo`). Test : `docker compose version`.

---

## 3. Récupérer le code et configurer (10 min)

```bash
cd /opt
sudo git clone https://github.com/VOTRE-COMPTE/VOTRE-DEPOT.git monexam
sudo chown -R $USER:$USER monexam
cd monexam
cp ecole.env.exemple ecole.env
nano ecole.env
```

Remplissez `ecole.env` (une valeur par ligne, **sans guillemets**) :

| Variable | Valeur |
|---|---|
| `API_DOMAIN` | `api-examen.VOTREDOMAINE.qc.ca` |
| `MONGO_URL` | laissez `mongodb://mongo:27017` (base locale) — ou votre chaîne Atlas si vous gardez Atlas (annexe A) |
| `DB_NAME` | `monexam` |
| `FRONTEND_URL` | `https://examen.VOTREDOMAINE.qc.ca` (adresse du site sur SiteGround) |
| `CORS_ORIGINS` | même valeur que `FRONTEND_URL` |
| `JWT_SECRET` | une longue chaîne aléatoire : générez-la avec `openssl rand -hex 32` |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | compte administrateur créé au premier démarrage **si la base est vide** |
| `SMTP_*`, `MAIL_FROM*` | copiez les valeurs qui sont dans Render → Environment |

> Si vous importez vos données depuis Render/Atlas (étape 5), vos comptes existants seront conservés ; `ADMIN_EMAIL/PASSWORD` ne servent que pour une base neuve.

Enregistrez (Ctrl+O, Entrée, Ctrl+X).

---

## 4. Démarrer (5 min)

```bash
cd /opt/monexam
# ports 80/443 libres :            docker compose --profile https up -d --build
# ports 80/443 déjà utilisés :     docker compose --profile tunnel up -d --build   (jeton CF_TUNNEL_TOKEN dans ecole.env, voir annexe B)
docker compose --profile https up -d --build
docker compose ps          # les 3 services doivent être « running / healthy »
docker compose logs -f api # Ctrl+C pour quitter
```

Caddy obtient le certificat HTTPS automatiquement à la première visite (il faut que le DNS et la redirection des ports 80/443 soient en place). Test depuis un PC **à l'extérieur de l'école** (ou un téléphone en données cellulaires) :

```
https://api-examen.VOTREDOMAINE.qc.ca/api/
```

→ doit afficher `{"message":"MonExamEnLigne API"}` (ou similaire) avec le cadenas HTTPS.

> **Test depuis l'intérieur de l'école qui échoue mais réussit de l'extérieur ?** C'est le « NAT hairpin » de certains routeurs. Solution : dans votre DNS interne (serveur Windows/AD), créez `api-examen.VOTREDOMAINE.qc.ca` → `192.168.10.50` (IP interne de la VM).

---

## 5. Rapatrier les données de Render / Atlas (10 min, une seule fois)

Les examens, comptes, classes et copies sont dans MongoDB Atlas. Pour les copier dans la base de l'école :

1. Dans Atlas → **Database → Connect → Shell**, copiez la chaîne de connexion (`mongodb+srv://utilisateur:motdepasse@cluster0.xxxxx.mongodb.net/`). Elle est aussi dans Render → Environment → `MONGO_URL`.
2. Sur la VM :

```bash
cd /opt/monexam
ATLAS='mongodb+srv://utilisateur:motdepasse@cluster0.xxxxx.mongodb.net/'
docker compose exec -T mongo sh -c "mongodump --uri='$ATLAS' --db=NOM_DE_LA_BASE_SUR_ATLAS --archive --gzip" > sauvegardes/atlas.gz
docker compose exec -T mongo sh -c "mongorestore --archive --gzip --nsFrom='NOM_DE_LA_BASE_SUR_ATLAS.*' --nsTo='monexam.*' --drop" < sauvegardes/atlas.gz
docker compose restart api
```

`NOM_DE_LA_BASE_SUR_ATLAS` = la valeur `DB_NAME` dans Render → Environment. Les fichiers PDF/Word des examens (GridFS) sont inclus dans la copie.

3. Connectez-vous ensuite à l'API de l'école avec vos comptes habituels (voir étape 6).

---

## 6. Brancher le site SiteGround sur la nouvelle API (10 min)

Le site doit appeler `https://api-examen.VOTREDOMAINE.qc.ca` au lieu de Render.

1. Dans le dépôt GitHub : **Actions → Site web → Run workflow**, et dans le champ `backend_url` entrez `https://api-examen.VOTREDOMAINE.qc.ca`. Téléchargez ensuite l'archive produite (section *Artifacts*) et téléversez son contenu dans le FTP SiteGround (`public_html`), comme d'habitude.
   *(Si vous construisez le site sur votre PC : `REACT_APP_BACKEND_URL=https://api-examen.VOTREDOMAINE.qc.ca yarn build` puis téléversez `build/`.)*
2. Application Windows : dans `desktop/config.json`, mettez la nouvelle adresse dans `"url"` et incrémentez `"version"` dans `desktop/package.json` → un nouveau `.msi` est produit par GitHub → déploiement GPO.
3. Vérifiez : connexion enseignant, création d'un examen test, passage côté élève depuis un poste de l'école **et** de l'extérieur.
4. Quand tout fonctionne : dans Render, **Suspend** (ou supprimez) le service — et supprimez le flux GitHub `keep-awake.yml` (plus nécessaire). Gardez Atlas en lecture quelques semaines comme filet de sécurité, puis supprimez-le si vous le voulez.

---

## 7. Exploitation au quotidien

### Démarrage automatique
Les services ont `restart: unless-stopped` : après une panne de courant ou un redémarrage de la VM, tout repart seul (Docker démarre au boot).

### Mettre à jour après un « Save to GitHub »
```bash
cd /opt/monexam && ./mise-a-jour.sh
```
(30 à 60 secondes d'interruption ; ne faites pas ça pendant un examen.)

### Sauvegardes (indispensable)
`sauvegarde.sh` crée une archive compressée de la base dans `/opt/monexam/sauvegardes/` et garde 30 jours. Programmez-la chaque nuit :
```bash
crontab -e
# ajoutez :
30 2 * * * cd /opt/monexam && ./sauvegarde.sh >> sauvegardes/journal.log 2>&1
```
Copiez régulièrement le dossier `sauvegardes/` ailleurs (NAS, OneDrive de l'école) ; mieux : faites aussi une **sauvegarde de la VM entière** par votre hyperviseur chaque semaine.

Restaurer une sauvegarde :
```bash
docker compose exec -T mongo mongorestore --archive --gzip --drop < sauvegardes/monexam_2026-10-27_0230.gz
```

### Voir ce qui se passe
```bash
docker compose ps                 # état
docker compose logs -f api        # journal de l'API
docker compose logs -f caddy      # certificats / HTTPS
docker stats                      # CPU / mémoire en direct
df -h                             # espace disque
```

### Mises à jour système
Une fois par mois, hors examen : `sudo apt update && sudo apt -y upgrade && sudo reboot`.

---

## 8. Plan B en cas de panne de la VM

Le code est sur GitHub et les sauvegardes dans `sauvegardes/`. Pour redémarrer ailleurs en 20 minutes : refaire les étapes 2-4 sur une autre machine, restaurer la dernière sauvegarde (section 7), et pointer le DNS `api-examen` vers la nouvelle IP. Render peut aussi être réactivé temporairement (son `MONGO_URL` Atlas doit alors recevoir vos données : même commande `mongorestore` avec l'URI Atlas).

---

## Annexe A — Garder MongoDB Atlas plutôt qu'une base locale

Possible : dans `ecole.env`, mettez `MONGO_URL=mongodb+srv://…` (chaîne Atlas) et `DB_NAME` identique à Render, puis `docker compose up -d`. Le service `mongo` tournera pour rien (vous pouvez le laisser). Limites du forfait gratuit Atlas : 512 Mo de stockage et 500 connexions ; avec 4 processus API c'est suffisant, mais **500 élèves qui sauvegardent toutes les 5 s** solliciteront Atlas via Internet : la base locale (recommandée) est plus rapide et sans plafond. Dans tous les cas, gardez la sauvegarde quotidienne.

## Annexe B — Si la TI refuse d'ouvrir les ports 80/443 : Cloudflare Tunnel

Gratuit, aucun port entrant. Condition : le domaine doit utiliser les **serveurs DNS de Cloudflare** (gratuit ; on change les « nameservers » chez le registraire, le site SiteGround continue de fonctionner tel quel). Ensuite : Cloudflare → **Zero Trust → Networks → Tunnels → Create tunnel (cloudflared)**, choisissez Docker et copiez le jeton ; ajoutez au `docker-compose.yml` :

```yaml
  tunnel:
    image: cloudflare/cloudflared:latest
    restart: unless-stopped
    command: tunnel --no-autoupdate run --token VOTRE_JETON
    depends_on: [api]
```

Dans le tunnel, ajoutez un **Public hostname** `api-examen.VOTREDOMAINE.qc.ca` → service `http://api:8001`. Le service `caddy` devient inutile (retirez-le ou laissez-le). Pensez à augmenter la limite de téléversement Cloudflare (100 Mo gratuit, suffisant pour les documents d'examen de 20 Mo).

## Annexe C — Windows Server plutôt qu'Ubuntu

Installez **Docker Desktop** (avec WSL 2), ouvrez PowerShell dans le dossier du dépôt cloné et exécutez les mêmes commandes `docker compose …`. Pour le démarrage automatique : Docker Desktop → Settings → *Start Docker Desktop when you sign in* + ouverture de session automatique du compte de service. Les scripts `.sh` se remplacent par les commandes équivalentes (`docker compose exec -T mongo mongodump …`). C'est fonctionnel, mais moins robuste qu'Ubuntu au redémarrage.
