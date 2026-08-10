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
- Mise à jour automatique de l'app desktop uniquement pour les releases Windows signées.

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

Les mises à jour peuvent être téléchargées et installées directement depuis l'app uniquement lorsqu'elles ont été construites et vérifiées avec le processus de release signée décrit plus bas.

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

### Rotation des secrets

Si un secret a été affiché dans un terminal, un log ou une conversation, considère-le comme compromis :

1. Dans le Developer Portal Discord, utilise `Reset Token` dans l'onglet `Bot`, puis remplace `DISCORD_BOT_TOKEN` sur le serveur.
2. Dans `OAuth2`, régénère le client secret, puis remplace `DISCORD_CLIENT_SECRET`.
3. Génère une nouvelle valeur aléatoire d'au moins 32 octets pour `MEMEDROP_SERVER_KEY`.
4. Redémarre le serveur et remplace la clé d'accès enregistrée dans chaque app desktop.

Ne stocke jamais les secrets Discord, la clé privée de mise à jour ou un éventuel certificat Authenticode dans Git. Utilise les secrets du système de déploiement ou de la CI.

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
MEMEDROP_SERVER_KEY=choose-a-cryptographically-random-shared-secret
MEMEDROP_UPDATES_DIR=/updates/win-signed-v1
MEMEDROP_LEGACY_UPDATES_DIR=
MEMEDROP_SERVER_URL=https://memedrop.example.com
PUBLIC_BASE_URL=https://memedrop.example.com
```

`MEMEDROP_ALLOWED_CHANNEL_IDS` peut contenir une liste d'IDs de salons Discord séparés par des virgules. Si la valeur est vide, les commandes MemeDrop sont autorisées dans tous les salons du serveur.

`MEMEDROP_ALLOWED_ROLE_IDS` peut contenir une liste d'IDs de rôles Discord séparés par des virgules. Si la valeur est vide, tout le monde peut envoyer des drops.

`MEMEDROP_DROP_COOLDOWN_SECONDS` limite la fréquence d'envoi des drops par utilisateur. `0` désactive le cooldown.

`MEMEDROP_UPDATES_DIR` indique le dossier du canal normal. Les manifests de ce canal sont signés avec la clé Ed25519 de MemeDrop, même si l'EXE n'a pas de certificat Windows.

`MEMEDROP_LEGACY_UPDATES_DIR` reste vide en fonctionnement normal. Il n'est activé que temporairement pour faire migrer les anciens clients 3.0.1 depuis `/updates/win/`.

Lance le serveur :

```sh
docker compose up -d --build
```

Le serveur expose :

- `GET /`
- `GET /health`
- `GET /health.json`
- `GET /ws`
- `GET /updates/win-signed-v1/:file`
- `GET /updates/win/:file` uniquement si le canal de migration est activé
- `POST /auth/discord/session`
- `GET /auth/discord/session/:id`
- `GET /auth/discord/callback`

Pour servir les mises à jour desktop avec Docker, monte un dossier de releases dans le conteneur :

```yml
environment:
  PORT: 3010
  MEMEDROP_UPDATES_DIR: /updates/win-signed-v1
volumes:
  - ./releases/win-signed-v1:/updates/win-signed-v1:ro
  - ./releases/win:/updates/win:ro
```

## App Desktop

Au premier lancement, l'utilisateur voit l'écran de connexion Discord.

Si besoin, ouvrir `Paramètres serveur` et renseigner :

- URL du serveur, par exemple `https://memedrop.example.com`
- clé d'accès, identique à `MEMEDROP_SERVER_KEY`

Puis cliquer sur `Se connecter avec Discord`.

La configuration locale de l'app est stockée dans le dossier utilisateur de l'application. Elle est conservée entre les réinstallations.

L'onglet `Connecté(s)` affiche les autres utilisateurs actuellement connectés à MemeDrop.

Quand une nouvelle version est disponible, l'app vérifie son manifest Ed25519 et le SHA-512 de l'installateur avant de proposer son installation. Le feed HTTPS et la clé publique sont intégrés à l'app : ils sont indépendants de l'URL du serveur MemeDrop configurée par l'utilisateur.

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

Créer un installateur local pour les essais :

```sh
npm run build
```

Ce build écrit ses artefacts dans `release/local/`, garde volontairement l'auto-update désactivé et ne doit pas être publié comme mise à jour. La politique commune du feed se trouve dans `build/update-policy.json`.

### Auto-update sans certificat Windows

La signature de mise à jour Ed25519 est indépendante d'Authenticode : l'EXE peut rester non signé par Windows tout en étant vérifié cryptographiquement par MemeDrop.

