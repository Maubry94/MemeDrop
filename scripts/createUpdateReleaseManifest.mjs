import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'node:crypto'
import { readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const updateMode = process.env.MEMEDROP_UPDATE_MODE
const outputName = updateMode === 'authenticode' ? 'signed' : 'update'
const releaseDir = path.join(projectRoot, 'release', outputName)
const latestMetadataPath = path.join(releaseDir, 'latest.yml')
const publicKeyPath = path.join(projectRoot, 'build', 'update-signing-public.pem')
const privateKeyPath = path.resolve(
  projectRoot,
  process.env.MEMEDROP_UPDATE_PRIVATE_KEY_PATH ?? '.secrets/update-signing-private.pem',
)
const updatePolicy = JSON.parse(
  await readFile(path.join(projectRoot, 'build', 'update-policy.json'), 'utf8'),
)
const appId = 'com.memedrop.app'
const domain = 'memedrop-update-manifest-v1'
const platform = 'win32'
const arch = 'x64'

if (updateMode !== 'ed25519' && updateMode !== 'authenticode') {
  throw new Error('La création du manifeste exige un build ed25519 ou authenticode.')
}

const getTopLevelYamlScalar = (source, key) => {
  const prefix = `${key}:`
  const line = source.split(/\r?\n/).find((candidate) => candidate.startsWith(prefix))
  const value = line?.slice(prefix.length).trim()

  if (!value) {
    throw new Error(`Champ absent dans latest.yml : ${key}.`)
  }

  if (value.startsWith('"') && value.endsWith('"')) {
    return JSON.parse(value)
  }

  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replace(/''/g, "'")
  }

  return value
}

const packageJson = JSON.parse(await readFile(path.join(projectRoot, 'package.json'), 'utf8'))
const latestMetadata = await readFile(latestMetadataPath, 'utf8')
const version = getTopLevelYamlScalar(latestMetadata, 'version')
const installerRelativePath = getTopLevelYamlScalar(latestMetadata, 'path')
const metadataSha512 = getTopLevelYamlScalar(latestMetadata, 'sha512')

if (version !== packageJson.version) {
  throw new Error(`latest.yml annonce ${version}, mais package.json annonce ${packageJson.version}.`)
}

const installerPath = path.resolve(releaseDir, installerRelativePath)
if (path.dirname(installerPath) !== releaseDir) {
  throw new Error(`Chemin d'installateur interdit : ${installerRelativePath}.`)
}

const installer = await readFile(installerPath)
const installerSha512 = createHash('sha512').update(installer).digest('base64')
const installerInfo = await stat(installerPath)

if (installerSha512 !== metadataSha512) {
  throw new Error("Le SHA-512 de l'installateur ne correspond pas à latest.yml.")
}

const blockmapPath = `${installerPath}.blockmap`
const blockmapInfo = await stat(blockmapPath)
if (!blockmapInfo.isFile() || blockmapInfo.size === 0) {
  throw new Error(`Blockmap absente ou vide : ${path.basename(blockmapPath)}.`)
}

const privateKey = createPrivateKey(await readFile(privateKeyPath, 'utf8'))
const publicKey = createPublicKey(await readFile(publicKeyPath, 'utf8'))
if (privateKey.asymmetricKeyType !== 'ed25519' || publicKey.asymmetricKeyType !== 'ed25519') {
  throw new Error('Les clés de mise à jour doivent être des clés Ed25519.')
}

const publicKeyDer = publicKey.export({ format: 'der', type: 'spki' })
const keyId = `sha256:${createHash('sha256').update(publicKeyDer).digest('hex')}`
const feedUrl = new URL(updatePolicy.feedUrl).toString().replace(/\/$/, '')
const manifest = {
  schema: 1,
  domain,
  keyId,
  appId,
  feedUrl,
  platform,
  arch,
  version,
  fileName: path.basename(installerPath),
  size: installerInfo.size,
  sha512: installerSha512,
}
const manifestContent = Buffer.from(`${JSON.stringify(manifest)}\n`, 'utf8')
const signature = sign(null, manifestContent, privateKey)

if (!verify(null, manifestContent, publicKey, signature)) {
  throw new Error('La signature du manifeste ne correspond pas à la clé publique embarquée.')
}

const manifestName = `update-${version}.json`
await writeFile(path.join(releaseDir, manifestName), manifestContent, { flag: 'wx' })
await writeFile(path.join(releaseDir, `${manifestName}.sig`), `${signature.toString('base64')}\n`, {
  flag: 'wx',
})

console.log(`Release ${version} préparée : ${manifestName} et signature Ed25519 générés.`)
