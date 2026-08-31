import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'

const MAX_METADATA_BYTES = 64 * 1024
const MAX_VERSION_LENGTH = 64
const DEFAULT_REFRESH_INTERVAL_MS = 5_000
const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/

type AppVersionLogger = Pick<Console, 'warn'>

export type LatestAppVersionProvider = {
  getLatestAppVersion: () => string
  refresh: () => Promise<void>
  dispose: () => void
}

const validateAppVersion = (value: unknown, source: string): string => {
  if (typeof value !== 'string') {
    throw new Error(`Version MemeDrop invalide dans ${source}.`)
  }

  const version = value.trim()
  if (
    !version
    || version.length > MAX_VERSION_LENGTH
    || !SEMVER_PATTERN.test(version)
  ) {
    throw new Error(`Version MemeDrop invalide dans ${source}.`)
  }

  return version
}

const parseYamlScalar = (value: string): unknown => {
  const trimmedValue = value.trim()

  if (trimmedValue.startsWith('"')) {
    if (!trimmedValue.endsWith('"')) {
      throw new Error('Valeur YAML entre guillemets incomplète.')
    }
    return JSON.parse(trimmedValue) as unknown
  }

  if (trimmedValue.startsWith("'")) {
    if (!trimmedValue.endsWith("'")) {
      throw new Error('Valeur YAML entre apostrophes incomplète.')
    }
    return trimmedValue.slice(1, -1).replace(/''/g, "'")
  }

  return trimmedValue
}

export const parseLatestAppVersion = (metadata: string): string => {
  const versionValues = metadata
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .flatMap((line) => {
      const match = /^version:[ \t]*(.*?)[ \t]*$/.exec(line)
      return match ? [match[1] ?? ''] : []
    })

  if (versionValues.length !== 1) {
    throw new Error('latest.yml doit contenir exactement une version au niveau racine.')
  }

  return validateAppVersion(parseYamlScalar(versionValues[0] ?? ''), 'latest.yml')
}

export const readBundledAppVersion = async (metadataPath: string): Promise<string> => {
  const metadata = JSON.parse(await readFile(metadataPath, 'utf8')) as unknown
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    throw new Error('Métadonnées de version embarquées invalides.')
  }

  return validateAppVersion(
    (metadata as { latestAppVersion?: unknown }).latestAppVersion,
    metadataPath,
  )
}

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error)

export const createLatestAppVersionProvider = async ({
  updatesDirectory,
  fallbackVersion,
  refreshIntervalMs = DEFAULT_REFRESH_INTERVAL_MS,
  logger = console,
}: {
  updatesDirectory?: string
  fallbackVersion: string
  refreshIntervalMs?: number
  logger?: AppVersionLogger
}): Promise<LatestAppVersionProvider> => {
  const normalizedFallbackVersion = validateAppVersion(fallbackVersion, 'le fallback embarqué')
  if (!Number.isSafeInteger(refreshIntervalMs) || refreshIntervalMs < 0) {
    throw new Error('L’intervalle de lecture de latest.yml doit être un entier positif ou nul.')
  }

  const metadataPath = updatesDirectory
    ? path.resolve(updatesDirectory, 'latest.yml')
    : null
  let latestAppVersion = normalizedFallbackVersion
  let lastReadError: string | null = null
  let refreshPromise: Promise<void> | null = null
  let refreshTimer: NodeJS.Timeout | null = null
  let disposed = false

  const performRefresh = async () => {
    if (!metadataPath || disposed) {
      return
    }

    try {
      const metadataStats = await stat(metadataPath)
      if (!metadataStats.isFile() || metadataStats.size > MAX_METADATA_BYTES) {
        throw new Error('latest.yml est absent, invalide ou trop volumineux.')
      }

      const metadataBuffer = await readFile(metadataPath)
      if (metadataBuffer.byteLength > MAX_METADATA_BYTES) {
        throw new Error('latest.yml est trop volumineux.')
      }

      const metadata = new TextDecoder('utf-8', { fatal: true }).decode(metadataBuffer)
      latestAppVersion = parseLatestAppVersion(metadata)
      lastReadError = null
    } catch (error) {
      const errorMessage = getErrorMessage(error)
      if (errorMessage !== lastReadError) {
        logger.warn(
          `Version publiée illisible dans ${metadataPath} (${errorMessage}). Version conservée : ${latestAppVersion}.`,
        )
        lastReadError = errorMessage
      }
    }
  }

  const refresh = () => {
    if (!metadataPath || disposed) {
      return Promise.resolve()
    }
    if (!refreshPromise) {
      refreshPromise = performRefresh().finally(() => {
        refreshPromise = null
      })
    }
    return refreshPromise
  }

  await refresh()

  if (metadataPath && refreshIntervalMs > 0) {
    refreshTimer = setInterval(() => {
      void refresh()
    }, refreshIntervalMs)
    refreshTimer.unref()
  }

  return {
    getLatestAppVersion: () => latestAppVersion,
    refresh,
    dispose: () => {
      disposed = true
      if (refreshTimer) {
        clearInterval(refreshTimer)
        refreshTimer = null
      }
    },
  }
}
