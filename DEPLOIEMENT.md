# MonExamEnLigne : héberger l'application sans Emergent

## 1. Vue d'ensemble

| Élément | Où | Coût |
|---|---|---|
| Site web (ce que voient élèves et enseignants) | **SiteGround**, sous-domaine `examen.votredomaine.com` | Inclus dans votre forfait |
| Serveur de l'application (API Python) | **Render.com**, sous-domaine `api-examen.votredomaine.com` | Gratuit pour essayer, environ 7 $ US/mois recommandé |
| Base de données + fichiers PDF/Word | **MongoDB Atlas**, forfait M0 | Gratuit (512 Mo) |
| Application Windows | Fichier `.exe` installé sur les postes | Gratuit |

**Pourquoi pas tout chez SiteGround ?** SiteGround est un hébergement mutualisé. Il sert très bien un site web, mais il ne fait pas tourner un serveur Python en continu ni MongoDB. Seul le site web va donc sur SiteGround, et le serveur va sur Render.

**Les fichiers PDF/Word** sont maintenant enregistrés **dans la base MongoDB** (GridFS). Il n'y a ni stockage externe, ni OneDrive ni SharePoint à configurer, ni dépendance à Emergent.

> Si vous changez d'hébergeur plus tard (par exemple pour un serveur VPS), il suffit de copier le dossier `frontend/build` et de lancer le serveur Python au même endroit. La base de données Atlas ne bouge pas.

---

## 2. Base de données : MongoDB Atlas (environ 10 minutes)

1. Créez un compte sur https://www.mongodb.com/cloud/atlas/register.
2. Choisissez **Create cluster → M0 (Free)**, région **AWS / Montréal (ca-central-1)** si elle est offerte, sinon N. Virginia.
3. **Database Access** : créez un utilisateur, par exemple `monexam`, avec un mot de passe fort.
4. **Network Access** : ajoutez `0.0.0.0/0` (Render n'a pas d'adresse IP fixe en forfait gratuit).
5. **Connect → Drivers** : copiez l'adresse, qui ressemble à
   `mongodb+srv://monexam:MOTDEPASSE@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority`

---

## 3. Récupérer le code

Dans Emergent : **Save → Save to GitHub**. Vous obtenez un dépôt GitHub qui contient :

```
backend/    → serveur Python (FastAPI)
frontend/   → site web (React)
desktop/    → application Windows (Electron)
render.yaml → configuration Render
```

---

## 4. Serveur : Render.com (environ 15 minutes)

1. Créez un compte sur https://render.com et connectez votre GitHub.
2. Choisissez **New → Blueprint**, puis votre dépôt. Render lit `render.yaml` automatiquement.
3. Remplissez les variables d'environnement :

