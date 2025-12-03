"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Pencil } from "lucide-react"

interface RenameDialogProps {
  chatId: string
  currentTitle: string
  onSave: (title: string) => Promise<void>
  trigger?: React.ReactNode
}

export function RenameDialog({
  chatId,
  currentTitle,
  onSave,
  trigger
}: RenameDialogProps) {
  const [open, setOpen] = React.useState(false)
  const [title, setTitle] = React.useState(currentTitle)
  const [isLoading, setIsLoading] = React.useState(false)

  React.useEffect(() => {
    setTitle(currentTitle)
  }, [currentTitle, open])

  const handleSave = async () => {
    if (!title.trim()) return
    
    setIsLoading(true)
    try {
      await onSave(title.trim())
      setOpen(false)
    } catch (error) {
      console.error("Failed to save title:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleCancel = () => {
    setTitle(currentTitle)
    setOpen(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSave()
    } else if (e.key === 'Escape') {
      handleCancel()
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
          >
            <Pencil className="h-3 w-3" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Rename Chat</DialogTitle>
          <DialogDescription>
            Enter a new name for this chat.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="title">Chat Name</Label>
            <Input
              id="title"
              placeholder="Enter chat name..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
              maxLength={100}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isLoading || !title.trim()}>
            {isLoading ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}