import { jest } from "@jest/globals"
import type { IKeyValueStore } from "@/common/key-value-store"
import { CachingOasDiffCalculator } from "@/features/diff/data/CachingOasDiffCalculator"
import type { DiffResult, IOasDiffCalculator } from "@/features/diff/data/IOasDiffCalculator"

const baseSha = "a".repeat(40)
const headSha = "b".repeat(40)
const args: Parameters<IOasDiffCalculator["calculateDiff"]> = [
    "acme", "aurora-api", "openapi.yaml", baseSha, headSha
]
const result: DiffResult = { from: baseSha, to: headSha, changes: [] }

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
    const calculator = new CachingOasDiffCalculator({ calculator: { calculateDiff }, store })
    return { calculator, calculateDiff, store, advance: (seconds: number) => { now += seconds } }
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

test("It returns the calculation even when cache reads and writes fail", async () => {
    const { calculator, store } = setup()
    store.get = async () => { throw new Error("Redis unavailable") }
    store.setExpiring = async () => { throw new Error("Redis unavailable") }
    expect(await calculator.calculateDiff(...args)).toEqual(result)
})

test("It replaces unreadable cached data with a fresh calculation", async () => {
    const { calculator, calculateDiff, store } = setup()
    const get = store.get.bind(store)
    store.get = async () => "invalid JSON"
    expect(await calculator.calculateDiff(...args)).toEqual(result)
    store.get = get
    expect(await calculator.calculateDiff(...args)).toEqual(result)
    expect(calculateDiff).toHaveBeenCalledTimes(1)
})
