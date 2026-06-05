import type { BrowserWindow } from 'electron'
import { createReadStream, statSync } from 'node:fs'
import http from 'node:http'
import path from 'node:path'

export type RendererView = 'overlay' | 'control'

const getContentType = (filePath: string) => {
  const extension = path.extname(filePath).toLowerCase()

  switch (extension) {
    case '.html':
      return 'text/html; charset=utf-8'
    case '.js':
    case '.mjs':
      return 'text/javascript; charset=utf-8'
    case '.css':
      return 'text/css; charset=utf-8'
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.svg':
      return 'image/svg+xml'
    case '.ico':
      return 'image/x-icon'
    case '.json':
      return 'application/json; charset=utf-8'
    default:
      return 'application/octet-stream'
  }
}

const isPathInside = (filePath: string, rootPath: string) => {
  const relativePath = path.relative(rootPath, filePath)
  return Boolean(relativePath) && !relativePath.startsWith('..') && !path.isAbsolute(relativePath)
}

export const createRendererServer = ({
  rendererDist,
  devServerUrl,
}: {
  rendererDist: string
  devServerUrl?: string
}) => {
  let rendererServer: http.Server | null = null
  let rendererServerUrl: string | null = null

  const start = () =>
    new Promise<string>((resolve, reject) => {
      if (rendererServerUrl) {
        resolve(rendererServerUrl)
        return
      }

      rendererServer = http.createServer((request, response) => {
        const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1')
        const requestedPath = requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname
        const filePath = path.normalize(path.join(rendererDist, decodeURIComponent(requestedPath)))

        if (!isPathInside(filePath, rendererDist)) {
          response.writeHead(403)
          response.end()
          return
        }

        try {
          const stat = statSync(filePath)

          if (!stat.isFile()) {
            response.writeHead(404)
            response.end()
            return
          }

          response.writeHead(200, {
            'content-type': getContentType(filePath),
          })
          createReadStream(filePath).pipe(response)
        } catch {
          response.writeHead(404)
          response.end()
        }
      })

      rendererServer.once('error', reject)
      rendererServer.listen(0, 'localhost', () => {
        const address = rendererServer?.address()

        if (!address || typeof address === 'string') {
          reject(new Error('Adresse du serveur renderer invalide.'))
          return
        }

        rendererServerUrl = `http://localhost:${address.port}`
        resolve(rendererServerUrl)
      })
    })

  const loadView = (window: BrowserWindow, view: RendererView) => {
    if (devServerUrl) {
      const url = new URL(devServerUrl)
      url.searchParams.set('view', view)
      window.loadURL(url.toString())
      return
    }

    if (!rendererServerUrl) {
      throw new Error('Le serveur renderer MemeDrop n’est pas démarré.')
    }

    const url = new URL(rendererServerUrl)
    url.searchParams.set('view', view)
    window.loadURL(url.toString())
  }

  const close = () => {
    rendererServer?.close()
    rendererServer = null
    rendererServerUrl = null
  }

  return {
    start,
    loadView,
    close,
  }
}
