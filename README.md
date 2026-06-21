# MemeDrop

Overlay desktop qui affiche les memes envoyés depuis Discord avec `/drop`, `/dropme`, `/dropyt` ou `/droptt`.

## Fonctionnement

Le bot Discord tourne côté serveur. Les apps Electron installées chez les utilisateurs se connectent au serveur MemeDrop en WebSocket et affichent les drops localement.

```txt
Discord -> memedrop-server -> apps Electron
```

Chaque utilisateur se connecte avec Discord dans l'app.

## Fonctionnalités

- `/drop` : envoyer une image, vidéo ou piste audio.
- `/dropme` : envoyer une image, vidéo ou piste audio uniquement à soi-même.
- `/dropyt` : envoyer une vidéo YouTube.
- `/droptt` : envoyer une vidéo TikTok.
- `/redrop` : renvoyer un drop récent.
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
- Mise à jour automatique de l'app desktop depuis le serveur MemeDrop.

## Commandes Discord

### `/drop`

Envoie un fichier pris en charge par MemeDrop.

Options :

- `fichier` : image, vidéo ou son.
- `legende` : texte optionnel.
- `cible` : utilisateur MemeDrop disponible qui recevra le drop. Si vide, le drop est global.
- `anonyme` : affiche `Envoyé anonymement` avec un avatar `?`.

### `/dropme`

Envoie un fichier pris en charge uniquement à l'utilisateur qui lance la commande.

Options :

- `fichier` : image, vidéo ou son.
- `legende` : texte optionnel.
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

### `/redrop`

Renvoie un drop récent envoyé par la même personne.

Options :

- `drop` : drop récent à renvoyer.
- `cible` : utilisateur MemeDrop disponible qui recevra le drop. Si vide, le redrop est global.
- `legende` : remplace la légende du drop renvoyé. Si vide, la légende d'origine est conservée.

### `/dropstatus`

Affiche en réponse éphémère les autres utilisateurs actuellement connectés à MemeDrop.

Cette commande est utile avant un drop ciblé pour savoir qui peut recevoir un drop.

### `/download`

Affiche en réponse éphémère un bouton pour télécharger la dernière version de l'app desktop MemeDrop.

Depuis la version `3.0.1`, les mises à jour suivantes peuvent être téléchargées et installées directement depuis l'app.

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
MEMEDROP_ALLOWED_CHANNEL_IDS=
MEMEDROP_ALLOWED_ROLE_IDS=
MEMEDROP_DROP_COOLDOWN_SECONDS=0
MEMEDROP_SERVER_KEY=choose-a-shared-secret
MEMEDROP_UPDATES_DIR=/updates/win
MEMEDROP_SERVER_URL=https://memedrop.example.com
PUBLIC_BASE_URL=https://memedrop.example.com
```

`MEMEDROP_ALLOWED_CHANNEL_IDS` peut contenir une liste d'IDs de salons Discord séparés par des virgules. Si la valeur est vide, les commandes MemeDrop sont autorisées dans tous les salons du serveur.

`MEMEDROP_ALLOWED_ROLE_IDS` peut contenir une liste d'IDs de rôles Discord séparés par des virgules. Si la valeur est vide, tout le monde peut envoyer des drops.

`MEMEDROP_DROP_COOLDOWN_SECONDS` limite la fréquence d'envoi des drops par utilisateur. `0` désactive le cooldown.

`MEMEDROP_UPDATES_DIR` indique le dossier, dans le conteneur Docker, qui contient les fichiers d'auto-update Windows.

Lance le serveur :

```sh
docker compose up -d --build
```

Le serveur expose :

- `GET /`
- `GET /health`
- `GET /health.json`
- `GET /ws`
- `GET /updates/win/:file`
- `POST /auth/discord/session`
- `GET /auth/discord/session/:id`
- `GET /auth/discord/callback`

Pour servir les mises à jour desktop avec Docker, monte un dossier de releases dans le conteneur :

```yml
environment:
  PORT: 3010
  MEMEDROP_UPDATES_DIR: /updates/win
volumes:
  - /mnt/HDD/Medias/Dev/memeDrop/releases/win:/updates/win:ro
```

## App Desktop

Au premier lancement, l'utilisateur voit l'écran de connexion Discord.

Si besoin, ouvrir `Paramètres serveur` et renseigner :

- URL du serveur, par exemple `https://memedrop.example.com`
- clé d'accès, identique à `MEMEDROP_SERVER_KEY`

Puis cliquer sur `Se connecter avec Discord`.

La configuration locale de l'app est stockée dans le dossier utilisateur de l'application. Elle est conservée entre les réinstallations.

L'onglet `Connecté(s)` affiche les autres utilisateurs actuellement connectés à MemeDrop.

Quand une nouvelle version est disponible, l'app peut la télécharger depuis le serveur MemeDrop et redémarrer pour l'installer.

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

Le build génère les fichiers de release dans `release/`. Pour l'auto-update Windows, déposer ces trois fichiers sur le serveur, dans le dossier exposé par `MEMEDROP_UPDATES_DIR` :

```txt
latest.yml
MemeDrop Setup x.x.x.exe
MemeDrop Setup x.x.x.exe.blockmap
```

Créer seulement le dossier Windows non packagé :

```sh
npm run pack:win
```

Si Electron Builder bloque sur les liens symboliques, active le Mode développeur Windows ou lance le terminal en administrateur.

## Raccourcis

- `Ctrl+Shift+D` : activer/désactiver tous les drops.
- `Ctrl+Shift+S` : masquer le drop actuel uniquement chez toi.
- `Ctrl+Shift+M` : afficher/masquer ses propres drops.
- `Ctrl+Shift+X` : stopper le drop envoyé pour toutes les personnes qui l'ont reçu.

## Notes

- Les vidéos en vrai plein écran exclusif peuvent passer devant l'overlay Electron selon le jeu et Windows.
