# MemeDrop

Overlay desktop qui affiche les memes envoyés avec `/drop` sur Discord.

## Architecture

Le bot Discord tourne dans `memedrop-server`, via Docker. Les apps Electron se connectent ensuite au serveur MemeDrop en WebSocket.

```txt
Discord -> memedrop-server -> apps Electron
```

## Serveur Docker

1. Copier `.env.example` vers `.env`
2. Renseigner côté serveur :

```env
DISCORD_BOT_TOKEN=your-discord-bot-token
DISCORD_GUILD_ID=your-guild-id
MEMEDROP_SERVER_KEY=choose-a-shared-secret
MEMEDROP_SERVER_URL=https://memedrop.example.com
```

3. Lancer :

```sh
docker compose up -d --build
```

Le serveur écoute par défaut sur `http://localhost:3010`.

## App Desktop

Dans la fenêtre MemeDrop, renseigne :

- l'URL du serveur, par exemple `https://memedrop.example.com`
- la clé d'accès, si `MEMEDROP_SERVER_KEY` est définie côté serveur

Clique ensuite sur `Enregistrer le serveur`.

## Développement

```sh
npm install
npm run dev
```

Pour lancer le serveur sans Docker :

```sh
npm run server:start
```

## Build Windows

```sh
npm run build
```

Si Electron Builder bloque sur les liens symboliques, active le Mode développeur Windows ou lance le terminal en administrateur.

## Raccourcis

- `Ctrl+Shift+D` : activer/désactiver les drops
- `Ctrl+Shift+S` : arrêter le drop en cours sans désactiver les suivants
