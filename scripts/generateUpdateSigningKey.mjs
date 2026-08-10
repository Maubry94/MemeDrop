import { createHash, createPublicKey, generateKeyPairSync } from 'node:crypto'
import { access, mkdir, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const privateDirectory = path.join(projectRoot, '.secrets')
const privateKeyPath = path.join(privateDirectory, 'update-signing-private.pem')
const publicKeyPath = path.join(projectRoot, 'build', 'update-signing-public.pem')

const refuseExistingFile = async (filePath) => {
  try {
    await access(filePath)
    throw new Error(`Refus d'écraser la clé existante : ${filePath}`)
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return
    }

    throw error
  }
}

await refuseExistingFile(privateKeyPath)
await refuseExistingFile(publicKeyPath)

const { privateKey, publicKey } = generateKeyPairSync('ed25519', {
  privateKeyEncoding: {
    format: 'pem',
    type: 'pkcs8',
  },
  publicKeyEncoding: {
    format: 'pem',
    type: 'spki',
  },
})

await mkdir(privateDirectory, { recursive: true })

let privateKeyCreated = false
let publicKeyCreated = false
try {
  await writeFile(privateKeyPath, privateKey, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
  privateKeyCreated = true
  await writeFile(publicKeyPath, publicKey, { encoding: 'utf8', flag: 'wx' })
  publicKeyCreated = true
} catch (error) {
  if (privateKeyCreated) {
    await unlink(privateKeyPath).catch(() => undefined)
  }
  if (publicKeyCreated) {
    await unlink(publicKeyPath).catch(() => undefined)
  }
  throw new Error(
    `Refus d'écraser une clé existante. Supprime manuellement les fichiers uniquement si tu souhaites réellement changer d'identité de mise à jour. Cause : ${error instanceof Error ? error.message : String(error)}`,
  )
}

const publicKeyDer = createPublicKey(publicKey).export({ format: 'der', type: 'spki' })
const fingerprint = createHash('sha256').update(publicKeyDer).digest('hex')

console.log('Paire de clés Ed25519 créée sans afficher la clé privée.')
console.log(`Clé privée (à sauvegarder hors ligne, jamais sur le serveur) : ${privateKeyPath}`)
console.log(`Clé publique embarquée dans l'application : ${publicKeyPath}`)
console.log(`Empreinte publique SHA-256 : ${fingerprint}`)
