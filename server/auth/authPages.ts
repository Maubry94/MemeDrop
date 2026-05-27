import type http from 'node:http'

type AuthPageTone = 'success' | 'warning' | 'error'

export const sendAuthPage = (
  response: http.ServerResponse,
  {
    title,
    message,
    tone = 'success',
  }: {
    title: string
    message: string
    tone?: AuthPageTone
  },
) => {
  const isSuccess = tone === 'success'
  response.writeHead(isSuccess ? 200 : tone === 'error' ? 500 : 400, {
    'content-type': 'text/html; charset=utf-8',
  })
  response.end(`<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>MemeDrop - Connexion Discord</title>
    <style>
      :root {
        color-scheme: dark;
        font-family: Inter, "Segoe UI", system-ui, -apple-system, sans-serif;
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
          radial-gradient(circle at top left, rgba(56, 189, 248, 0.18), transparent 30rem),
          radial-gradient(circle at bottom right, rgba(129, 140, 248, 0.16), transparent 28rem),
          #020617;
      }

      main {
        width: min(92vw, 28rem);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 1.25rem;
        padding: 2rem;
        background: rgba(15, 23, 42, 0.82);
        box-shadow: 0 24px 80px rgba(0, 0, 0, 0.35);
        text-align: center;
      }

      .mark {
        width: 4rem;
        height: 4rem;
        margin: 0 auto 1rem;
        display: grid;
        place-items: center;
        border-radius: 1rem;
        background: ${isSuccess ? '#38bdf8' : '#fb7185'};
        color: #020617;
        font-size: 2rem;
        font-weight: 800;
      }

      h1 {
        margin: 0;
        font-size: 1.5rem;
        line-height: 1.2;
      }

      p {
        margin: 0.75rem 0;
        color: #cbd5e1;
        line-height: 1.6;
      }

      button:hover {
        filter: brightness(1.08);
      }
    </style>
  </head>
  <body>
    <main>
      <div class="mark">${isSuccess ? '✓' : '!'}</div>
      <h1>${title}</h1>
      <p>${message}</p>
    </main>
  </body>
</html>`)
}
