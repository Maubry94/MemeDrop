export const compareAppVersions = (currentVersion: string, expectedVersion: string) => {
  const currentParts = currentVersion.split(/[.-]/).map((part) => Number(part))
  const expectedParts = expectedVersion.split(/[.-]/).map((part) => Number(part))
  const partsLength = Math.max(currentParts.length, expectedParts.length)

  for (let index = 0; index < partsLength; index += 1) {
    const currentPart = currentParts[index] ?? 0
    const expectedPart = expectedParts[index] ?? 0

    if (!Number.isFinite(currentPart) || !Number.isFinite(expectedPart)) {
      return currentVersion.localeCompare(expectedVersion)
    }
    if (currentPart !== expectedPart) {
      return currentPart - expectedPart
    }
  }

  return 0
}

export const getReleaseUrl = (version: string) =>
  `https://github.com/Maubry94/MemeDrop/releases/tag/${version}`
