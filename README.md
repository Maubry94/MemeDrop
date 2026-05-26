# MemeDrop

Overlay desktop qui affiche les memes envoyés depuis Discord avec `/drop` ou `/dropyt`.

## Fonctionnement

Le bot Discord tourne côté serveur. Les apps Electron installées chez les utilisateurs se connectent au serveur MemeDrop en WebSocket et affichent les drops localement.

```txt
Discord -> memedrop-server -> apps Electron
```

Chaque utilisateur se connecte avec Discord dans l'app.

## Fonctionnalités

- `/drop` : envoyer une image, vidéo ou piste audio.
- `/dropyt` : envoyer une vidéo YouTube.
- Queue commune côté Discord, affichage local côté app.
- Connexion Discord OAuth dans l'app.
- Option pour masquer ses propres drops.
- Volume des drops réglable.
- Raccourcis globaux pour couper ou désactiver les drops.

## Configuration Discord

Dans le Developer Portal Discord, utilise l'application de ton bot.

1. Récupère :
   - `DISCORD_BOT_TOKEN` dans l'onglet `Bot`
   - `DISCORD_CLIENT_ID` dans `Informations générales`
   - `DISCORD_CLIENT_SECRET` dans `OAuth2`
2. Dans `OAuth2`, ajoute la Redirect URI du serveur :

```txt
https://memedrop.example.com/auth/discord/callback
```

En local :

```txt
http://localhost:3010/auth/discord/callback
```

L'URL doit correspondre exactement à `PUBLIC_BASE_URL`.

## Serveur Docker

Copie `.env.example` vers `.env`, puis renseigne :

```env
DISCORD_BOT_TOKEN=your-discord-bot-token
DISCORD_GUILD_ID=your-guild-id
DISCORD_CLIENT_ID=your-discord-application-client-id
DISCORD_CLIENT_SECRET=your-discord-application-client-secret
MEMEDROP_SERVER_KEY=choose-a-shared-secret
MEMEDROP_SERVER_URL=https://memedrop.example.com
PUBLIC_BASE_URL=https://memedrop.example.com
```

Lance le serveur :

```sh
docker compose up -d --build
```

Le serveur expose :

- `GET /health`
- `GET /ws`
- `POST /auth/discord/session`
- `GET /auth/discord/session/:id`
- `GET /auth/discord/callback`

## App Desktop

Au premier lancement, l'utilisateur voit l'écran de connexion Discord.

Si besoin, ouvrir `Paramètres serveur` et renseigner :

- URL du serveur, par exemple `https://memedrop.example.com`
- clé d'accès, identique à `MEMEDROP_SERVER_KEY`

Puis cliquer sur `Se connecter avec Discord`.

La configuration locale de l'app est stockée dans le dossier utilisateur de l'application. Elle est conservée entre les réinstallations.

## Développement

Installer les dépendances :

```sh
npm install
```

Lancer l'app Electron en dev :

```sh
npm run dev
```

Lancer le serveur sans Docker :

```sh
npm run server:start
```

Ou avec Docker :

```sh
docker compose up --build
```

Pour tester en local, utiliser :

```env
MEMEDROP_SERVER_URL=http://localhost:3010
PUBLIC_BASE_URL=http://localhost:3010
```

Et ajouter cette Redirect URI dans Discord :

```txt
http://localhost:3010/auth/discord/callback
```

## Build Windows

Créer l'installateur Windows :

```sh
npm run build
```

Créer seulement le dossier Windows non packagé :

```sh
npm run pack:win
```

Si Electron Builder bloque sur les liens symboliques, active le Mode développeur Windows ou lance le terminal en administrateur.

## Raccourcis

- `Ctrl+Shift+D` : activer/désactiver tous les drops.
- `Ctrl+Shift+S` : arrêter le drop en cours sans désactiver les suivants.
- `Ctrl+Shift+M` : afficher/masquer ses propres drops.

## Notes

- Les vidéos en vrai plein écran exclusif peuvent passer devant l'overlay Electron selon le jeu et Windows.
