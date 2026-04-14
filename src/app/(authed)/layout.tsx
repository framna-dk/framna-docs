import { redirect } from "next/navigation";
import { SessionProvider } from "next-auth/react";
import { session } from "@/composition";
import ErrorHandler from "@/common/ui/ErrorHandler";
import SessionBarrier from "@/features/auth/view/SessionBarrier";
import ProjectListContextProvider from "@/features/projects/view/ProjectListContextProvider";
import ProjectDetailsContextProvider from "@/features/projects/view/ProjectDetailsContextProvider";
import {
  SidebarTogglableContextProvider,
  SplitView,
} from "@/features/sidebar/view";

export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const isAuthenticated = await session.getIsAuthenticated();
  if (!isAuthenticated) {
    return redirect("/api/auth/signin");
  }

  return (
    <ErrorHandler>
      <SessionProvider>
        <SessionBarrier>
          <ProjectListContextProvider>
            <ProjectDetailsContextProvider>
              <SidebarTogglableContextProvider>
                <SplitView>{children}</SplitView>
              </SidebarTogglableContextProvider>
            </ProjectDetailsContextProvider>
          </ProjectListContextProvider>
        </SessionBarrier>
      </SessionProvider>
    </ErrorHandler>
  );
}
