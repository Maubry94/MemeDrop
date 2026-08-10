import { defineConfig } from 'vite'
import path from 'node:path'
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

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    electron({
      main: {
        // Shortcut of `build.lib.entry`.
        entry: 'electron/main.ts',
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
      preload: {
        // Shortcut of `build.rollupOptions.input`.
        // Preload scripts may contain Web assets, so use the `build.rollupOptions.input` instead `build.lib.entry`.
        input: {
          preload: path.join(__dirname, 'electron/preload.ts'),
          tiktokPreload: path.join(__dirname, 'electron/tiktokPreload.ts'),
        },
        vite: {
          build: {
            rollupOptions: {
              output: {
                inlineDynamicImports: false,
              },
            },
          },
        },
      },
      // Ployfill the Electron and Node.js API for Renderer process.
      // If you want use Node.js in Renderer process, the `nodeIntegration` needs to be enabled in the Main process.
      // See 👉 https://github.com/electron-vite/vite-plugin-electron-renderer
      renderer: process.env.NODE_ENV === 'test'
        // https://github.com/electron-vite/vite-plugin-electron-renderer/issues/78#issuecomment-2053600808
        ? undefined
        : {},
    }),
  ],
})
