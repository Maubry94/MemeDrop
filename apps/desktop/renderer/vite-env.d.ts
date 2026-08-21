/// <reference types="vite/client" />

interface Window {
  memedrop?: import('../shared/preloadApi').MemeDropPreloadApi
  memedropOverlay?: import('../shared/preloadApi').MemeDropOverlayPreloadApi
}