| Variable | Valeur |
|---|---|
| `MONGO_URL` | L'adresse Atlas de l'étape 2 |
| `DB_NAME` | `monexamenligne` |
| `JWT_SECRET` | Générée automatiquement |
| `FRONTEND_URL` | `https://examen.votredomaine.com` (pour en ajouter d'autres, séparez-les par des virgules) |
| `ADMIN_EMAIL` | Votre courriel d'enseignant principal |
| `ADMIN_PASSWORD` | Un mot de passe fort |

4. Déployez. Testez ensuite `https://monexamenligne-api.onrender.com/api/`, qui doit répondre `{"message":"MonExamEnLigne API"}`.
5. **Domaine personnalisé** : dans Render, allez dans **Settings → Custom Domains** et ajoutez `api-examen.votredomaine.com`. Render vous indique un enregistrement **CNAME** à créer.
6. Dans **SiteGround → Domaine → Zone DNS**, ajoutez ce **CNAME** : nom `api-examen`, valeur `monexamenligne-api.onrender.com`. Le certificat SSL est créé automatiquement par Render.

> **Important pour les jours d'examen :** en forfait gratuit, Render met le serveur en veille après 15 minutes d'inactivité. Le premier accès prend alors environ 1 minute. Prenez le forfait **Starter (environ 7 $ US/mois)** avant d'utiliser l'application avec une classe.

---

## 5. Site web : SiteGround (environ 15 minutes)

### 5.1 Créer le sous-domaine
**Site Tools → Domaine → Sous-domaines** : créez `examen`. Un dossier `examen.votredomaine.com/public_html` est créé. Activez ensuite le **SSL** (Let's Encrypt) pour ce sous-domaine dans **Sécurité → Gestionnaire SSL**.

### 5.2 Construire le site (une fois, sur votre ordinateur)
Installez **Node.js 20** (https://nodejs.org) et **Yarn** (`corepack enable`), puis :

```bash
cd frontend
yarn install
```

Sous Windows (PowerShell) :
```powershell
$env:REACT_APP_BACKEND_URL="https://api-examen.votredomaine.com"; yarn build
```
Sous macOS ou Linux :
```bash
REACT_APP_BACKEND_URL=https://api-examen.votredomaine.com yarn build
```

### 5.3 Envoyer les fichiers
Avec le **Gestionnaire de fichiers** de SiteGround ou par FTP, copiez **tout le contenu** du dossier `frontend/build/` dans `examen.votredomaine.com/public_html/`.

Le fichier `.htaccess` est déjà inclus : il permet aux adresses comme `/examen` ou `/enseignant` de fonctionner quand on rafraîchit la page. Activez l'affichage des fichiers cachés pour vérifier qu'il a bien été copié.

### 5.4 Tester
Ouvrez `https://examen.votredomaine.com`, cliquez sur **Espace enseignant**, puis connectez-vous avec `ADMIN_EMAIL` / `ADMIN_PASSWORD`. Trois examens d'exemple sont créés automatiquement au premier démarrage.

---

## 6. Application Windows

L'application ouvre votre site `https://examen.votredomaine.com` dans une fenêtre sécurisée. **Oui, elle parle directement avec votre sous-domaine.** Pendant un examen, elle :

- passe en **mode kiosque** : plein écran sans barre des tâches, impossible à fermer avant la remise ;
- **bloque les captures d'écran** : une capture donne une image noire ;
- **empêche d'aller sur un autre site** : seuls votre site, Usito et WordReference s'ouvrent, dans une fenêtre interne ;
- bloque F5, F11, F12, Alt+F4, Ctrl+R/W/N/T/P/S/U et les outils de développement ;
- continue d'enregistrer dans l'historique tous les signalements du site web (Alt+Tab, copier-coller…).

Elle sert aussi aux enseignants : il suffit de cliquer sur « Espace enseignant ».

### 6.1 Indiquer votre adresse
Dans `desktop/config.json` :
```json
{ "appUrl": "https://examen.votredomaine.com" }
```

### 6.2 Construire le fichier d'installation `.exe`

**Option A, automatique avec GitHub (aucun logiciel à installer) :**
1. Poussez la modification de `config.json` sur GitHub.
2. Allez dans **Actions → Build application Windows → Run workflow**.
3. Après environ 5 minutes, téléchargez l'artefact **MonExamEnLigne-Windows**, qui contient `MonExamEnLigne Setup 1.0.0.exe`.

**Option B, sur un PC Windows :**
```powershell
cd desktop
yarn install
yarn dist
```
Le fichier d'installation se trouve dans `desktop/dist/`.

### 6.3 Installer sur les postes
Lancez le `.exe` sur chaque poste (installation pour tous les utilisateurs). Le service informatique peut aussi le déployer en masse avec Intune ou GPO. Un raccourci « MonExamEnLigne » est créé.

> Au premier lancement, Windows SmartScreen peut afficher « Éditeur inconnu » : cliquez sur **Informations complémentaires → Exécuter quand même**. Pour supprimer ce message, il faudrait un **certificat de signature de code** (environ 200 à 400 $/an), ce qui est optionnel.

### 6.4 Exiger l'application pour un examen
Dans l'examen, onglet **3. Outils et sécurité**, activez **« Application Windows obligatoire »**. Les élèves qui passent par le site web seront refusés. La fiche de chaque élève indique s'il a utilisé l'**Application Windows** ou le **Navigateur web**.

### Limites à connaître
- **Ctrl+Alt+Suppr** et le **Gestionnaire des tâches** ne peuvent pas être bloqués par une application ; seul Windows le peut, par une stratégie de groupe. **Alt+Tab** reste possible, mais chaque sortie est détectée et comptée.
- Pour un verrouillage total, le service informatique peut ajouter une stratégie Windows (GPO) qui désactive le Gestionnaire des tâches sur les comptes élèves.

---

## 7. Mises à jour futures

- **Site web** : refaites `yarn build`, puis recopiez `frontend/build/` sur SiteGround.
- **Serveur** : chaque modification poussée sur GitHub est redéployée automatiquement par Render.
- **Application Windows** : comme elle affiche votre site, les mises à jour du site lui parviennent **sans la réinstaller**. Il faut la reconstruire seulement si `desktop/` change.

## 8. Changer d'hébergeur plus tard (VPS)

Sur un VPS Ubuntu (OVH, DigitalOcean…), vous pouvez tout regrouper au même endroit :
```bash
pip install -r backend/requirements-prod.txt
uvicorn server:app --host 127.0.0.1 --port 8001   # à lancer avec systemd
```
Nginx sert `frontend/build/` et redirige `/api` vers le port 8001. Dans ce cas, `REACT_APP_BACKEND_URL` est la même adresse que le site.
