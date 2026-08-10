const updatePolicy = require('./build/update-policy.json')

const updateMode = process.env.MEMEDROP_UPDATE_MODE ?? 'disabled'
const supportedUpdateModes = new Set(['disabled', 'ed25519', 'authenticode'])

if (!supportedUpdateModes.has(updateMode)) {
  throw new Error(`Mode d'auto-update inconnu : ${updateMode}.`)
}

const autoUpdateEnabled = updateMode !== 'disabled'
const authenticodeEnabled = updateMode === 'authenticode'
const publisherNames = Array.isArray(updatePolicy.windowsPublisherNames)
  ? [...new Set(updatePolicy.windowsPublisherNames.map((value) => String(value).trim()).filter(Boolean))]
  : []
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

if (authenticodeEnabled && publisherNames.length === 0) {
  throw new Error(
    'build/update-policy.json doit épingler au moins un éditeur Windows pour activer l’auto-update.',
  )
}

module.exports = {
  appId: 'com.memedrop.app',
  productName: 'MemeDrop',
  directories: {
    output:
      updateMode === 'authenticode'
        ? 'release/signed'
        : updateMode === 'ed25519'
          ? 'release/update'
          : 'release/local',
  },
  files: [
    'dist/**',
    'dist-electron/**',
  ],
  forceCodeSigning: authenticodeEnabled,
  win: {
    icon: 'icon.ico',
    target: 'nsis',
    verifyUpdateCodeSignature: true,
    signtoolOptions: {
      signingHashAlgorithms: ['sha256'],
      ...(authenticodeEnabled ? { publisherName: publisherNames } : {}),
    },
  },
  publish: [
    {
      provider: 'generic',
      url: updateFeedUrl.toString().replace(/\/$/, ''),
      publishAutoUpdate: autoUpdateEnabled,
    },
  ],
}
