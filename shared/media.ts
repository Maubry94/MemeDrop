import type { Drop } from './types.js'

export type MediaKind = 'none' | 'image' | 'video' | 'audio' | 'youtube' | 'tiktok' | 'file'

export const getMediaKind = (drop: Drop | null): MediaKind => {
  if (!drop) {
    return 'none'
  }

  const type = drop.contentType?.toLowerCase() ?? ''
  if (type === 'video/youtube' || drop.youtubeVideoId) return 'youtube'
  if (type === 'video/tiktok' || drop.tiktokVideoId) return 'tiktok'
  if (type.startsWith('image/')) return 'image'
  if (type.startsWith('video/')) return 'video'
  if (type.startsWith('audio/')) return 'audio'

  const ext = drop.fileName?.split('.').pop()?.toLowerCase()
  if (!ext) {
    return 'file'
  }

  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(ext)) return 'image'
  if (['mp4', 'webm', 'mov', 'mkv'].includes(ext)) return 'video'
  if (['mp3', 'wav', 'ogg', 'flac', 'm4a'].includes(ext)) return 'audio'
  return 'file'
}
