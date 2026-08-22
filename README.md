# MemeDrop

MemeDrop est une application Windows reliée à Discord pour envoyer et recevoir des images, sons et vidéos dans un overlay au-dessus des autres applications.

## Fonctionnalités

- Drops d’images, de vidéos, de sons, de vidéos YouTube et TikTok.
- Envoi global, ciblé vers une personne ou uniquement à soi-même.
- Légendes, envoi anonyme et renvoi d’un drop récent.
- Files d’attente et arrêt d’un drop en cours.
- Overlay personnalisable : écran, position, taille, volume et affichage de ses propres drops.
- Connexion Discord, utilisateurs connectés, raccourcis globaux et icône Windows.
- Mises à jour directement depuis l’application.

Les commandes Discord sont `/drop`, `/dropme`, `/dropyt`, `/droptt`, `/redrop`, `/dropstatus`, `/download` et `/help`.

## Organisation du dépôt

MemeDrop utilise des workspaces npm avec un seul `package-lock.json` :

```text
apps/desktop    Application Vue et Electron pour Windows
apps/server     Backend, bot Discord, OAuth et WebSocket
apps/web        Site Vue et passerelle Nginx
packages/protocol  Types échangés entre le desktop et le serveur
deploy/truenas  Configurations des deux Custom Apps TrueNAS
```

Le fichier `compose.yml` lance le serveur et le site. Seul `memedrop-web` expose le port `3010`; il transmet les routes techniques, dont les téléchargements de mise à jour, au backend.

## Prérequis

- Windows pour utiliser l’application desktop et créer son installateur.
- Node.js 22.13.0 ou plus récent.
- Docker avec Docker Compose pour le serveur et le site.
- Une application Discord avec un bot.

## Configuration

Crée le fichier du serveur :

```sh
cp apps/server/.env.example apps/server/.env
```

| Variable | Description | Obligatoire |
| --- | --- | --- |
| `DISCORD_BOT_TOKEN` | Token du bot Discord. | Oui |
| `DISCORD_CLIENT_ID` | Identifiant de l’application Discord. | Oui |
| `DISCORD_CLIENT_SECRET` | Secret OAuth2 de l’application Discord. | Oui |
| `DISCORD_GUILD_ID` | Identifiant du serveur Discord. | Oui |
| `MEMEDROP_SERVER_KEY` | Clé partagée avec les applications, avec au moins 16 caractères aléatoires. | Oui |
| `MEMEDROP_IDENTITY_SIGNING_SECRET` | Clé aléatoire privée utilisée pour les sessions Discord. | Oui |
| `PUBLIC_BASE_URL` | Adresse publique de MemeDrop utilisée pour OAuth. | Oui |
| `MEMEDROP_ALLOWED_CHANNEL_IDS` | Salons autorisés, séparés par des virgules. Vide pour tous. | Non |
| `MEMEDROP_ALLOWED_ROLE_IDS` | Rôles autorisés, séparés par des virgules. Vide pour tous. | Non |
| `MEMEDROP_DROP_COOLDOWN_SECONDS` | Délai entre deux drops d’un utilisateur. `0` le désactive. | Non |
| `MEMEDROP_IDENTITY_TOKEN_TTL_SECONDS` | Durée d’une session Discord, 30 jours par défaut. | Non |
| `MEMEDROP_UPDATES_DIR` | Dossier contenant les mises à jour Windows. Compose le configure automatiquement. | Non |

Génère deux valeurs différentes pour les deux secrets MemeDrop :

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Pour le développement local du desktop, crée si besoin un fichier d’environnement dédié :

```sh
cp apps/desktop/.env.example apps/desktop/.env
```

Ce fichier est lu lorsque l’application est lancée depuis le dépôt, mais il n’est pas inclus dans l’installateur Windows. Lors d’une première installation, l’utilisateur renseigne dans l’application l’adresse et la clé fournies par la personne qui héberge MemeDrop. Elles sont ensuite conservées sur l’appareil, y compris après une mise à jour.

## Configurer le bot Discord

