export type DiffbarDismissals = Record<string, string>

interface DiffbarSelection {
  branchKey: string
  sha: string
}

export function getDiffbarSelection(
  owner: string | undefined,
  repository: string | undefined,
  branch: string | undefined,
  diffUrl: string | undefined,
  projectPath?: string
): DiffbarSelection | undefined {
  if (!owner || !repository || !branch || !diffUrl) return undefined
  const sha = new URLSearchParams(diffUrl.split("?")[1]).get("to")
  if (!sha) return undefined
  return { branchKey: JSON.stringify([owner, projectPath ?? repository, branch]), sha }
}

export function updateDiffbarDismissals(
  dismissals: DiffbarDismissals,
  selection: DiffbarSelection | undefined,
  isOpen: boolean
): DiffbarDismissals {
  if (!selection) return dismissals
  if (!isOpen) return { ...dismissals, [selection.branchKey]: selection.sha }
  const updated = { ...dismissals }
  delete updated[selection.branchKey]
  return updated
}
