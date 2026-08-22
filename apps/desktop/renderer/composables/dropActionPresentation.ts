export type DropActionAvailability = {
  canSkipCurrentDrop: boolean
  hasServerDrop: boolean
  isCurrentServerDropOwner: boolean
  dropsEnabled: boolean
  isTestDropActive: boolean
}

export type DropActionPresentation = {
  skipDescription: string
  stopDescription: string
  previewDisabledReason: string | null
}

export const getDropActionPresentation = ({
  canSkipCurrentDrop,
  hasServerDrop,
  isCurrentServerDropOwner,
  dropsEnabled,
  isTestDropActive,
}: DropActionAvailability): DropActionPresentation => ({
  skipDescription: isTestDropActive
    ? "Utilise « Fermer l'aperçu » pour masquer ce test local."
    : canSkipCurrentDrop
      ? 'Le drop continue chez les autres utilisateurs.'
      : "Aucun drop n'est en cours sur cet appareil.",
  stopDescription: !hasServerDrop
    ? "Aucun drop serveur n'est en cours."
    : !isCurrentServerDropOwner
      ? "Seul l'auteur du drop peut l'arrêter pour tout le monde."
      : 'Le drop sera arrêté chez tous les destinataires.',
  previewDisabledReason: !dropsEnabled
    ? "Activer les drops pour afficher l'aperçu."
    : hasServerDrop && !isTestDropActive
      ? "Attends la fin du drop en cours pour afficher l'aperçu."
      : null,
})
