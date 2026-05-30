import { ipcRenderer } from 'electron'

type TikTokCommand = 'play' | 'pause' | 'mute' | 'unMute'

const sendToHost = (channel: string, payload?: unknown) => {
  ipcRenderer.sendToHost(channel, payload)
}

const getElementsDeep = (root: ParentNode): Element[] => {
  const elements = Array.from(root.querySelectorAll('*'))
  const shadowElements = elements.flatMap((element) =>
    element.shadowRoot ? getElementsDeep(element.shadowRoot) : [],
  )

  return [...elements, ...shadowElements]
}

const getButtons = () =>
  getElementsDeep(document).filter((element): element is HTMLButtonElement => {
    return element instanceof HTMLButtonElement
  })

const clickDeclineOptionalCookies = () => {
  const declineButton = getButtons().find((button) => {
    const label = [
      button.textContent,
      button.ariaLabel,
      button.getAttribute('title'),
      button.getAttribute('data-e2e'),
    ]
      .filter(Boolean)
      .join(' ')
      .trim()
      .toLowerCase()

    return (
      label.includes('decline optional') ||
      label.includes('decline all') ||
      label.includes('reject optional') ||
      label.includes('reject all') ||
      label.includes('refuser') ||
      label.includes('tout refuser') ||
      label.includes('cookies optionnels')
    )
  })

  declineButton?.click()
}

const startCookieBannerWatcher = () => {
  let attempts = 0
  const timer = setInterval(() => {
    attempts += 1
    clickDeclineOptionalCookies()

    if (attempts >= 40) {
      clearInterval(timer)
    }
  }, 500)
}

const sendPlayerCommand = (type: TikTokCommand) => {
  window.postMessage(
    {
      'x-tiktok-player': true,
      type,
    },
    '*',
  )

  const video = document.querySelector('video')
  if (!video) {
    return
  }

  if (type === 'play') {
    void video.play()
  }
  if (type === 'pause') {
    video.pause()
  }
  if (type === 'mute') {
    video.muted = true
  }
  if (type === 'unMute') {
    video.muted = false
  }
}

const bindVideoEvents = () => {
  const video = document.querySelector('video')
  if (!video || video.dataset.memedropBound === 'true') {
    return
  }

  video.dataset.memedropBound = 'true'
  video.addEventListener('ended', () => {
    sendToHost('tiktok-ended')
  })
  video.addEventListener('error', () => {
    sendToHost('tiktok-error')
  })
}

window.addEventListener('message', (event) => {
  const message = event.data

  if (
    message &&
    typeof message === 'object' &&
    message['x-tiktok-player'] === true &&
    typeof message.type === 'string'
  ) {
    sendToHost('tiktok-player-message', message)
  }
})

ipcRenderer.on('tiktok-command', (_event, command: TikTokCommand) => {
  sendPlayerCommand(command)
})

window.addEventListener('DOMContentLoaded', () => {
  clickDeclineOptionalCookies()
  startCookieBannerWatcher()
  bindVideoEvents()
})

const observer = new MutationObserver(() => {
  clickDeclineOptionalCookies()
  bindVideoEvents()
})

observer.observe(document.documentElement, {
  childList: true,
  subtree: true,
})
