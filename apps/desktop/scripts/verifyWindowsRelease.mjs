import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repositoryRoot = path.resolve(desktopRoot, '../..')
const releaseDir = path.join(repositoryRoot, 'release', 'signed')
const resourcesUpdateConfig = path.join(
  releaseDir,
  'win-unpacked',
  'resources',
  'app-update.yml',
)
const unpackedExecutable = path.join(releaseDir, 'win-unpacked', 'MemeDrop.exe')
const latestMetadata = path.join(releaseDir, 'latest.yml')

const readJson = async (filePath) => JSON.parse(await readFile(filePath, 'utf8'))
const packageJson = await readJson(path.join(desktopRoot, 'package.json'))
const updatePolicy = await readJson(path.join(desktopRoot, 'build', 'update-policy.json'))
const expectedPublishers = Array.isArray(updatePolicy.windowsPublisherNames)
  ? [...new Set(updatePolicy.windowsPublisherNames.map((value) => String(value).trim()).filter(Boolean))]
  : []

const parseYamlScalar = (rawValue) => {
  const value = rawValue.trim()

  if (value.startsWith('"') && value.endsWith('"')) {
    return JSON.parse(value)
  }

  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replace(/''/g, "'")
  }

  return value
}

const getTopLevelScalar = (source, key) => {
  const prefix = `${key}:`
  const line = source.split(/\r?\n/).find((candidate) => candidate.startsWith(prefix))
  const rawValue = line?.slice(prefix.length).trim()

  if (!rawValue) {
    throw new Error(`Champ YAML absent ou vide : ${key}.`)
  }

  return parseYamlScalar(rawValue)
}

const getTopLevelList = (source, key) => {
  const lines = source.split(/\r?\n/)
  const prefix = `${key}:`
  const keyIndex = lines.findIndex((line) => line.startsWith(prefix))

  if (keyIndex < 0) {
    throw new Error(`Liste YAML absente : ${key}.`)
  }

  const inlineValue = lines[keyIndex].slice(prefix.length).trim()
  if (inlineValue) {
    throw new Error(`La liste YAML ${key} doit utiliser une entrée par ligne.`)
  }

  const values = []
  for (const line of lines.slice(keyIndex + 1)) {
    if (line && !/^\s/.test(line)) {
      break
    }

    const match = line.match(/^\s+-\s+(.+)$/)
    if (match?.[1]) {
      values.push(parseYamlScalar(match[1]))
    }
  }

  return values
}

if (process.platform !== 'win32') {
  throw new Error('La vérification Authenticode doit être exécutée sous Windows.')
}

if (expectedPublishers.length === 0) {
  throw new Error('build/update-policy.json doit épingler au moins un éditeur Windows.')
}

const updateConfig = await readFile(resourcesUpdateConfig, 'utf8')
const latest = await readFile(latestMetadata, 'utf8')
const configuredUrl = getTopLevelScalar(updateConfig, 'url')
const configuredPublishers = getTopLevelList(updateConfig, 'publisherName')
const publishAutoUpdate = getTopLevelScalar(updateConfig, 'publishAutoUpdate')

if (configuredUrl !== updatePolicy.feedUrl) {
  throw new Error(
    `Feed inattendu dans app-update.yml : ${configuredUrl} (attendu : ${updatePolicy.feedUrl}).`,
  )
}

if (publishAutoUpdate !== 'true') {
  throw new Error("app-update.yml n'active pas explicitement publishAutoUpdate.")
}

if (
  JSON.stringify([...configuredPublishers].sort()) !==
  JSON.stringify([...expectedPublishers].sort())
) {
  throw new Error(
    `Éditeurs inattendus dans app-update.yml : ${configuredPublishers.join(', ') || 'aucun'}.`,
  )
}

const metadataVersion = getTopLevelScalar(latest, 'version')
const installerRelativePath = getTopLevelScalar(latest, 'path')
const expectedSha512 = getTopLevelScalar(latest, 'sha512')

if (metadataVersion !== packageJson.version) {
  throw new Error(
    `Version inattendue dans latest.yml : ${metadataVersion} (attendue : ${packageJson.version}).`,
  )
}

const installerPath = path.resolve(releaseDir, installerRelativePath)
if (path.dirname(installerPath) !== releaseDir) {
  throw new Error(`Chemin d'installateur interdit dans latest.yml : ${installerRelativePath}.`)
}

const installerContent = await readFile(installerPath)
const actualSha512 = createHash('sha512').update(installerContent).digest('base64')

if (actualSha512 !== expectedSha512) {
  throw new Error("Le SHA-512 de l'installateur ne correspond pas exactement à latest.yml.")
}

const blockmapPath = `${installerPath}.blockmap`
const blockmapStat = await stat(blockmapPath)
if (!blockmapStat.isFile() || blockmapStat.size === 0) {
  throw new Error(`Blockmap absente ou vide : ${path.basename(blockmapPath)}.`)
}

const powershellScript = [
  '$signature = Get-AuthenticodeSignature -LiteralPath $env:MEMEDROP_SIGNED_FILE_PATH',
  '$certificate = $signature.SignerCertificate',
  '$publisher = if ($null -eq $certificate) { $null } else { $certificate.GetNameInfo([System.Security.Cryptography.X509Certificates.X509NameType]::SimpleName, $false) }',
  '$timestampSubject = if ($null -eq $signature.TimeStamperCertificate) { $null } else { $signature.TimeStamperCertificate.Subject }',
  '[PSCustomObject]@{ Status = $signature.Status.ToString(); Publisher = $publisher; TimestampSubject = $timestampSubject } | ConvertTo-Json -Compress',
].join('; ')

for (const signedFilePath of [installerPath, unpackedExecutable]) {
  const result = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', powershellScript],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        MEMEDROP_SIGNED_FILE_PATH: signedFilePath,
      },
    },
  )

  if (result.error) {
    throw new Error(`Impossible de lancer PowerShell : ${result.error.message}`)
  }

  if (result.status !== 0) {
    throw new Error(
      `Impossible de vérifier ${path.basename(signedFilePath)} : ${String(result.stderr ?? '').trim() || 'PowerShell a échoué sans message.'}`,
    )
  }

  const output = String(result.stdout ?? '').trim()
  if (!output) {
    throw new Error(`PowerShell n'a retourné aucune signature pour ${path.basename(signedFilePath)}.`)
  }

  let signature
  try {
    signature = JSON.parse(output)
  } catch {
    throw new Error(`Réponse PowerShell invalide pour ${path.basename(signedFilePath)}.`)
  }

  const publisher = String(signature.Publisher ?? '').trim()

  if (signature.Status !== 'Valid') {
    throw new Error(
      `Signature Authenticode invalide pour ${path.basename(signedFilePath)} : ${signature.Status}.`,
    )
  }

  if (!expectedPublishers.includes(publisher)) {
    throw new Error(
      `Éditeur Authenticode inattendu pour ${path.basename(signedFilePath)} : ${publisher || 'absent'}.`,
    )
  }

  if (!String(signature.TimestampSubject ?? '').trim()) {
    throw new Error(`La signature de ${path.basename(signedFilePath)} n'est pas horodatée.`)
  }
}

console.log(
  `Release ${packageJson.version} validée : feed HTTPS, éditeur épinglé, SHA-512, blockmap et signatures Authenticode horodatées.`,
)
