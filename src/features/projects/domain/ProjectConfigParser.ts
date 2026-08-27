import { parse } from "yaml"
import { ZodError } from "zod"
import IProjectConfig, { IProjectConfigSchema } from "./IProjectConfig"

export type ProjectConfigParseResult =
  | { readonly config: IProjectConfig; readonly error?: undefined }
  | { readonly config: null; readonly error: string }

export default class ProjectConfigParser {
  parse(rawConfig: string): IProjectConfig {
    const obj = parse(rawConfig)
    if (obj === null) {
      return {}
    }
    return IProjectConfigSchema.parse(obj)
  }

  tryParse(rawConfig: string): ProjectConfigParseResult {
    try {
      return { config: this.parse(rawConfig) }
    } catch (error) {
      return { config: null, error: formatConfigError(error) }
    }
  }
}

function formatConfigError(error: unknown): string {
  if (error instanceof ZodError) {
    return error.issues
      .map(issue => issue.path.length > 0 ? `${issue.path.join(".")}: ${issue.message}` : issue.message)
      .join("; ")
  }
  return error instanceof Error ? error.message : String(error)
}
