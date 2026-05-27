import type http from 'node:http'

export const getRequestKey = (request: http.IncomingMessage, requestUrl: URL): string => {
  const headerKey = request.headers['x-memedrop-key']
  return (
    requestUrl.searchParams.get('key') ??
    (Array.isArray(headerKey) ? headerKey[0] : headerKey) ??
    ''
  )
}

export const isAuthorizedRequest = (
  request: http.IncomingMessage,
  requestUrl: URL,
  serverKey: string,
): boolean => {
  if (!serverKey) {
    return true
  }

  return getRequestKey(request, requestUrl) === serverKey
}
