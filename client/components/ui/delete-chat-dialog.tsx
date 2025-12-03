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

interface DeleteChatDialogProps {
  chatId: string
  onDelete: (chatId: string, e: React.MouseEvent) => Promise<void>
  trigger?: React.ReactNode
}

export function DeleteChatDialog({
  chatId,
  onDelete,
  trigger
}: DeleteChatDialogProps) {
  const [open, setOpen] = React.useState(false)
  const [isDeleting, setIsDeleting] = React.useState(false)

  const handleDelete = async (e: React.MouseEvent) => {
    setIsDeleting(true)
    try {
      await onDelete(chatId, e)
      setOpen(false)
    } catch (error) {
      console.error("Failed to delete chat:", error)
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Delete Chat</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete this chat? This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button 
            variant="outline" 
            onClick={() => setOpen(false)}
            className="hover:bg-accent hover:text-accent-foreground hover:shadow-sm hover:scale-[1.02] transition-all duration-200"
          >
            Cancel
          </Button>
          <Button 
            onClick={handleDelete} 
            disabled={isDeleting}
            variant="destructive"
            className="hover:bg-red-500 hover:shadow-lg hover:scale-[1.02] hover:brightness-110 transition-all duration-200"
          >
            {isDeleting ? "Deleting..." : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}