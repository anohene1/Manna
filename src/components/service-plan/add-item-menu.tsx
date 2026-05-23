import { useState } from "react"
import { PlusIcon } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { useServicePlan } from "@/hooks/use-service-plan"
import { AddVerseDialog } from "./add-verse-dialog"
import { AddSongDialog } from "./add-song-dialog"

export function AddItemMenu() {
  const { addItem } = useServicePlan()
  const [open, setOpen] = useState(false)
  const [verseDialogOpen, setVerseDialogOpen] = useState(false)
  const [songDialogOpen, setSongDialogOpen] = useState(false)

  const addSection = async () => {
    await addItem("section", { type: "section", label: "New Section" })
    setOpen(false)
  }
  const addAnnouncement = async () => {
    await addItem("announcement", {
      type: "announcement",
      title: "New Announcement",
      body: "",
    })
    setOpen(false)
  }
  const addBlank = async () => {
    await addItem("blank", { type: "blank", showLogo: true })
    setOpen(false)
  }
  const addMomo = async () => {
    await addItem("momo", { type: "momo" })
    setOpen(false)
  }
  const addJesus = async () => {
    await addItem("jesus", { type: "jesus" })
    setOpen(false)
  }
  const addVerse = () => {
    setOpen(false)
    setVerseDialogOpen(true)
  }
  const addSong = () => {
    setOpen(false)
    setSongDialogOpen(true)
  }

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" className="gap-1.5">
            <PlusIcon className="size-3.5" />
            Add
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={addSection}>Section header</DropdownMenuItem>
          <DropdownMenuItem onClick={addAnnouncement}>Announcement</DropdownMenuItem>
          <DropdownMenuItem onClick={addBlank}>Blank / logo</DropdownMenuItem>
          <DropdownMenuItem onClick={addMomo}>MoMo</DropdownMenuItem>
          <DropdownMenuItem onClick={addJesus}>Jesus</DropdownMenuItem>
          <DropdownMenuItem onClick={addVerse}>Verse…</DropdownMenuItem>
          <DropdownMenuItem onClick={addSong}>Song…</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AddVerseDialog open={verseDialogOpen} onOpenChange={setVerseDialogOpen} />
      <AddSongDialog open={songDialogOpen} onOpenChange={setSongDialogOpen} />
    </>
  )
}
