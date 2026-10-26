import type { ProjectDiscoveryRepository } from "@/features/projects/domain/IProjectDiscoveryRepository"

export default function parseGitHubRepository(input: string): ProjectDiscoveryRepository | undefined {
  let path = input.trim()
  if (path.startsWith("github.com/")) path = `https://${path}`
  if (path.includes("://")) {
    try {
      const url = new URL(path)
      if (url.protocol !== "https:" || url.hostname !== "github.com" || url.port || url.username || url.password) return undefined
      path = url.pathname.replace(/^\//, "")
    } catch {
      return undefined
    }
  }
  path = path.replace(/\/$/, "").replace(/\.git$/, "")
  const match = /^([a-z\d][a-z\d-]{0,38})\/([a-z\d._-]{1,100})$/i.exec(path)
  if (!match || match[2] === "." || match[2] === "..") return undefined
  return { owner: match[1], name: match[2] }
}
