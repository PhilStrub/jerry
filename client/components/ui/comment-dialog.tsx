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
import { Textarea } from "@/components/ui/textarea"
import { MessageSquareIcon, Edit3 } from "lucide-react"

interface CommentDialogProps {
  chatId: string
  currentComment?: string
  onSave: (comment: string) => Promise<void>
  trigger?: React.ReactNode
}

export function CommentDialog({
  chatId,
  currentComment = "",
  onSave,
  trigger
}: CommentDialogProps) {
  const [open, setOpen] = React.useState(false)
  const [comment, setComment] = React.useState(currentComment)
  const [isLoading, setIsLoading] = React.useState(false)
  const [isEditing, setIsEditing] = React.useState(false)

  React.useEffect(() => {
    setComment(currentComment)
    setIsEditing(!currentComment) // Auto-edit mode if no comment exists
  }, [currentComment, open])

  const handleSave = async () => {
    setIsLoading(true)
    try {
      await onSave(comment)
      setIsEditing(false)
      setOpen(false)
    } catch (error) {
      console.error("Failed to save comment:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleCancel = () => {
    setComment(currentComment)
    setIsEditing(false)
    if (!currentComment) {
      setOpen(false)
    }
  }

  const handleEdit = () => {
    setIsEditing(true)
  }

  const handleClose = () => {
    setComment(currentComment)
    setIsEditing(!currentComment)
    setOpen(false)
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
            <MessageSquareIcon className="h-3 w-3" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[800px]">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            Chat Comment
            {!isEditing && currentComment && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleEdit}
                className="ml-4 mr-8"
              >
                Edit Comment
              </Button>
            )}
          </DialogTitle>
          <DialogDescription>
            {isEditing 
              ? "Add a comment to help you remember what this chat is about."
              : "View your comment for this chat."
            }
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="comment">Comment</Label>
            {isEditing ? (
              <Textarea
                id="comment"
                placeholder="Enter your comment here..."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                className="min-h-[200px]"
                autoFocus
              />
            ) : (
              <div className="min-h-[200px] p-3 border rounded-md bg-muted/30">
                {currentComment ? (
                  <p className="text-sm whitespace-pre-wrap">{currentComment}</p>
                ) : (
                  <p className="text-sm text-muted-foreground italic">No comment yet</p>
                )}
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          {isEditing ? (
            <>
              <Button variant="outline" onClick={handleCancel}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={isLoading}>
                {isLoading ? "Saving..." : "Save Comment"}
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={handleClose}>
              Close
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}