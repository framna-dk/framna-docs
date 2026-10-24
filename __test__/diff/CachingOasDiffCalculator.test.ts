import { jest } from "@jest/globals"
import type { IKeyValueStore } from "@/common/key-value-store"
import type IGitHubClient from "@/common/github/IGitHubClient"
import { CachingOasDiffCalculator } from "@/features/diff/data/CachingOasDiffCalculator"
import type { DiffResult, IOasDiffCalculator } from "@/features/diff/data/IOasDiffCalculator"

const baseSha = "a".repeat(40)
const headSha = "b".repeat(40)
const args: Parameters<IOasDiffCalculator["calculateDiff"]> = [
    "acme", "aurora-api", "openapi.yaml", baseSha, headSha
]
const result: DiffResult = { from: baseSha, to: headSha, changes: [] }

afterEach(() => jest.restoreAllMocks())

function setup() {
    let now = 0
    const entries = new Map<string, { data: string; expiresAt: number }>()
    const store: IKeyValueStore = {
        async get(key) {
            const entry = entries.get(key)
            return entry && entry.expiresAt > now ? entry.data : null
        },
        async set() {},
        async setExpiring(key, data, ttl) {
            entries.set(key, { data: String(data), expiresAt: now + ttl })
        },
        async delete(key) { entries.delete(key) }
    }
    const calculateDiff = jest.fn<IOasDiffCalculator["calculateDiff"]>().mockResolvedValue(result)
    const getRepositoryContent = jest.fn<IGitHubClient["getRepositoryContent"]>()
        .mockResolvedValue({ downloadURL: "https://example.com/openapi.yaml" })
    const calculator = new CachingOasDiffCalculator({
        calculator: { calculateDiff }, store, gitHubClient: { getRepositoryContent }
    })
    return { calculator, calculateDiff, getRepositoryContent, store, advance: (seconds: number) => { now += seconds } }
}

test("It reuses cached results, including empty diffs, until the seven-day expiry", async () => {
    const { calculator, calculateDiff, advance } = setup()
    expect(await calculator.calculateDiff(...args)).toEqual(result)
    advance(7 * 24 * 60 * 60 - 1)
    expect(await calculator.calculateDiff(...args)).toEqual(result)
    expect(calculateDiff).toHaveBeenCalledTimes(1)
    advance(1)
    await calculator.calculateDiff(...args)
    expect(calculateDiff).toHaveBeenCalledTimes(2)
    expect(calculateDiff).toHaveBeenLastCalledWith(...args)
})

test.each([
    [0, "other-owner"],
    [1, "other-api"],
    [2, "other.yaml"],
    [3, "c".repeat(40)],
    [4, "c".repeat(40)]
])("It separates comparisons when argument %i changes", async (index, value) => {
    const { calculator, calculateDiff } = setup()
    await calculator.calculateDiff(...args)
    const differentArgs = [...args] as typeof args
    differentArgs[Number(index)] = String(value)
    await calculator.calculateDiff(...differentArgs)
    expect(calculateDiff).toHaveBeenCalledTimes(2)
})

test.each([3, 4])("It bypasses the cache when argument %i is a mutable ref", async (index) => {
    const { calculator, calculateDiff } = setup()
    const mutableArgs = [...args] as typeof args
    mutableArgs[index] = "feature/update"
    await calculator.calculateDiff(...mutableArgs)
    await calculator.calculateDiff(...mutableArgs)
    expect(calculateDiff).toHaveBeenCalledTimes(2)
})

test("It retries calculations after a failure instead of caching the failure", async () => {
    const { calculator, calculateDiff } = setup()
    calculateDiff.mockRejectedValueOnce(new Error("Unavailable"))
    await expect(calculator.calculateDiff(...args)).rejects.toThrow("Unavailable")
    expect(await calculator.calculateDiff(...args)).toEqual(result)
    expect(calculateDiff).toHaveBeenCalledTimes(2)
})