1. Crée une application dans le [Discord Developer Portal](https://discord.com/developers/applications).
2. Dans `Bot`, crée le bot et copie son token dans `DISCORD_BOT_TOKEN`.
3. Copie l’Application ID dans `DISCORD_CLIENT_ID` et le secret OAuth2 dans `DISCORD_CLIENT_SECRET`.
4. Active le mode développeur Discord et copie l’identifiant du serveur dans `DISCORD_GUILD_ID`.
5. Dans le générateur OAuth2, sélectionne `bot` et `applications.commands`, puis installe le bot.
6. Ajoute exactement `PUBLIC_BASE_URL` suivi de `/auth/discord/callback` aux Redirect URI OAuth2.

En local, l’URI de redirection est :

```text
http://localhost:3010/auth/discord/callback
```

Aucun intent Discord privilégié ni `Interactions Endpoint URL` n’est nécessaire.

## Lancer en local

Dans `apps/server/.env`, utilise :

```env
PUBLIC_BASE_URL=http://localhost:3010
```

Dans `apps/desktop/.env`, utilise :

```env
MEMEDROP_SERVER_URL=http://localhost:3010
MEMEDROP_SERVER_KEY=la-meme-cle-que-le-serveur
```

Installe toutes les dépendances puis lance le serveur et le site :

```sh
npm install
docker compose up --build
```

Le site est disponible sur `http://localhost:3010`. Lance ensuite le desktop dans un autre terminal :

```sh
npm run dev
```

Pour travailler sur le site avec le rechargement automatique :

```sh
npm run dev:web
```

Le site de développement utilise `http://localhost:5174` et transmet `/health.json` au serveur Docker.

## Déployer en production

Configure `PUBLIC_BASE_URL` avec l’origine HTTPS publique exacte et ajoute son callback dans Discord. Expose ensuite le port `3010` du service web derrière un reverse proxy HTTPS ou un tunnel prenant en charge les WebSockets. Cloudflare Tunnel est une option, mais il n’est pas obligatoire.

Avec Compose :

```sh
docker compose up -d --build
```

Pour reconstruire uniquement le backend sans interrompre le site :

```sh
docker compose up -d --build --no-deps memedrop-server
```

La page `/health` reste disponible pendant une panne du backend. La sonde `/health.json` renvoie alors un HTTP `503` et les mises à jour sont temporairement indisponibles.

### TrueNAS

Choisis un chemin absolu pour le dépôt sur un dataset accessible aux Apps. Les exemples utilisent `/mnt/POOL/DATASET/memedrop` : remplace `POOL` et `DATASET` par les valeurs de ton installation dans les deux fichiers Compose.

Les deux Custom Apps utilisent ce même dépôt, mais restent arrêtables et redéployables séparément :

- serveur : `deploy/truenas/server.compose.yml`;
- site : `deploy/truenas/web.compose.yml`.

Depuis le dossier du dépôt, crée la configuration du serveur si elle n’existe pas encore :

```sh
cd /mnt/POOL/DATASET/memedrop
cp apps/server/.env.example apps/server/.env
```

Renseigne ensuite `apps/server/.env`, puis crée une seule fois le réseau partagé :

```sh
sudo docker network create --driver bridge memedrop-shared
```

Les fichiers de mise à jour sont placés dans `releases/win-signed-v1`. Ce dossier est monté uniquement dans la Custom App serveur.

Le processus Node s’exécute sans privilèges root. Le groupe ajouté avec `group_add` doit disposer au minimum de la lecture sur les releases et du droit de traverser leurs dossiers. Pour utiliser le groupe TrueNAS `apps`, vérifie son GID :

```sh
getent group apps
```

Le troisième champ est son GID, généralement `568`. Renseigne cette valeur dans `group_add` de `deploy/truenas/server.compose.yml`, puis accorde à ce groupe les droits nécessaires depuis l’interface TrueNAS. Tu peux utiliser un autre groupe en renseignant son GID à la place ; aucun accès global à `Everyone` n’est requis.

Crée enfin les deux Custom Apps à partir de leurs fichiers Compose. Le site est publié sur le port `3010` de TrueNAS. Pour un accès public, place ce port derrière le reverse proxy HTTPS ou le tunnel de ton choix et conserve la même origine dans `PUBLIC_BASE_URL`.

## Vérifier le projet

Les commandes racine contrôlent tous les workspaces :

```sh
npm run lint
npm run typecheck
npm test
npm run build:protocol
npm run build:app
npm run build:server
npm run build:web
```

## Construire l’application Windows

La version publique se trouve uniquement dans `apps/desktop/package.json`.

```sh
# Installateur local dans release/local/
npm run build

# Release avec auto-update dans release/update/
npm run build:update:win

# Release Authenticode dans release/signed/
npm run build:signed:win
```

Avant la première release avec mise à jour :

```sh
npm run update:keygen
```

La clé privée reste dans `.secrets/` et ne doit jamais être publiée. Pour déployer une mise à jour, copie le contenu de `release/update/` ou `release/signed/` dans `releases/win-signed-v1/`; le serveur sert ce dossier sans reconstruction.
