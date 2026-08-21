import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const mode = process.argv[2]
const updateMode = process.env.MEMEDROP_UPDATE_MODE ?? 'disabled'
const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repositoryRoot = path.resolve(desktopRoot, '../..')
const updatePolicy = JSON.parse(
  await readFile(path.join(desktopRoot, 'build', 'update-policy.json'), 'utf8'),
)
const publisherNames = Array.isArray(updatePolicy.windowsPublisherNames)
  ? [...new Set(updatePolicy.windowsPublisherNames.map((value) => String(value).trim()).filter(Boolean))]
  : []

const fail = (message) => {
  console.error(`Politique de build invalide : ${message}`)
  process.exit(1)
}

if (!['disabled', 'update', 'signed'].includes(mode)) {
  fail("mode attendu : 'disabled', 'update' ou 'signed'")
}

const expectedUpdateMode =
  mode === 'signed' ? 'authenticode' : mode === 'update' ? 'ed25519' : 'disabled'

if (updateMode !== expectedUpdateMode) {
  fail(`MEMEDROP_UPDATE_MODE doit valoir ${expectedUpdateMode}`)
}

if (mode === 'disabled') {
  console.log('Build local : auto-update désactivé et métadonnées de publication non générées.')
  process.exit(0)
}

const publicKeyPath = path.join(desktopRoot, 'build', 'update-signing-public.pem')
const privateKeyPath = path.resolve(
  repositoryRoot,
  process.env.MEMEDROP_UPDATE_PRIVATE_KEY_PATH ?? '.secrets/update-signing-private.pem',
)

let publicKey
let privateKey

try {
  publicKey = createPublicKey(await readFile(publicKeyPath, 'utf8'))
} catch {
  fail("la clé publique Ed25519 est absente ou invalide ; lance d'abord 'npm run update:keygen'")
}

try {
  privateKey = createPrivateKey(await readFile(privateKeyPath, 'utf8'))
} catch {
  fail(`la clé privée Ed25519 est absente ou invalide : ${privateKeyPath}`)
}

if (publicKey.asymmetricKeyType !== 'ed25519' || privateKey.asymmetricKeyType !== 'ed25519') {
  fail('les clés de mise à jour doivent être des clés Ed25519')
}

const challenge = Buffer.from('MemeDrop update signing key check v1', 'utf8')
const challengeSignature = sign(null, challenge, privateKey)

if (!verify(null, challenge, publicKey, challengeSignature)) {
  fail('la clé privée de release ne correspond pas à la clé publique embarquée')
}

if (mode === 'signed') {
  if (publisherNames.length === 0) {
    fail('build/update-policy.json doit épingler le nom exact du certificat Authenticode')
  }

  if (!process.env.CSC_LINK?.trim() && !process.env.WIN_CSC_LINK?.trim()) {
    fail('CSC_LINK ou WIN_CSC_LINK doit référencer le certificat Authenticode')
  }
}

console.log(
  mode === 'signed'
    ? 'Clés Ed25519 et politique Authenticode validées.'
    : 'Clés Ed25519 de mise à jour validées ; aucun certificat Authenticode requis.',
)
