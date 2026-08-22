import { rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const mode = process.argv[2]

if (mode !== 'local' && mode !== 'update' && mode !== 'signed') {
  throw new Error("Dossier de release attendu : 'local', 'update' ou 'signed'.")
}

const desktopRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repositoryRoot = path.resolve(desktopRoot, '../..')
const releaseRoot = path.join(repositoryRoot, 'release')
const target = path.resolve(releaseRoot, mode)

if (path.dirname(target) !== releaseRoot) {
  throw new Error(`Refus de nettoyer un dossier hors de release : ${target}`)
}

await rm(target, { recursive: true, force: true })
console.log(`Ancien dossier de build supprimé : release/${mode} (artefacts régénérables).`)
