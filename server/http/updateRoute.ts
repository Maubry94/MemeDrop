export const SIGNED_WINDOWS_UPDATE_ROUTE = '/updates/win-signed-v1/'

export const getSignedWindowsUpdateRequestPath = (
  method: string | undefined,
  pathname: string,
) =>
  method === 'GET' && pathname.startsWith(SIGNED_WINDOWS_UPDATE_ROUTE)
    ? pathname.slice(SIGNED_WINDOWS_UPDATE_ROUTE.length)
    : null
