const SUPPORTED_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'bmp',
  'mp4',
  'webm',
  'mov',
  'mkv',
  'mp3',
  'wav',
  'ogg',
  'flac',
  'm4a',
])

export const isSupportedAttachment = (attachment) => {
  const contentType = attachment.contentType?.toLowerCase() ?? ''

  if (
    contentType.startsWith('image/') ||
    contentType.startsWith('video/') ||
    contentType.startsWith('audio/')
  ) {
    return true
  }

  const extension = attachment.name?.split('.').pop()?.toLowerCase()
  return Boolean(extension && SUPPORTED_EXTENSIONS.has(extension))
}
