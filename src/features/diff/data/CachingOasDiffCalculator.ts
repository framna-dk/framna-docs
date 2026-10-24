import type { IKeyValueStore } from "@/common/key-value-store"
import type IGitHubClient from "@/common/github/IGitHubClient"
import type { DiffResult, IOasDiffCalculator } from "./IOasDiffCalculator"

const cacheTimeToLiveInSeconds = 7 * 24 * 60 * 60
const commitShaPattern = /^[a-f0-9]{40}$/i

export class CachingOasDiffCalculator implements IOasDiffCalculator {
    constructor(private readonly config: {
        calculator: IOasDiffCalculator
        store: IKeyValueStore
        gitHubClient: Pick<IGitHubClient, "getRepositoryContent">
    }) {}

    async calculateDiff(
        owner: string,
        repository: string,
        path: string,
        baseRefOid: string,
        toRef: string
    ): Promise<DiffResult> {
        // Always authorize with the current user's credentials, even on cache hits.
        // Keep this outside cache-error recovery so revoked access fails closed.
        await this.config.gitHubClient.getRepositoryContent({
            repositoryOwner: owner,
            repositoryName: repository,
            path,
            ref: toRef
        })

        // Mutable refs must not reuse a result after their branch moves.
        if (!commitShaPattern.test(baseRefOid) || !commitShaPattern.test(toRef)) {
            return this.config.calculator.calculateDiff(owner, repository, path, baseRefOid, toRef)
        }

        const key = `oasDiff:v1:${JSON.stringify([owner, repository, path, baseRefOid, toRef])}`
        try {
            const cached = await this.config.store.get(key)
            if (cached !== null) {
                const result = JSON.parse(cached) as DiffResult
                if (!result.error && !result.isNewFile) {
                    return result
                }
            }
        } catch (error) {
            console.error("Failed to read cached diff:", error)
            // A cache outage or unreadable entry must not prevent calculation.
        }

        const result = await this.config.calculator.calculateDiff(owner, repository, path, baseRefOid, toRef)
        // New-file results may represent transient failures fetching the base spec.
        if (!result.error && !result.isNewFile) {
            try {
                await this.config.store.setExpiring(key, JSON.stringify(result), cacheTimeToLiveInSeconds)
            } catch (error) {
                console.error("Failed to cache diff:", error)
                // The calculated result is still usable if caching fails.
            }
        }
        return result
    }
}
