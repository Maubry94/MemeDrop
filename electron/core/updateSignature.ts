import { createHash, createPublicKey, timingSafeEqual, verify } from 'node:crypto'
import { createReadStream } from 'node:fs'
import path from 'node:path'
import { net } from 'electron'
import type { UpdateInfo } from 'electron-updater'
import updateSigningPublicKeyPem from '../../build/update-signing-public.pem?raw'

const UPDATE_MANIFEST_SCHEMA = 1
const UPDATE_MANIFEST_DOMAIN = 'memedrop-update-manifest-v1'
const UPDATE_APP_ID = 'com.memedrop.app'
const UPDATE_PLATFORM = 'win32'
const UPDATE_ARCH = 'x64'
const MAX_MANIFEST_BYTES = 16 * 1024
const MAX_SIGNATURE_BYTES = 256
const MAX_UPDATE_BYTES = 2 * 1024 * 1024 * 1024
const FETCH_TIMEOUT_MS = 15_000
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/

const MANIFEST_FIELDS = [
  'schema',
  'domain',
  'keyId',
  'appId',
  'feedUrl',
  'platform',
  'arch',
  'version',
  'fileName',
  'size',
  'sha512',
] as const

export type VerifiedUpdateManifest = Readonly<{
  schema: 1
  domain: typeof UPDATE_MANIFEST_DOMAIN
  keyId: string
  appId: typeof UPDATE_APP_ID
  feedUrl: string
  platform: typeof UPDATE_PLATFORM
  arch: typeof UPDATE_ARCH
  version: string
  fileName: string
  size: number
  sha512: string
}>

type FetchAndVerifyManifestOptions = {
  feedUrl: string
  updateInfo: UpdateInfo
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const normalizeFeedUrl = (feedUrl: string) => {
  const url = new URL(feedUrl)

  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error("L'URL du feed de mise à jour n'est pas une URL HTTPS sûre.")
  }

  return url.toString().replace(/\/$/, '')
}

const decodeUtf8 = (value: Buffer, label: string) => {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(value)
  } catch {
    throw new Error(`${label} n'est pas encodé correctement en UTF-8.`)
  }
}

const decodeCanonicalBase64 = (value: string, expectedBytes: number, label: string) => {
  if (
    value.length === 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)
  ) {
    throw new Error(`${label} n'est pas au format base64 canonique.`)
  }

  const decoded = Buffer.from(value, 'base64')
  if (decoded.length !== expectedBytes || decoded.toString('base64') !== value) {
    throw new Error(`${label} a une longueur ou un encodage invalide.`)
  }

  return decoded
}

const getDetachedSignature = (signatureBytes: Buffer) => {
  let value = decodeUtf8(signatureBytes, 'La signature de mise à jour')

  if (value.endsWith('\r\n')) {
    value = value.slice(0, -2)
  } else if (value.endsWith('\n')) {
    value = value.slice(0, -1)
  }

  if (value.trim() !== value || /[\r\n]/.test(value)) {
    throw new Error('Le fichier de signature contient des caractères inattendus.')
  }

  return decodeCanonicalBase64(value, 64, 'La signature Ed25519')
}

const pinnedPublicKey = createPublicKey(updateSigningPublicKeyPem)
if (pinnedPublicKey.asymmetricKeyType !== 'ed25519') {
  throw new Error("La clé publique de mise à jour embarquée n'est pas une clé Ed25519.")
}

const pinnedPublicKeyDer = pinnedPublicKey.export({ format: 'der', type: 'spki' })
const pinnedKeyId = `sha256:${createHash('sha256').update(pinnedPublicKeyDer).digest('hex')}`

const validateVersion = (version: string) => {
  if (version.length > 64 || !SEMVER_PATTERN.test(version)) {
    throw new Error('La version annoncée par le serveur de mise à jour est invalide.')
  }
}

