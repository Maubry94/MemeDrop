import { defineConfig } from 'vite'
import path from 'node:path'
import type { ChildProcess } from 'node:child_process'
import electron from 'vite-plugin-electron/simple'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import updatePolicy from './build/update-policy.json'

delete process.env.ELECTRON_RUN_AS_NODE

const updateMode = process.env.MEMEDROP_UPDATE_MODE ?? 'disabled'
const supportedUpdateModes = new Set(['disabled', 'ed25519', 'authenticode'])

if (!supportedUpdateModes.has(updateMode)) {
  throw new Error(`Mode d'auto-update inconnu : ${updateMode}.`)
}

const autoUpdateEnabled = updateMode !== 'disabled'
const updateFeedUrl = new URL(updatePolicy.feedUrl)

if (
  updateFeedUrl.protocol !== 'https:' ||
  updateFeedUrl.username ||
  updateFeedUrl.password ||
  updateFeedUrl.search ||
  updateFeedUrl.hash
) {
  throw new Error('build/update-policy.json doit contenir une URL HTTPS sans identifiants, paramètres ou fragment.')
}

const normalizedUpdateFeedUrl = updateFeedUrl.toString().replace(/\/$/, '')

const startDevelopmentElectron = async (
  startup: (argv?: string[]) => Promise<boolean>,
) => {
  // Passer explicitement les arguments évite le `--no-sandbox` ajouté par
  // défaut par vite-plugin-electron tout en conservant son cycle de démarrage.
  const started = await startup(['.'])
  if (!started) {
    throw new Error('Le démarrage Electron a été empêché par vite-plugin-electron.')
  }

  // Détacher le processus terminé du registre du plugin avant de quitter Vite,
  // sans retirer les autres listeners qui pourraient être ajoutés au child.
  const processRegistry = process as unknown as { electronApp?: ChildProcess }
  const electronApp = processRegistry.electronApp
  if (!electronApp) {
    return
  }

  electronApp.removeListener('exit', process.exit)
  electronApp.once('exit', (code, signal) => {
    if (processRegistry.electronApp === electronApp) {
      delete processRegistry.electronApp
    }

    if (signal) {
      console.error(`Electron s'est arrêté avec le signal ${signal}.`)
      process.exit(1)
    }

    process.exit(code ?? 1)
  })
}

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
  plugins: [
    vue(),
    tailwindcss(),
    electron({
      main: {
        // Shortcut of `build.lib.entry`.
        entry: 'electron/main.ts',
        onstart: ({ startup }) => startDevelopmentElectron(startup),
        vite: {
          define: {
            __MEMEDROP_AUTO_UPDATE_ENABLED__: JSON.stringify(autoUpdateEnabled),
            __MEMEDROP_UPDATE_FEED_URL__: JSON.stringify(normalizedUpdateFeedUrl),
          },
          build: {
            rollupOptions: {
              external: ['ws', 'electron-updater'],
            },
          },
        },
      },
      // Chaque preload est construit séparément : vite-plugin-electron garde
      // ainsi un bundle autonome sans code partagé chargé dynamiquement.
      preload: [
        { input: path.join(__dirname, 'electron/preload.ts') },
        { input: path.join(__dirname, 'electron/overlayPreload.ts') },
      ],
    }),
  ],
})
