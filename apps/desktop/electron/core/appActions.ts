import { app } from 'electron'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'

type AppActionsOptions = {
  setQuitting: () => void
}

export const createAppActions = ({ setQuitting }: AppActionsOptions) => {
  const quitApp = () => {
    setQuitting()
    app.quit()
  }

  const uninstallApp = () => {
    if (!app.isPackaged) {
      throw new Error("La désinstallation est disponible uniquement sur l'application installée.")
    }

    const installDir = path.dirname(process.execPath)
    const candidates = [
      path.join(installDir, 'Uninstall MemeDrop.exe'),
      path.join(installDir, `Uninstall ${app.getName()}.exe`),
      path.join(installDir, 'Uninstall.exe'),
    ]
    const uninstaller = candidates.find((candidate) => existsSync(candidate))

    if (!uninstaller) {
      throw new Error("L'outil de désinstallation est introuvable.")
    }

    app.setLoginItemSettings({ openAtLogin: false, args: [] })
    setQuitting()

    const child = spawn(uninstaller, [], {
      detached: true,
      stdio: 'ignore',
    })

    child.unref()
    app.quit()
  }

  return {
    quitApp,
    uninstallApp,
  }
}