const validateFileName = (fileName: string) => {
  const reservedWindowsName = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i

  if (
    fileName.length === 0 ||
    fileName.length > 255 ||
    /[\u0000-\u001f<>:"/\\|?*]/.test(fileName) ||
    fileName.endsWith(' ') ||
    fileName.endsWith('.') ||
    reservedWindowsName.test(fileName) ||
    !fileName.toLowerCase().endsWith('.exe')
  ) {
    throw new Error("Le nom de l'installateur signé est invalide.")
  }
}

const getUpdateFileUrl = (fileUrl: string, feedUrl: string) => {
  const baseUrl = new URL(`${feedUrl}/`)
  const resolvedUrl = new URL(fileUrl, baseUrl)

  if (
    resolvedUrl.protocol !== 'https:' ||
    resolvedUrl.origin !== baseUrl.origin ||
    resolvedUrl.username ||
    resolvedUrl.password ||
    resolvedUrl.search ||
    resolvedUrl.hash
  ) {
    throw new Error("L'installateur annoncé ne se trouve pas sur le feed HTTPS épinglé.")
  }

  return resolvedUrl
}

const getDecodedPathname = (url: URL) => {
  try {
    return decodeURIComponent(url.pathname)
  } catch {
    throw new Error("L'URL de l'installateur contient un encodage invalide.")
  }
}

const assertUpdateInfoMatches = (
  updateInfo: UpdateInfo,
  manifest: VerifiedUpdateManifest,
) => {
  if (updateInfo.version !== manifest.version) {
    throw new Error('La version du manifeste signé ne correspond pas à latest.yml.')
  }

  if (!Array.isArray(updateInfo.files) || updateInfo.files.length !== 1) {
    throw new Error("Les métadonnées de mise à jour doivent annoncer un unique installateur.")
  }

  const fileInfo = updateInfo.files[0]
  const fileUrl = getUpdateFileUrl(fileInfo.url, manifest.feedUrl)
  const expectedPathname = `${getDecodedPathname(new URL(`${manifest.feedUrl}/`))}${manifest.fileName}`

  if (getDecodedPathname(fileUrl) !== expectedPathname) {
    throw new Error("Le fichier annoncé par latest.yml ne correspond pas au manifeste signé.")
  }

  if (fileInfo.sha512 !== manifest.sha512 || updateInfo.sha512 !== manifest.sha512) {
    throw new Error('Le SHA-512 de latest.yml ne correspond pas au manifeste signé.')
  }

  decodeCanonicalBase64(fileInfo.sha512, 64, 'Le SHA-512 de latest.yml')

  if (fileInfo.size !== manifest.size) {
    throw new Error("La taille de l'installateur dans latest.yml ne correspond pas au manifeste signé.")
  }

  if (updateInfo.path) {
    const historicalFileUrl = getUpdateFileUrl(updateInfo.path, manifest.feedUrl)
    if (getDecodedPathname(historicalFileUrl) !== expectedPathname) {
      throw new Error("Le chemin historique de latest.yml ne correspond pas au manifeste signé.")
    }
  }
}

const parseAndValidateManifest = (
  manifestBytes: Buffer,
  expectedFeedUrl: string,
  updateInfo: UpdateInfo,
): VerifiedUpdateManifest => {
  let parsed: unknown

  try {
    parsed = JSON.parse(decodeUtf8(manifestBytes, 'Le manifeste de mise à jour'))
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error("Le manifeste signé n'est pas un document JSON valide.")
    }
    throw error
  }

  if (!isRecord(parsed)) {
    throw new Error("Le manifeste signé n'est pas un objet JSON.")
  }

  const fields = Object.keys(parsed)
  if (
    fields.length !== MANIFEST_FIELDS.length ||
    !fields.every((field) => (MANIFEST_FIELDS as readonly string[]).includes(field))
  ) {
    throw new Error('Le manifeste signé contient des champs absents ou inconnus.')
  }

  if (
    parsed.schema !== UPDATE_MANIFEST_SCHEMA ||
    parsed.domain !== UPDATE_MANIFEST_DOMAIN ||
    parsed.keyId !== pinnedKeyId ||
    parsed.appId !== UPDATE_APP_ID ||
    parsed.feedUrl !== expectedFeedUrl ||
    parsed.platform !== UPDATE_PLATFORM ||
    parsed.arch !== UPDATE_ARCH
  ) {
    throw new Error("Le manifeste signé ne correspond pas à cette application ou à ce canal de mise à jour.")
  }

  if (process.platform !== UPDATE_PLATFORM || process.arch !== UPDATE_ARCH) {
    throw new Error("Cette release de mise à jour n'est pas compatible avec cette plateforme.")
  }

  if (typeof parsed.version !== 'string') {
    throw new Error('La version du manifeste signé est invalide.')
  }
  validateVersion(parsed.version)

  if (typeof parsed.fileName !== 'string') {
    throw new Error("Le nom de l'installateur signé est invalide.")
  }
  validateFileName(parsed.fileName)

  if (
    typeof parsed.size !== 'number' ||
    !Number.isSafeInteger(parsed.size) ||
    parsed.size <= 0 ||
    parsed.size > MAX_UPDATE_BYTES
  ) {
    throw new Error("La taille de l'installateur signée est invalide.")
  }

  if (typeof parsed.sha512 !== 'string') {
    throw new Error("Le SHA-512 signé de l'installateur est invalide.")
  }
  decodeCanonicalBase64(parsed.sha512, 64, "Le SHA-512 signé de l'installateur")

  const manifest = Object.freeze(parsed as VerifiedUpdateManifest)
  assertUpdateInfoMatches(updateInfo, manifest)
  return manifest
}