test("It does not cache error results", async () => {
    const { calculator, calculateDiff } = setup()
    calculateDiff.mockResolvedValueOnce({ ...result, error: "Unavailable" })
    await calculator.calculateDiff(...args)
    expect(await calculator.calculateDiff(...args)).toEqual(result)
    expect(calculateDiff).toHaveBeenCalledTimes(2)
})

test("It rechecks current-user access before each cache hit and denies revoked access", async () => {
    const { calculator, calculateDiff, getRepositoryContent, store } = setup()
    const readCache = jest.spyOn(store, "get")
    await calculator.calculateDiff(...args)
    expect(await calculator.calculateDiff(...args)).toEqual(result)
    expect(calculateDiff).toHaveBeenCalledTimes(1)
    expect(getRepositoryContent).toHaveBeenCalledTimes(2)
    expect(getRepositoryContent).toHaveBeenLastCalledWith({
        repositoryOwner: args[0], repositoryName: args[1], path: args[2], ref: headSha
    })

    getRepositoryContent.mockRejectedValueOnce(new Error("Access revoked"))
    await expect(calculator.calculateDiff(...args)).rejects.toThrow("Access revoked")
    expect(readCache).toHaveBeenCalledTimes(2)
    expect(calculateDiff).toHaveBeenCalledTimes(1)
})

test("It denies unauthorized requests on cache misses and mutable refs", async () => {
    const { calculator, calculateDiff, getRepositoryContent, store } = setup()
    const readCache = jest.spyOn(store, "get")
    getRepositoryContent.mockRejectedValue(new Error("Forbidden"))
    await expect(calculator.calculateDiff(...args)).rejects.toThrow("Forbidden")
    await expect(calculator.calculateDiff(args[0], args[1], args[2], baseSha, "feature/update"))
        .rejects.toThrow("Forbidden")
    expect(readCache).not.toHaveBeenCalled()
    expect(calculateDiff).not.toHaveBeenCalled()
})

test("It retries new-file results so transient base fetch failures can recover", async () => {
    const { calculator, calculateDiff, store } = setup()
    const writeCache = jest.spyOn(store, "setExpiring")
    calculateDiff.mockResolvedValueOnce({ ...result, isNewFile: true })
    expect(await calculator.calculateDiff(...args)).toEqual({ ...result, isNewFile: true })
    expect(writeCache).not.toHaveBeenCalled()
    expect(await calculator.calculateDiff(...args)).toEqual(result)
    expect(await calculator.calculateDiff(...args)).toEqual(result)
    expect(calculateDiff).toHaveBeenCalledTimes(2)
})

test("It discards previously cached new-file results", async () => {
    const { calculator, calculateDiff, store } = setup()
    store.get = async () => JSON.stringify({ ...result, isNewFile: true })
    expect(await calculator.calculateDiff(...args)).toEqual(result)
    expect(calculateDiff).toHaveBeenCalledTimes(1)
})

test("It returns the calculation even when cache reads and writes fail", async () => {
    const { calculator, store } = setup()
    const logError = jest.spyOn(console, "error").mockImplementation(() => {})
    const readError = new Error("Redis read unavailable")
    const writeError = new Error("Redis write unavailable")
    store.get = async () => { throw readError }
    store.setExpiring = async () => { throw writeError }
    expect(await calculator.calculateDiff(...args)).toEqual(result)
    expect(logError).toHaveBeenCalledTimes(2)
    expect(logError).toHaveBeenCalledWith("Failed to read cached diff:", readError)
    expect(logError).toHaveBeenCalledWith("Failed to cache diff:", writeError)
})

test("It replaces unreadable cached data with a fresh calculation", async () => {
    const { calculator, calculateDiff, store } = setup()
    const logError = jest.spyOn(console, "error").mockImplementation(() => {})
    const get = store.get.bind(store)
    store.get = async () => "invalid JSON"
    expect(await calculator.calculateDiff(...args)).toEqual(result)
    store.get = get
    expect(await calculator.calculateDiff(...args)).toEqual(result)
    expect(calculateDiff).toHaveBeenCalledTimes(1)
    expect(logError).toHaveBeenCalledWith("Failed to read cached diff:", expect.any(SyntaxError))
})
