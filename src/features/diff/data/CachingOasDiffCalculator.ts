import type { IKeyValueStore } from "@/common/key-value-store"
import type { DiffResult, IOasDiffCalculator } from "./IOasDiffCalculator"

const cacheTimeToLiveInSeconds = 7 * 24 * 60 * 60
const commitShaPattern = /^[a-f0-9]{40}$/i

export class CachingOasDiffCalculator implements IOasDiffCalculator {
    constructor(private readonly config: {
        calculator: IOasDiffCalculator
        store: IKeyValueStore
    }) {}

    async calculateDiff(
        owner: string,
        repository: string,
        path: string,
        baseRefOid: string,
        toRef: string
    ): Promise<DiffResult> {
        // Mutable refs must not reuse a result after their branch moves.
        if (!commitShaPattern.test(baseRefOid) || !commitShaPattern.test(toRef)) {
            return this.config.calculator.calculateDiff(owner, repository, path, baseRefOid, toRef)
        }

        const key = `oasDiff:v1:${JSON.stringify([owner, repository, path, baseRefOid, toRef])}`
        try {
            const cached = await this.config.store.get(key)
            if (cached !== null) {
                return JSON.parse(cached) as DiffResult
            }
        } catch (error) {
            console.error("Failed to read cached diff:", error)
            // A cache outage or unreadable entry must not prevent calculation.
        }

        const result = await this.config.calculator.calculateDiff(owner, repository, path, baseRefOid, toRef)
        if (!result.error) {
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