Une seule fois pour cette identité de publication, génère la paire de clés :

```sh
npm run update:keygen
```

Si `build/update-signing-public.pem` existe déjà, ne relance pas cette commande : restaure plutôt la sauvegarde de la clé privée correspondante dans `.secrets/`.

- `build/update-signing-public.pem` est public, suivi dans Git et embarqué dans l'app ;
- `.secrets/update-signing-private.pem` est ignoré par Git, ne doit jamais être envoyé au serveur et doit être sauvegardé dans un emplacement hors ligne sûr.

Ne régénère pas cette paire à chaque version. Sans l'ancienne clé privée, les applications déjà installées refuseront les nouvelles mises à jour.

Produis ensuite la release publiable :

```sh
npm run build:update:win
```

La commande active l'auto-update, construit l'installateur x64, vérifie les métadonnées, calcule son SHA-512 et signe le manifest. Elle génère dans `release/update/` :

```txt
latest.yml
MemeDrop Setup x.x.x.exe
MemeDrop Setup x.x.x.exe.blockmap
update-x.x.x.json
update-x.x.x.json.sig
```

Dépose ces cinq fichiers dans le dossier exposé par `MEMEDROP_UPDATES_DIR`. Transfère l'EXE, la blockmap, le manifest et sa signature d'abord, puis `latest.yml` en dernier afin qu'aucun client ne voie une release incomplète.

L'installateur peut encore afficher « Éditeur inconnu » ou une alerte SmartScreen au premier lancement : seule une signature Authenticode reconnue par Windows supprime ce comportement. Cela n'empêche pas l'app de vérifier elle-même les mises à jour suivantes.

### Authenticode facultatif

Si un certificat Authenticode est acquis plus tard, inscris son nom d'éditeur exact et public dans `build/update-policy.json` :

```json
{
  "feedUrl": "https://memedrop.maubry94.ovh/updates/win-signed-v1",
  "windowsPublisherNames": ["Nom exact du certificat Authenticode"]
}
```

Cette valeur est volontairement suivie dans Git : une modification de l'identité de confiance doit être relue. Seuls le certificat et son mot de passe sont secrets.

Définis ensuite ces variables dans PowerShell ou dans les secrets de la CI :

```powershell
$env:CSC_LINK = 'chemin, URL sécurisée ou contenu base64 du certificat PFX'
$env:CSC_KEY_PASSWORD = 'mot de passe du certificat'
npm run build:signed:win
```

Ne place pas ces valeurs dans `.env`. `build:signed:win` refuse de continuer si l'éditeur, le certificat ou la clé Ed25519 manque. Après le build, il contrôle également :

- la signature Authenticode de l'installateur ;
- l'éditeur attendu dans le certificat et `app-update.yml` ;
- l'URL HTTPS figée du feed ;
- la version et le SHA-512 de `latest.yml` ;
- le manifest Ed25519 utilisé par l'app.

Le build Authenticode génère les mêmes cinq fichiers dans `release/signed/`. Si une vérification échoue, ne publie aucun fichier.

### Première migration depuis la version 3.0.1

La version 3.0.1 ne connaît pas encore la clé Ed25519. Pour permettre l'auto-update demandé sans installation manuelle, l'ancien feed constitue donc un pont temporaire moins sûr :

1. Publie les cinq fichiers de `release/update/` sur le canal normal `releases/win-signed-v1/`.
2. Copie exactement le même EXE, sa blockmap et `latest.yml` dans `releases/win/`, en copiant `latest.yml` en dernier. Ne publie jamais un build de `release/local/`.
3. Active temporairement `MEMEDROP_LEGACY_UPDATES_DIR=/updates/win` et redéploie le serveur.
4. Demande aux proches utilisant 3.0.1 de lancer la mise à jour. Si possible, confirme-leur hors bande le SHA-512 de l'EXE.
5. Dès que tout le monde utilise la première version durcie, vide `MEMEDROP_LEGACY_UPDATES_DIR`, supprime les fichiers du canal legacy et redéploie. Ne fais plus évoluer ce canal.

Pendant cette courte migration, un attaquant capable de remplacer simultanément l'ancien `latest.yml` et l'EXE pourrait encore tromper un client 3.0.1. Les versions suivantes utilisent uniquement `/updates/win-signed-v1/` et refuseront tout manifest ou installateur qui ne correspond pas à la clé publique embarquée.

Lors d'une future rotation de clé Ed25519, publie d'abord avec l'ancienne clé une version qui embarque aussi la nouvelle. Pour une rotation de certificat Authenticode, autorise temporairement les deux éditeurs dans `windowsPublisherNames`.

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
