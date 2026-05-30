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
- `/droptt` : envoyer une vidéo TikTok.
- `/dropstatus` : voir les autres utilisateurs connectés à MemeDrop.
- `/download` : obtenir la dernière version de MemeDrop.
- `/help` : afficher l'aide des commandes MemeDrop.
- Options Discord :
  - `legende` : ajouter un texte au drop.
  - `anonyme` : masquer son pseudo et son avatar.
  - `cible` : envoyer le drop à une personne connectée à MemeDrop avec les drops activés.
- Queue commune pour les drops globaux.
- Queues séparées par utilisateur pour les drops ciblés.
- Bouton Discord `Stopper le drop` pour l'auteur.
- Connexion Discord OAuth dans l'app.
- Option pour masquer ses propres drops.
- Volume des drops réglable.
- Position et taille des drops personnalisables.
- Bouton de test local pour prévisualiser un drop sans l'envoyer au serveur.
- Préférences d'application :
  - minimiser en arrière-plan.
  - démarrer avec Windows.
  - démarrer minimisé avec Windows.
  - quitter vraiment l'application.
  - désinstaller l'application.
- Icône tray Windows avec menu rapide.
- Page `Connecté(s)` dans l'app pour voir les autres utilisateurs connectés.
- Raccourcis globaux pour couper ou désactiver les drops.

## Commandes Discord

### `/drop`

Envoie un fichier pris en charge par MemeDrop.

Options :

- `fichier` : image, vidéo ou son.
- `legende` : texte optionnel.
- `cible` : utilisateur MemeDrop disponible qui recevra le drop. Si vide, le drop est global.
- `anonyme` : affiche `Envoyé anonymement` avec un avatar `?`.

### `/dropyt`

Envoie une vidéo YouTube.

Options :

- `lien` : URL YouTube.
- `legende` : texte optionnel.
- `cible` : utilisateur MemeDrop disponible qui recevra le drop. Si vide, le drop est global.
- `anonyme` : affiche `Envoyé anonymement` avec un avatar `?`.

### `/droptt`

Envoie une vidéo TikTok.

Options :

- `lien` : URL TikTok.
- `legende` : texte optionnel.
- `cible` : utilisateur MemeDrop disponible qui recevra le drop. Si vide, le drop est global.
- `anonyme` : affiche `Envoyé anonymement` avec un avatar `?`.

### `/dropstatus`

Affiche en réponse éphémère les autres utilisateurs actuellement connectés à MemeDrop.

Cette commande est utile avant un drop ciblé pour savoir qui peut recevoir un drop.

### `/download`

Affiche en réponse éphémère un bouton pour télécharger la dernière version de l'app desktop MemeDrop.

### `/help`

Affiche en réponse éphémère une aide détaillée sur les commandes, les drops ciblés et les options disponibles.

## Queues

Les drops globaux utilisent une queue commune et restent synchronisés entre les utilisateurs.

Les drops ciblés utilisent une queue séparée par utilisateur. Ils n'impactent pas la queue globale et ne sont envoyés qu'à la cible.

Un utilisateur ne reçoit qu'un seul drop à la fois. Si un drop global et un drop ciblé doivent arriver en même temps chez la même personne, le serveur attend que l'utilisateur soit libre.

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

L'onglet `Connecté(s)` affiche les autres utilisateurs actuellement connectés à MemeDrop.

## Préférences

Options disponibles :

- `Minimiser en arrière-plan` : la croix cache la fenêtre dans le tray au lieu de quitter.
- `Démarrer avec Windows` : lance MemeDrop à l'ouverture de session.
- `Quitter MemeDrop` : ferme vraiment l'application.
- `Désinstaller MemeDrop` : lance le désinstalleur Windows.

Quand `Minimiser en arrière-plan` et `Démarrer avec Windows` sont activés ensemble, MemeDrop démarre directement minimisé dans le tray.

Le tray Windows permet aussi :

- afficher MemeDrop.
- activer/désactiver les drops.
- afficher/masquer ses propres drops.
- quitter MemeDrop.

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
- `Ctrl+Shift+X` : stopper le drop en cours pour toutes les personnes qui l'ont reçu, si tu en es l'auteur.

## Notes

- Les vidéos en vrai plein écran exclusif peuvent passer devant l'overlay Electron selon le jeu et Windows.
