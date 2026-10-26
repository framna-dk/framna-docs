import { NextRequest, NextResponse } from "next/server"
import { session, projectListDataSource, registerProject } from "@/composition"
import { env, makeUnauthenticatedAPIErrorResponse } from "@/common"
import createRegisterProjectHandler from "@/features/new-project/data/createRegisterProjectHandler"

export const POST = createRegisterProjectHandler({ session, registration: registerProject, publicUrl: env.getOrThrow("NEXTAUTH_URL") })

export async function GET(request: NextRequest) {
  const isAuthenticated = await session.getIsAuthenticated()
  if (!isAuthenticated) {
    return makeUnauthenticatedAPIErrorResponse()
  }
  const refresh = request.nextUrl.searchParams.get("refresh") === "true"
  try {
    const projects = await projectListDataSource.getProjectList({ refresh })
    return NextResponse.json({ projects })
  } catch (error) {
    console.error("Failed to fetch project list:", error)
    return NextResponse.json(
      { error: "Failed to fetch project list" },
      { status: 500 }
    )
  }
}