const fetchBytes = async (url: URL, maxBytes: number, accept: string) => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const response = await net.fetch(url.toString(), {
      method: 'GET',
      headers: { accept },
      redirect: 'error',
      cache: 'no-store',
      credentials: 'omit',
      bypassCustomProtocolHandlers: true,
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(`Le serveur de mise à jour a répondu avec le statut ${response.status}.`)
    }

    // Electron's net.fetch can leave Response.url empty even for a direct 200 response.
    // redirect: 'error' rejects redirects before a response is returned; this remains a
    // defense-in-depth check in case the runtime ever reports a followed redirect.
    if (response.redirected) {
      throw new Error('Le serveur de mise à jour a tenté de rediriger une ressource signée.')
    }

    const declaredLength = response.headers.get('content-length')
    if (declaredLength !== null) {
      const length = Number(declaredLength)
      if (!Number.isSafeInteger(length) || length < 0 || length > maxBytes) {
        throw new Error('Une ressource de mise à jour dépasse la taille autorisée.')
      }
    }

    if (!response.body) {
      throw new Error('Le serveur de mise à jour a renvoyé une réponse vide.')
    }

    const chunks: Buffer[] = []
    let totalBytes = 0
    const reader = response.body.getReader()

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          break
        }

        totalBytes += value.byteLength
        if (totalBytes > maxBytes) {
          await reader.cancel()
          throw new Error('Une ressource de mise à jour dépasse la taille autorisée.')
        }

        chunks.push(Buffer.from(value))
      }
    } finally {
      reader.releaseLock()
    }

    if (totalBytes === 0) {
      throw new Error('Le serveur de mise à jour a renvoyé une réponse vide.')
    }

    return Buffer.concat(chunks, totalBytes)
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error('Le serveur de mise à jour ne répond pas dans le délai autorisé.')
    }
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

export const fetchAndVerifyUpdateManifest = async ({
  feedUrl,
  updateInfo,
}: FetchAndVerifyManifestOptions) => {
  const normalizedFeedUrl = normalizeFeedUrl(feedUrl)
  validateVersion(updateInfo.version)

  const manifestName = `update-${encodeURIComponent(updateInfo.version)}.json`
  const manifestUrl = new URL(manifestName, `${normalizedFeedUrl}/`)
  const signatureUrl = new URL(`${manifestName}.sig`, `${normalizedFeedUrl}/`)
  const [manifestBytes, signatureBytes] = await Promise.all([
    fetchBytes(manifestUrl, MAX_MANIFEST_BYTES, 'application/json'),
    fetchBytes(signatureUrl, MAX_SIGNATURE_BYTES, 'text/plain'),
  ])

  const signature = getDetachedSignature(signatureBytes)
  if (!verify(null, manifestBytes, pinnedPublicKey, signature)) {
    throw new Error("La signature Ed25519 du manifeste de mise à jour n'est pas valide.")
  }

  return parseAndValidateManifest(manifestBytes, normalizedFeedUrl, updateInfo)
}

const hashUpdateFile = async (filePath: string) => {
  const hash = createHash('sha512')
  let size = 0

  for await (const chunk of createReadStream(filePath)) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += bytes.length
    if (size > MAX_UPDATE_BYTES) {
      throw new Error("L'installateur téléchargé dépasse la taille autorisée.")
    }
    hash.update(bytes)
  }

  return {
    size,
    sha512: hash.digest(),
  }
}

export const verifyDownloadedUpdate = async (
  filePath: string,
  manifest: VerifiedUpdateManifest,
) => {
  if (path.basename(filePath) !== manifest.fileName) {
    throw new Error("Le fichier téléchargé ne porte pas le nom signé par l'auteur.")
  }

  const integrity = await hashUpdateFile(filePath)
  const expectedSha512 = decodeCanonicalBase64(
    manifest.sha512,
    64,
    "Le SHA-512 signé de l'installateur",
  )

  if (
    integrity.size !== manifest.size ||
    !timingSafeEqual(integrity.sha512, expectedSha512)
  ) {
    throw new Error("L'installateur téléchargé ne correspond pas au manifeste Ed25519 signé.")
  }
}

export const getPinnedUpdateKeyId = () => pinnedKeyId
