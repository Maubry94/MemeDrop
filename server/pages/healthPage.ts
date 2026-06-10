import type http from 'node:http'

type HealthPageStatus = {
  ok: boolean
  discordStatus: string
  clients: number
  latestAppVersion: string
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const getDiscordLabel = (status: string) => {
  if (status === 'connected') {
    return 'Connecté'
  }

  if (status === 'starting') {
    return 'Démarrage'
  }

  return 'Erreur'
}

export const sendHealthPage = (response: http.ServerResponse, status: HealthPageStatus) => {
  const discordTone = status.discordStatus === 'connected' ? 'success' : status.discordStatus === 'starting' ? 'warning' : 'error'
  const safeVersion = escapeHtml(status.latestAppVersion)
  const safeDiscordStatus = escapeHtml(getDiscordLabel(status.discordStatus))
  const checkedAt = new Date().toLocaleString('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'medium',
    timeZone: 'Europe/Paris',
  })

  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
  response.end(`<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>MemeDrop - État serveur</title>
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
        min-height: 100vh;
        margin: 0;
        display: grid;
        place-items: center;
        background:
          radial-gradient(circle at top left, rgba(56, 189, 248, 0.16), transparent 26rem),
          radial-gradient(circle at bottom right, rgba(16, 185, 129, 0.12), transparent 24rem),
          #020617;
      }

      main {
        width: min(100%, 42rem);
        padding: 1.25rem;
      }

      .panel {
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 1rem;
        background: rgba(15, 23, 42, 0.78);
        padding: 1.5rem;
        box-shadow: 0 24px 80px rgba(0, 0, 0, 0.35);
      }

      .eyebrow {
        margin: 0 0 0.5rem;
        color: #38bdf8;
        font-size: 0.75rem;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      h1 {
        margin: 0;
        font-size: clamp(2rem, 7vw, 3.5rem);
        line-height: 1;
      }

      .summary {
        margin: 0.85rem 0 1.25rem;
        color: #cbd5e1;
        line-height: 1.65;
      }

      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
        gap: 0.8rem;
      }

      .metric {
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 0.75rem;
        background: rgba(2, 6, 23, 0.42);
        padding: 1rem;
      }

      .label {
        margin: 0 0 0.35rem;
        color: #94a3b8;
        font-size: 0.75rem;
        font-weight: 800;
        text-transform: uppercase;
      }

      .value {
        margin: 0;
        font-size: 1.35rem;
        font-weight: 900;
      }

      .status {
        display: inline-flex;
        align-items: center;
        gap: 0.45rem;
      }

      .dot {
        width: 0.7rem;
        height: 0.7rem;
        border-radius: 999px;
        background: #34d399;
      }

      .status.warning .dot {
        background: #fbbf24;
      }

      .status.error .dot {
        background: #fb7185;
      }

      .footer {
        display: flex;
        flex-wrap: wrap;
        gap: 0.75rem;
        align-items: center;
        justify-content: space-between;
        margin-top: 1rem;
        color: #64748b;
        font-size: 0.8rem;
      }

      a {
        color: #bae6fd;
        text-decoration: none;
      }

      a:hover {
        text-decoration: underline;
      }
    </style>
  </head>
  <body>
    <main>
      <section class="panel">
        <p class="eyebrow">MemeDrop Health</p>
        <h1>État serveur</h1>
        <p class="summary">
          Le serveur HTTP répond correctement. Cette page donne un aperçu rapide de Discord, des clients desktop connectés et de la version publiée.
        </p>

        <div class="grid">
          <article class="metric">
            <p class="label">Serveur</p>
            <p class="value status success"><span class="dot"></span>OK</p>
          </article>
          <article class="metric">
            <p class="label">Discord</p>
            <p class="value status ${discordTone}"><span class="dot"></span>${safeDiscordStatus}</p>
          </article>
          <article class="metric">
            <p class="label">Clients</p>
            <p class="value">${status.clients}</p>
          </article>
          <article class="metric">
            <p class="label">Version</p>
            <p class="value">${safeVersion}</p>
          </article>
        </div>

        <div class="footer">
          <span>Mis à jour : ${escapeHtml(checkedAt)}</span>
          <span><a href="/">Guide</a> · <a href="/health.json">JSON</a></span>
        </div>
      </section>
    </main>
  </body>
</html>`)
}
