/** The base URL is part of a project's identity: names alone can collide. */
export function getProjectPath(project: { owner: string; name: string; path?: string }): string {
  return project.path ?? `/${encodeURIComponent(project.owner)}/${encodeURIComponent(project.name)}`
}

export function parseProjectRoute(pathname: string) {
  const parts = pathname.replace(/^\//, "").split("/")
  const exactRepository = parts[0] === "repos"
  if (exactRepository) parts.shift()
  const decode = (value?: string) => {
    if (!value) return undefined
    try { return decodeURIComponent(value) } catch { return value }
  }
  return {
    owner: decode(parts[0]),
    name: decode(parts[1]),
    exactRepository,
    remainingPath: parts.length > 2 ? `/${parts.slice(2).join("/")}` : "",
    basePath: `${exactRepository ? "/repos" : ""}/${parts.slice(0, 2).join("/")}`
  }
}
