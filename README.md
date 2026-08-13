# MemeDrop

MemeDrop est une application Windows reliée à Discord pour envoyer et recevoir des memes (des drops) dans un overlay au-dessus des autres applications (en écran fenêtré sans bordure). 

## Fonctionnalités

- Drops d'images, de vidéos, de sons, de vidéos YouTube et de TikTok.
- Envoi global, ciblé vers une personne ou uniquement à soi-même.
- Légendes, envoi anonyme et renvoi d'un drop récent.
- Files d'attente et possibilité d'arrêter un drop en cours.
- Overlay personnalisable : position, taille, volume et affichage de ses propres drops.
- Connexion Discord, liste des utilisateurs connectés, raccourcis globaux et icône dans la zone de notification Windows.
- Mises à jour directement depuis l'application.

Les commandes Discord disponibles sont `/drop`, `/dropme`, `/dropyt`, `/droptt`, `/redrop`, `/dropstatus`, `/download` et `/help`.

## Prérequis

- Windows pour utiliser l'application desktop et créer son installateur.
- [Node.js](https://nodejs.org/) 22.13.0 ou une version plus récente.
- [Docker](https://www.docker.com/) avec Docker Compose pour le serveur.
- Une application Discord avec un bot, installée sur un serveur Discord.

## Configuration

Copie `.env.example` vers `.env`, puis renseigne les valeurs correspondant à ton installation.

```powershell
cp .env.example .env
```

| Variable | Description | Obligatoire |
| --- | --- | --- |
| `DISCORD_BOT_TOKEN` | Token du bot Discord. | Oui |
| `DISCORD_CLIENT_ID` | Identifiant de l'application Discord. | Oui |
| `DISCORD_CLIENT_SECRET` | Secret OAuth2 de l'application Discord. | Oui |
| `DISCORD_GUILD_ID` | Identifiant du serveur Discord utilisé par MemeDrop. | Oui |
| `MEMEDROP_SERVER_KEY` | Clé d'accès partagée entre le serveur et les applications, avec au moins 16 caractères aléatoires. | Oui |
| `MEMEDROP_IDENTITY_SIGNING_SECRET` | Clé aléatoire réservée au serveur, créée avec la commande ci-dessous. | Oui |
| `MEMEDROP_SERVER_URL` | Adresse par défaut utilisée par l'application desktop. Elle n'est pas utilisée par le conteneur. | Pour l'app |
| `PUBLIC_BASE_URL` | Adresse publique du serveur, utilisée notamment pour OAuth Discord. | Pour le serveur |
| `MEMEDROP_ALLOWED_CHANNEL_IDS` | Salons autorisés, séparés par des virgules. Vide pour tous les salons. | Non |
| `MEMEDROP_ALLOWED_ROLE_IDS` | Rôles autorisés, séparés par des virgules. Vide pour tous les membres. | Non |
| `MEMEDROP_DROP_COOLDOWN_SECONDS` | Délai entre deux drops d'un même utilisateur. `0` le désactive. | Non |
| `MEMEDROP_IDENTITY_TOKEN_TTL_SECONDS` | Durée d'une connexion Discord. Par défaut : 30 jours. | Non |
| `MEMEDROP_UPDATES_DIR` | Dossier des mises à jour dans le conteneur, si elles sont hébergées par ce serveur. | Non |

Génère deux valeurs différentes avec cette commande : une pour `MEMEDROP_SERVER_KEY` et une pour `MEMEDROP_IDENTITY_SIGNING_SECRET`.

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

## Configurer le bot Discord

1. Crée une application dans le [Discord Developer Portal](https://discord.com/developers/applications).
2. Dans `Bot`, crée le bot et copie son token dans `DISCORD_BOT_TOKEN`.
3. Récupère l'Application ID pour `DISCORD_CLIENT_ID`, puis le Client Secret dans `OAuth2` pour `DISCORD_CLIENT_SECRET`.
4. Active le mode développeur dans Discord et copie l'identifiant du serveur dans `DISCORD_GUILD_ID`.
5. Dans le générateur d'URL OAuth2, sélectionne les scopes `bot` et `applications.commands`, puis installe le bot sur le serveur Discord.
6. Dans `OAuth2`, ajoute l'URL de redirection correspondant exactement à `PUBLIC_BASE_URL` suivie de `/auth/discord/callback`.

Aucune permission de bot supplémentaire, aucun intent Discord privilégié et aucune `Interactions Endpoint URL` ne sont nécessaires. Les membres doivent simplement pouvoir utiliser les commandes d'application dans le salon.

En local :

```txt
http://localhost:3010/auth/discord/callback
```

En production :

```txt
https://memedrop.example.com/auth/discord/callback
```

## Lancer en local

Utilise ces adresses dans `.env` :

```env
MEMEDROP_SERVER_URL=http://localhost:3010
PUBLIC_BASE_URL=http://localhost:3010
```

Installe les dépendances :

```sh
npm install
```

Lance le serveur :

```sh
docker compose up --build
```

Puis lance l'application dans un autre terminal :

```sh
npm run dev
```

Avant de proposer une modification, tu peux lancer les mêmes contrôles que la CI :

```sh
npm run lint
npm run typecheck
npm test
```

GitHub Actions exécute automatiquement ces contrôles et construit l'application à chaque pull request et à chaque push sur `main`.

## Déployer en production

1. Renseigne l'adresse publique du serveur dans son `.env` :

```env
PUBLIC_BASE_URL=https://memedrop.example.com
```

2. Ajoute `https://memedrop.example.com/auth/discord/callback` aux Redirect URI Discord.
3. Lance le serveur en arrière-plan :

```sh
docker compose up -d --build
```

4. Vérifie son fonctionnement avec `https://memedrop.example.com/health.json`.

Les utilisateurs renseignent ensuite `https://memedrop.example.com` et la même `MEMEDROP_SERVER_KEY` dans les paramètres de l'application. Un `.env` placé à côté de l'exécutable peut aussi fournir ces valeurs par défaut.

## Construire l'application Windows

Pense à mettre à jour la version dans `package.json` avant de créer une release.

```sh
# Installateur local pour les essais, dans release/local/
npm run build

# Release avec mise à jour, dans release/update/
npm run build:update:win

# Release avec certificat Windows, si configuré, dans release/signed/
npm run build:signed:win
```

Avant la première release avec mise à jour, génère une seule fois les clés de publication :

```sh
npm run update:keygen
```

Sauvegarde la clé privée générée dans `.secrets/` et ne la publie jamais. Les commandes de build créent les fichiers localement ; leur mise en ligne reste manuelle. Un build provenant de `release/local/` ne doit pas être utilisé comme mise à jour.
