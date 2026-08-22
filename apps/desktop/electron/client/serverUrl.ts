const LOOPBACK_HTTP_URL_PATTERN =
  /^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:[/?#]|$)/i

export const toMemeDropServerUrl = (serverUrl: string): URL => {
  const trimmedUrl = serverUrl.trim()
  const normalizedUrl = /^https?:\/\//i.test(trimmedUrl)
    ? trimmedUrl
    : `https://${trimmedUrl}`
  const url = new URL(normalizedUrl)
  const isAllowedLoopbackHttp = LOOPBACK_HTTP_URL_PATTERN.test(trimmedUrl)

  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.protocol === 'http:' && !isAllowedLoopbackHttp)
  ) {
    throw new Error(
      "L'URL MemeDrop doit utiliser HTTPS, sauf pour localhost, 127.0.0.1 ou [::1].",
    )
  }

  return url
}
