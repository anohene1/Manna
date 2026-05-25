import { useEffect } from "react"
import { Workspace } from "@/components/layout/workspace"
import { useRemoteControl } from "@/hooks/use-remote-control"
import { hydrateSettings } from "@/stores"
import { ResumeSessionDialog } from "@/components/resume-session-dialog"
import { SettingsDialog } from "@/components/settings-dialog"
import { Toaster } from "sonner"

export function App() {
  useRemoteControl()

  useEffect(() => {
    hydrateSettings()
  }, [])

  return (
    <>
      <Workspace />
      <ResumeSessionDialog />
      {/* Mounted at root so it works on the landing screen too, not just
          once a workspace toolbar is visible. */}
      <SettingsDialog />
      <Toaster position="top-right" />
    </>
  )
}

export default App
