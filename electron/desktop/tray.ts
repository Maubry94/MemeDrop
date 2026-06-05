import { Menu, Tray } from 'electron'

type MemeDropTrayOptions = {
  windowIcon: string
  getDropsEnabled: () => boolean
  getHideOwnDrops: () => boolean
  onShowControlWindow: () => void
  onToggleDrops: () => void
  onToggleHideOwnDrops: () => void
  onQuit: () => void
}

export const createMemeDropTray = ({
  windowIcon,
  getDropsEnabled,
  getHideOwnDrops,
  onShowControlWindow,
  onToggleDrops,
  onToggleHideOwnDrops,
  onQuit,
}: MemeDropTrayOptions) => {
  let tray: Tray | null = null

  const updateMenu = () => {
    if (!tray) {
      return
    }

    tray.setContextMenu(
      Menu.buildFromTemplate([
        {
          label: 'Afficher MemeDrop',
          click: onShowControlWindow,
        },
        {
          label: getDropsEnabled() ? 'Desactiver les drops' : 'Activer les drops',
          click: onToggleDrops,
        },
        {
          label: getHideOwnDrops() ? 'Voir mes drops' : 'Masquer mes drops',
          click: onToggleHideOwnDrops,
        },
        { type: 'separator' },
        {
          label: 'Quitter',
          click: onQuit,
        },
      ]),
    )
  }

  const create = () => {
    if (tray) {
      return
    }

    tray = new Tray(windowIcon)
    tray.setToolTip('MemeDrop')
    tray.on('click', onShowControlWindow)
    updateMenu()
  }

  const destroy = () => {
    tray?.destroy()
    tray = null
  }

  return {
    create,
    updateMenu,
    destroy,
  }
}
