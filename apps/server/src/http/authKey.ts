import { timingSafeEqual } from 'node:crypto'
import type http from 'node:http'

export const getRequestKey = (request: http.IncomingMessage): string => {
  const headerKey = request.headers['x-memedrop-key']
  return typeof headerKey === 'string' ? headerKey : ''
}

export const isAuthorizedRequest = (
  request: http.IncomingMessage,
  serverKey: string,
): boolean => {
  if (!serverKey) {
    return false
  }

  const requestKeyBytes = Buffer.from(getRequestKey(request), 'utf8')
  const serverKeyBytes = Buffer.from(serverKey, 'utf8')
  return (
    requestKeyBytes.length === serverKeyBytes.length &&
    timingSafeEqual(requestKeyBytes, serverKeyBytes)
  )
}
