import type http from 'node:http'

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const getReleaseUrl = (version: string) =>
  `https://github.com/Maubry94/MemeDrop/releases/tag/${encodeURIComponent(version)}`

export const sendHomePage = (
  response: http.ServerResponse,
  {
    latestAppVersion,
  }: {
    latestAppVersion: string
  },
) => {
  const safeVersion = escapeHtml(latestAppVersion)
  const releaseUrl = getReleaseUrl(latestAppVersion)

  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
  response.end(`<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>MemeDrop - Guide d'utilisation</title>
    <style>
      :root {
        color-scheme: dark;
        font-family: Inter, "Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
        background: #020617;
        color: #f8fafc;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        min-height: 100vh;
        background:
          radial-gradient(circle at top left, rgba(56, 189, 248, 0.16), transparent 26rem),
          radial-gradient(circle at bottom right, rgba(16, 185, 129, 0.12), transparent 24rem),
          #020617;
      }

      a {
        color: inherit;
      }

      .page {
        width: min(100%, 68rem);
        margin: 0 auto;
        padding: 3rem 1.25rem 4rem;
      }

      header {
        display: grid;
        gap: 1rem;
        margin-bottom: 2rem;
      }

      .eyebrow {
        margin: 0;
        color: #38bdf8;
        font-size: 0.75rem;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      h1 {
        margin: 0;
        max-width: 46rem;
        font-size: clamp(2.25rem, 8vw, 4.5rem);
        line-height: 0.95;
      }

      .intro {
        margin: 0;
        max-width: 44rem;
        color: #cbd5e1;
        font-size: 1.05rem;
        line-height: 1.7;
      }

      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
        margin-top: 0.5rem;
      }

      .button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 2.5rem;
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 0.65rem;
        padding: 0.65rem 0.95rem;
        background: #38bdf8;
        color: #020617;
        font-size: 0.85rem;
        font-weight: 800;
        text-decoration: none;
      }

      .button.secondary {
        background: rgba(15, 23, 42, 0.72);
        color: #e2e8f0;
      }

      main {
        display: grid;
        gap: 1rem;
      }

      section {
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 0.9rem;
        background: rgba(15, 23, 42, 0.72);
        padding: 1.25rem;
      }

      h2 {
        margin: 0 0 0.8rem;
        font-size: 1.05rem;
      }

      h3 {
        margin: 0;
        font-size: 0.95rem;
      }

      p,
      li {
        color: #cbd5e1;
        line-height: 1.65;
      }

      p {
        margin: 0;
      }

      ul,
      ol {
        margin: 0;
        padding-left: 1.1rem;
      }

      code {
        border: 1px solid rgba(148, 163, 184, 0.22);
        border-radius: 0.35rem;
        background: rgba(2, 6, 23, 0.62);
        padding: 0.1rem 0.35rem;
        color: #bae6fd;
        font-size: 0.9em;
      }

      .grid {
        display: grid;
        gap: 0.85rem;
      }

      .command-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
        gap: 0.85rem;
      }

      .command {
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 0.75rem;
        background: rgba(2, 6, 23, 0.42);
        padding: 1rem;
      }

      .command p {
        margin-top: 0.45rem;
        font-size: 0.92rem;
      }

      .steps {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
        gap: 0.85rem;
        counter-reset: step;
      }

      .step {
        position: relative;
        min-height: 8rem;
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 0.75rem;
        background: rgba(2, 6, 23, 0.38);
        padding: 1rem;
      }

      .step::before {
        counter-increment: step;
        content: counter(step);
        display: grid;
        place-items: center;
        width: 1.8rem;
        height: 1.8rem;
        margin-bottom: 0.7rem;
        border-radius: 999px;
        background: #38bdf8;
        color: #020617;
        font-size: 0.82rem;
        font-weight: 900;
      }

      .note {
        border-color: rgba(251, 191, 36, 0.28);
        background: rgba(251, 191, 36, 0.08);
      }

      footer {
        margin-top: 2rem;
        color: #64748b;
        font-size: 0.8rem;
        text-align: center;
      }
    </style>
  </head>
  <body>
    <div class="page">
      <header>
        <p class="eyebrow">MemeDrop Server</p>
        <h1>Envoyer des memes Discord vers un overlay desktop.</h1>
        <p class="intro">
          MemeDrop permet d'envoyer des images, vidéos, sons, vidéos YouTube ou TikTok depuis Discord vers les personnes connectées à l'application desktop.
        </p>
        <div class="actions">
          <a class="button" href="${releaseUrl}" target="_blank">Télécharger la version ${safeVersion}</a>
          <a class="button secondary" href="/health">Voir l'état serveur</a>
        </div>
      </header>

      <main>
        <section>
          <h2>Démarrer</h2>
          <div class="steps">
            <div class="step">
              <h3>Installer l'application</h3>
              <p>Télécharge MemeDrop, lance l'application desktop, puis ouvre les préférences pour configurer le serveur si nécessaire.</p>
            </div>
            <div class="step">
              <h3>Se connecter avec Discord</h3>
              <p>Depuis l'application, connecte ton compte Discord. Le bot pourra ensuite reconnaître tes clients connectés.</p>
            </div>
            <div class="step">
              <h3>Envoyer un drop</h3>
              <p>Utilise les commandes Discord. Les destinataires doivent être connectés et avoir les drops activés.</p>
            </div>
          </div>
        </section>

        <section>
          <h2>Commandes Discord</h2>
          <div class="command-grid">
            <article class="command">
              <h3><code>/drop</code></h3>
              <p>Envoie une image, une vidéo, un son ou un fichier pris en charge. Sans cible, le drop part vers tout le monde.</p>
            </article>
            <article class="command">
              <h3><code>/dropme</code></h3>
              <p>Envoie un fichier uniquement à toi-même. Pratique pour tester ton overlay ou garder un drop personnel.</p>
            </article>
            <article class="command">
              <h3><code>/dropyt</code></h3>
              <p>Envoie une vidéo YouTube à partir d'un lien public.</p>
            </article>
            <article class="command">
              <h3><code>/droptt</code></h3>
              <p>Envoie une vidéo TikTok à partir d'un lien complet de vidéo.</p>
            </article>
            <article class="command">
              <h3><code>/redrop</code></h3>
              <p>Renvoie un drop récent de ton historique. Tu peux aussi modifier sa légende ou choisir une cible.</p>
            </article>
            <article class="command">
              <h3><code>/dropstatus</code></h3>
              <p>Affiche les utilisateurs connectés, leur disponibilité et les versions d'application détectées.</p>
            </article>
            <article class="command">
              <h3><code>/download</code></h3>
              <p>Affiche le lien de téléchargement de la dernière version de l'application desktop.</p>
            </article>
            <article class="command">
              <h3><code>/help</code></h3>
              <p>Affiche un résumé rapide des commandes directement dans Discord.</p>
            </article>
          </div>
        </section>

        <section>
          <h2>Options utiles</h2>
          <div class="grid">
            <p><code>legende</code> ajoute un texte visible sous le media dans l'overlay.</p>
            <p><code>cible</code> envoie le drop uniquement à une personne connectée avec les drops activés.</p>
            <p><code>anonyme</code> masque ton pseudo et ton avatar sur le drop, tout en te gardant propriétaire du drop pour pouvoir l'arrêter.</p>
          </div>
        </section>

        <section>
          <h2>Files d'attente et contrôle</h2>
          <div class="grid">
            <p>Un drop envoyé sans cible rejoint la file globale. Les drops ciblés, dont <code>/dropme</code>, rejoignent une file dédiée à la cible.</p>
            <p>Si un drop est déjà actif chez un destinataire, les drops suivants attendent leur tour.</p>
            <p>Le bouton <strong>Stopper le drop</strong> dans Discord arrête un drop actif ou le retire de la queue tant que tu en es le propriétaire.</p>
          </div>
        </section>

        <section class="note">
          <h2>À savoir</h2>
          <p>
            Si une commande indique qu'aucun destinataire n'est disponible, vérifie que l'application desktop est ouverte, connectée au bon compte Discord, et que les drops ne sont pas désactivés.
          </p>
        </section>
      </main>

      <footer>
        MemeDrop ${safeVersion}
      </footer>
    </div>
  </body>
</html>`)
}
