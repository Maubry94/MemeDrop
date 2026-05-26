export const getRequestKey = (request, requestUrl) => {
  const headerKey = request.headers['x-memedrop-key']
  return (
    requestUrl.searchParams.get('key') ??
    (Array.isArray(headerKey) ? headerKey[0] : headerKey) ??
    ''
  )
}

export const isAuthorizedRequest = (request, requestUrl, serverKey) => {
  if (!serverKey) {
    return true
  }

  return getRequestKey(request, requestUrl) === serverKey
}
