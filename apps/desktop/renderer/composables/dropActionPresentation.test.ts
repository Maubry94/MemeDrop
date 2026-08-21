import assert from 'node:assert/strict'
import test from 'node:test'
import { getDropActionPresentation } from './dropActionPresentation.ts'

const availableActions = {
  canSkipCurrentDrop: true,
  hasServerDrop: true,
  isCurrentServerDropOwner: true,
  dropsEnabled: true,
  isTestDropActive: false,
}

test('describes the local and global scope of available drop actions', () => {
  const presentation = getDropActionPresentation(availableActions)

  assert.equal(presentation.skipDescription, 'Le drop continue chez les autres utilisateurs.')
  assert.equal(presentation.stopDescription, 'Le drop sera arrêté chez tous les destinataires.')
  assert.equal(
    presentation.previewDisabledReason,
    "Attends la fin du drop en cours pour afficher l'aperçu.",
  )
})

test('explains why actions are unavailable', () => {
  const noDrop = getDropActionPresentation({
    ...availableActions,
    canSkipCurrentDrop: false,
    hasServerDrop: false,
  })
  assert.equal(noDrop.skipDescription, "Aucun drop n'est en cours sur cet appareil.")
  assert.equal(noDrop.stopDescription, "Aucun drop serveur n'est en cours.")
  assert.equal(noDrop.previewDisabledReason, null)

  const anotherAuthor = getDropActionPresentation({
    ...availableActions,
    isCurrentServerDropOwner: false,
  })
  assert.equal(
    anotherAuthor.stopDescription,
    "Seul l'auteur du drop peut l'arrêter pour tout le monde.",
  )

  const paused = getDropActionPresentation({
    ...availableActions,
    hasServerDrop: false,
    dropsEnabled: false,
  })
  assert.equal(paused.previewDisabledReason, "Activer les drops pour afficher l'aperçu.")

  const preview = getDropActionPresentation({
    ...availableActions,
    canSkipCurrentDrop: false,
    hasServerDrop: false,
    isTestDropActive: true,
  })
  assert.equal(
    preview.skipDescription,
    "Utilise « Fermer l'aperçu » pour masquer ce test local.",
  )
})
