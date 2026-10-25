import {
  DiffbarDismissals,
  getDiffbarSelection,
  updateDiffbarDismissals
} from "@/features/sidebar/data/diffbarDismissals"

const headSha = "a".repeat(40)
const nextSha = "b".repeat(40)

function select(branch = "feature/update", sha = headSha, path = "openapi.yaml", repository = "aurora-api", owner = "acme") {
  return getDiffbarSelection(owner, repository, branch, `/api/diff/${owner}/${repository}/${path}?baseRefOid=base&to=${sha}`)!
}

test("Dismissal follows the branch and commit across specification switches and return navigation", () => {
  const firstSpec = select()
  const secondSpec = select("feature/update", headSha, "other.yaml")
  const dismissals = updateDiffbarDismissals({}, firstSpec, false)
  expect(dismissals[secondSpec.branchKey]).toBe(secondSpec.sha)

  const otherBranch = select("feature/other")
  expect(dismissals[otherBranch.branchKey]).not.toBe(otherBranch.sha)
  expect(dismissals[select().branchKey]).toBe(headSha)
})

test("A new commit opens automatically and dismissing it replaces the previous SHA", () => {
  const first = select()
  const next = select("feature/update", nextSha)
  const dismissals = updateDiffbarDismissals({}, first, false)
  expect(dismissals[next.branchKey]).not.toBe(next.sha)

  const updated = updateDiffbarDismissals(dismissals, next, false)
  expect(updated).toEqual({ [next.branchKey]: nextSha })
})

test("Manual reopening clears only the selected branch's dismissal", () => {
  const first = select()
  const other = select("feature/other")
  let dismissals: DiffbarDismissals = updateDiffbarDismissals({}, first, false)
  dismissals = updateDiffbarDismissals(dismissals, other, false)
  dismissals = updateDiffbarDismissals(dismissals, first, true)
  expect(dismissals[first.branchKey]).toBeUndefined()
  expect(dismissals[other.branchKey]).toBe(other.sha)
})

test("A specification without changes closes without losing existing dismissals", () => {
  const selection = getDiffbarSelection("acme", "aurora-api", "develop", undefined)
  expect(selection).toBeUndefined()
  const dismissals = updateDiffbarDismissals({}, select(), false)
  expect(updateDiffbarDismissals(dismissals, selection, false)).toEqual(dismissals)
  expect(updateDiffbarDismissals(dismissals, selection, true)).toEqual(dismissals)
})

test("Dismissals are isolated by repository and owner, even with matching branches and SHAs", () => {
  const first = select()
  const otherRepository = select("feature/update", headSha, "openapi.yaml", "other-api")
  const otherOwner = select("feature/update", headSha, "openapi.yaml", "aurora-api", "other-owner")
  const dismissals = updateDiffbarDismissals({}, first, false)
  expect(dismissals[otherRepository.branchKey]).toBeUndefined()
  expect(dismissals[otherOwner.branchKey]).toBeUndefined()
})

test("Stored dismissals survive serialization for session storage", () => {
  const selection = select()
  const stored = JSON.stringify(updateDiffbarDismissals({}, selection, false))
  const restored: DiffbarDismissals = JSON.parse(stored)
  expect(restored[selection.branchKey]).toBe(selection.sha)
})

test("Incomplete selections do not open the pane", () => {
  expect(getDiffbarSelection(undefined, "aurora-api", "feature/update", "?to=sha")).toBeUndefined()
  expect(getDiffbarSelection("acme", undefined, "feature/update", "?to=sha")).toBeUndefined()
  expect(getDiffbarSelection("acme", "aurora-api", undefined, "?to=sha")).toBeUndefined()
  expect(getDiffbarSelection("acme", "aurora-api", "feature/update", "/api/diff")).toBeUndefined()
})
test("It separates diff-pane preferences for legacy and repository routes with the same name", () => {
  const diffUrl = "/api/diff/acme/aurora/api.yaml?to=same-sha"
  const legacy = getDiffbarSelection("acme", "aurora", "feature", diffUrl, "/acme/aurora")
  const monorepo = getDiffbarSelection("acme", "aurora", "feature", diffUrl, "/repos/acme/aurora")
  expect(legacy!.branchKey).not.toBe(monorepo!.branchKey)
})
