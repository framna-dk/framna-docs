import type { ISession } from "@/common"
import { type default as RegisterProject, ProjectRegistrationError } from "../domain/RegisterProject"

export default function createRegisterProjectHandler(config: {
  session: Pick<ISession, "getIsAuthenticated">
  registration: Pick<RegisterProject, "register">
}) {
  return async (request: Request): Promise<Response> => {
    if (!await config.session.getIsAuthenticated()) {
      return Response.json({ error: "Sign in to add a project." }, { status: 401 })
    }
    const origin = request.headers.get("origin")
    if (origin && origin !== new URL(request.url).origin) {
      return Response.json({ error: "Request origin is not allowed." }, { status: 403 })
    }
    if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") {
      return Response.json({ error: "Send the repository as JSON." }, { status: 415 })
    }
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return Response.json({ error: "Enter a GitHub repository URL or owner/repository." }, { status: 400 })
    }
    if (typeof body !== "object" || body === null || !("repository" in body) || typeof body.repository !== "string" || body.repository.length > 500) {
      return Response.json({ error: "Enter a GitHub repository URL or owner/repository." }, { status: 400 })
    }
    try {
      const project = await config.registration.register(body.repository)
      return Response.json({ project })
    } catch (error) {
      if (error instanceof ProjectRegistrationError) {
        return Response.json({ error: error.message }, { status: error.status })
      }
      console.error("Failed to add project:", error)
      return Response.json({ error: "We couldn't add the project right now. Please try again." }, { status: 500 })
    }
  }
}
