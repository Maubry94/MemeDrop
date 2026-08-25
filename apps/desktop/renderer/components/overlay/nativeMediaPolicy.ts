export const IMAGE_DISPLAY_TIMEOUT_MS = 9_000

export const getImageDisplayTimeout = (keepImageVisible: boolean) =>
  keepImageVisible ? null : IMAGE_DISPLAY_TIMEOUT_MS
