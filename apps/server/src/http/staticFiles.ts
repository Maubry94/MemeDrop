import { createReadStream } from 'node:fs'
import { realpath, stat } from 'node:fs/promises'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import type http from 'node:http'

const contentTypes: Record<string, string> = {
  '.blockmap': 'application/octet-stream',
  '.exe': 'application/vnd.microsoft.portable-executable',
  '.json': 'application/json; charset=utf-8',
  '.sig': 'application/octet-stream',
  '.yml': 'application/x-yaml; charset=utf-8',
}

const getContentType = (filePath: string) =>
  contentTypes[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream'

const isPathInside = (candidatePath: string, rootPath: string) =>
  candidatePath === rootPath || candidatePath.startsWith(`${rootPath}${path.sep}`)

const isMissingPathError = (error: unknown) => {
  if (!error || typeof error !== 'object' || !('code' in error)) {
    return false
  }

  return error.code === 'ENOENT' || error.code === 'ENOTDIR'
}

export const resolveStaticPath = (rootDir: string, requestPath: string) => {
  const rootPath = path.resolve(rootDir)
  let relativePath: string

  try {
    relativePath = decodeURIComponent(requestPath).replace(/^\/+/, '')
  } catch {
    return null
  }

  if (
    relativePath.includes('\0') ||
    relativePath.includes('\\') ||
    relativePath.split('/').some((segment) => segment === '.' || segment === '..')
  ) {
    return null
  }

  const filePath = path.resolve(rootPath, relativePath)

  if (!isPathInside(filePath, rootPath)) {
    return null
  }

  return filePath
}

export const sendStaticFile = async (
  response: http.ServerResponse,
  rootDir: string,
  requestPath: string,
  headOnly = false,
) => {
  const filePath = resolveStaticPath(rootDir, requestPath)

  if (!filePath) {
    response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' })
    response.end('Forbidden.\n')
    return
  }

  try {
    const [realRootPath, realFilePath] = await Promise.all([
      realpath(path.resolve(rootDir)),
      realpath(filePath),
    ])

    if (!isPathInside(realFilePath, realRootPath)) {
      response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' })
      response.end('Forbidden.\n')
      return
    }

    const fileStat = await stat(realFilePath)

    if (!fileStat.isFile()) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
      response.end('File not found.\n')
      return
    }

    response.writeHead(200, {
      'cache-control': 'no-store',
      'content-length': fileStat.size,
      'content-type': getContentType(realFilePath),
    })
    if (headOnly) {
      response.end()
      return
    }
    await pipeline(createReadStream(realFilePath), response)
  } catch (error) {
    if (response.headersSent) {
      if (!response.destroyed) {
        response.destroy(error instanceof Error ? error : undefined)
      }
      return
    }

    if (isMissingPathError(error)) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
      response.end('File not found.\n')
      return
    }

    throw error
  }
}
