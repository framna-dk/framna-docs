import { useCallback } from "react"
import { useSessionStorage } from "usehooks-ts"
import { useProjectSelection } from "@/features/projects/data"
import { DiffbarDismissals, getDiffbarSelection, updateDiffbarDismissals } from "./diffbarDismissals"

const isDiffFeatureEnabled = process.env.NEXT_PUBLIC_ENABLE_DIFF_SIDEBAR === "true"

export default function useDiffbarOpen() {
  const { selectedOwner, selectedName, version, specification } = useProjectSelection()
  const [dismissals, setDismissals] = useSessionStorage<DiffbarDismissals>(
    "dismissedDiffbarCommits", {}, { initializeWithValue: false }
  )
  const selection = getDiffbarSelection(selectedOwner, selectedName, version?.id, specification?.diffURL)
  const branchKey = selection?.branchKey
  const sha = selection?.sha
  const isOpen = isDiffFeatureEnabled && !!selection && dismissals[selection.branchKey] !== selection.sha

  // Only explicit user actions update preferences; navigation derives visibility.
  const setOpen = useCallback((open: boolean) => {
    if (!isDiffFeatureEnabled || !branchKey || !sha) return
    setDismissals(previous => updateDiffbarDismissals(previous, { branchKey, sha }, open))
  }, [branchKey, sha, setDismissals])

  return [isOpen, setOpen] as const
}
