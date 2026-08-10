import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import path from 'node:path'
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

const resolveStaticPath = (rootDir: string, requestPath: string) => {
  const rootPath = path.resolve(rootDir)
  let relativePath: string

  try {
    relativePath = decodeURIComponent(requestPath).replace(/^\/+/, '')
  } catch {
    return null
  }

  const filePath = path.resolve(rootPath, relativePath)

  if (filePath !== rootPath && !filePath.startsWith(`${rootPath}${path.sep}`)) {
    return null
  }

  return filePath
}

export const sendStaticFile = async (
  response: http.ServerResponse,
  rootDir: string,
  requestPath: string,
) => {
  const filePath = resolveStaticPath(rootDir, requestPath)

  if (!filePath) {
    response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' })
    response.end('Forbidden.\n')
    return
  }

  try {
    const fileStat = await stat(filePath)

    if (!fileStat.isFile()) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
      response.end('File not found.\n')
      return
    }

    response.writeHead(200, {
      'cache-control': 'no-store',
      'content-length': fileStat.size,
      'content-type': getContentType(filePath),
    })
    createReadStream(filePath).pipe(response)
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    response.end('File not found.\n')
  }
}
