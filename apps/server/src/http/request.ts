import type http from 'node:http'
import { isIP } from 'node:net'

const REQUEST_BASE_URL = 'http://memedrop.invalid'
const MAX_REQUEST_TARGET_LENGTH = 8 * 1024
const MAX_HOST_HEADER_LENGTH = 255
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/

export type ParsedHostHeader = {
  host: string
  hostname: string
}

export const parseHostHeader = (value: string | undefined): ParsedHostHeader | null => {
  if (
    !value ||
    value.length > MAX_HOST_HEADER_LENGTH ||
    CONTROL_CHARACTER_PATTERN.test(value) ||
    /[\s,\\/@]/.test(value)
  ) {
    return null
  }

  try {
    const url = new URL(`http://${value}`)
    if (
      url.protocol !== 'http:' ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash ||
      !url.hostname
    ) {
      return null
    }

    return {
      host: url.host,
      hostname: url.hostname.toLowerCase(),
    }
  } catch {
    return null
  }
}

const hasUnsafeDecodedPath = (requestTarget: string) => {
  const encodedPath = requestTarget.split('?', 1)[0] ?? ''

  try {
    const decodedPath = decodeURIComponent(encodedPath)
    if (
      decodedPath.includes('\\') ||
      decodedPath.includes('\0') ||
      CONTROL_CHARACTER_PATTERN.test(decodedPath)
    ) {
      return true
    }

    return decodedPath.split('/').some((segment) => segment === '.' || segment === '..')
  } catch {
    return true
  }
}

export const parseRequestUrl = (requestTarget: string | undefined): URL | null => {
  if (
    !requestTarget ||
    requestTarget.length > MAX_REQUEST_TARGET_LENGTH ||
    !requestTarget.startsWith('/') ||
    requestTarget.startsWith('//') ||
    requestTarget.includes('#') ||
    requestTarget.includes('\\') ||
    CONTROL_CHARACTER_PATTERN.test(requestTarget) ||
    hasUnsafeDecodedPath(requestTarget)
  ) {
    return null
  }

  try {
    const url = new URL(requestTarget, REQUEST_BASE_URL)
    return url.origin === REQUEST_BASE_URL ? url : null
  } catch {
    return null
  }
}

export const isLoopbackHostname = (hostname: string) =>
  hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'

export const parsePublicBaseUrl = (value: string): string | null => {
  try {
    const url = new URL(value.trim())
    if (
      (url.protocol !== 'https:' &&
        !(url.protocol === 'http:' && isLoopbackHostname(url.hostname.toLowerCase()))) ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    ) {
      return null
    }

    return url.origin
  } catch {
    return null
  }
}

const getSingleHeader = (value: string | string[] | undefined): string | null =>
  typeof value === 'string' && !value.includes(',') ? value : null

export const getSafeOAuthBaseUrl = (
  request: http.IncomingMessage,
  configuredBaseUrl?: string,
): string | null => {
  if (configuredBaseUrl?.trim()) {
    return parsePublicBaseUrl(configuredBaseUrl)
  }

  const forwardedHost = getSingleHeader(request.headers['x-forwarded-host'])
  const parsedHost = parseHostHeader(forwardedHost ?? request.headers.host)
  if (!parsedHost || !isLoopbackHostname(parsedHost.hostname)) {
    return null
  }

  const forwardedProtocol = getSingleHeader(request.headers['x-forwarded-proto'])
  const protocol = forwardedProtocol ?? 'http'
  if (protocol !== 'http' && protocol !== 'https') {
    return null
  }

  return `${protocol}://${parsedHost.host}`
}

export const getRequestPeerKey = (
  request: http.IncomingMessage,
  trustProxy = false,
) => {
  if (trustProxy) {
    const forwardedFor = request.headers['x-forwarded-for']
    if (typeof forwardedFor === 'string' && !forwardedFor.includes(',')) {
      const forwardedAddress = forwardedFor.trim()
      if (isIP(forwardedAddress) !== 0) {
        return forwardedAddress
      }
    }
  }

  return request.socket.remoteAddress || 'unknown'
}
