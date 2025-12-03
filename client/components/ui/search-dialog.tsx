"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Search, Star, MessageSquareText } from "lucide-react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { type Chat } from "@/lib/db/schema"

interface SearchDialogProps {
  chats: Chat[]
  trigger?: React.ReactNode
  getCommentColor: () => string
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function SearchDialog({ chats, trigger, getCommentColor, open: externalOpen, onOpenChange }: SearchDialogProps) {
  const [internalOpen, setInternalOpen] = React.useState(false)
  const open = externalOpen !== undefined ? externalOpen : internalOpen
  const [searchQuery, setSearchQuery] = React.useState("")
  const [selectedIndex, setSelectedIndex] = React.useState(0)
  const router = useRouter()
  const inputRef = React.useRef<HTMLInputElement>(null)

  // Filter chats based on search query
  const filteredChats = React.useMemo(() => {
    if (!searchQuery.trim()) return chats
    
    const query = searchQuery.toLowerCase()
    return chats.filter(chat => 
      chat.title.toLowerCase().includes(query) ||
      (chat.comment && chat.comment.toLowerCase().includes(query))
    )
  }, [chats, searchQuery])

  // Separate filtered chats into starred and regular
  const starredChats = filteredChats.filter(chat => chat.isFavorite === 'true')
  const regularChats = filteredChats.filter(chat => chat.isFavorite !== 'true')
  const allFilteredChats = [...starredChats, ...regularChats]

  // Reset selected index when search results change
  React.useEffect(() => {
    setSelectedIndex(0)
  }, [filteredChats])

  // Focus input when dialog opens
  React.useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus()
    }
  }, [open])

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!allFilteredChats.length) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex(prev => 
          prev < allFilteredChats.length - 1 ? prev + 1 : prev
        )
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex(prev => prev > 0 ? prev - 1 : prev)
        break
      case 'Enter':
        e.preventDefault()
        if (allFilteredChats[selectedIndex]) {
          handleChatSelect(allFilteredChats[selectedIndex])
        }
        break
      case 'Escape':
        e.preventDefault()
        handleOpenChange(false)
        break
    }
  }

  // Handle chat selection
  const handleChatSelect = (chat: Chat) => {
    router.push(`/chat/${chat.id}`)
    handleOpenChange(false)
  }

  // Handle dialog close
  const handleOpenChange = (newOpen: boolean) => {
    if (onOpenChange) {
      onOpenChange(newOpen)
    } else {
      setInternalOpen(newOpen)
    }
    if (!newOpen) {
      setSearchQuery("")
      setSelectedIndex(0)
    }
  }

  // Highlight matching text
  const highlightMatch = (text: string, query: string) => {
    if (!query.trim()) return text
    
    const regex = new RegExp(`(${query})`, 'gi')
    const parts = text.split(regex)
    
    return parts.map((part, index) => 
      regex.test(part) ? (
        <mark key={index} className="bg-yellow-200 dark:bg-yellow-800 rounded px-1">
          {part}
        </mark>
      ) : part
    )
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger || (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
          >
            <Search className="h-4 w-4" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] p-0 bg-background/90 dark:bg-muted/40 dark:backdrop-blur-md">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle>Search Chats</DialogTitle>
        </DialogHeader>
        
        <div className="px-6 pb-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              ref={inputRef}
              placeholder="Search your chats..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              className="pl-10"
            />
          </div>
        </div>

        <div className="flex-1 overflow-auto max-h-[400px]">
          {allFilteredChats.length === 0 ? (
            <div className="flex items-center justify-center py-8 px-6">
              <div className="text-center">
                <Search className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">
                  {searchQuery.trim() ? "No chats found" : "Start typing to search your chats"}
                </p>
              </div>
            </div>
          ) : (
            <div className="px-3 pb-3">
              {starredChats.length > 0 && (
                <div className="mb-4">
                  <div className="px-3 py-2">
                    <h3 className="text-xs text-muted-foreground uppercase tracking-wider">
                      Starred
                    </h3>
                  </div>
                  <div className="space-y-1">
                    {starredChats.map((chat, index) => {
                      const globalIndex = index
                      return (
                        <button
                          key={chat.id}
                          onClick={() => handleChatSelect(chat)}
                          className={cn(
                            "w-full px-3 py-2 rounded-md text-left transition-colors flex items-center justify-between gap-2",
                            selectedIndex === globalIndex
                              ? "bg-sidebar-accent text-sidebar-accent-foreground"
                              : "hover:bg-sidebar-accent/50 text-sidebar-foreground"
                          )}
                        >
                          <div className="flex items-center min-w-0 flex-1">
                            <span className="truncate text-sm">
                              {highlightMatch(chat.title, searchQuery)}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            {chat.comment && (
                              <MessageSquareText 
                                className="h-3 w-3 flex-shrink-0" 
                                style={{ color: getCommentColor() }}
                              />
                            )}
                            <Star className="h-3 w-3 text-black dark:text-foreground fill-current flex-shrink-0" />
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
              
              {regularChats.length > 0 && (
                <div>
                  <div className="px-3 py-2">
                    <h3 className="text-xs text-muted-foreground uppercase tracking-wider">
                      Recents
                    </h3>
                  </div>
                  <div className="space-y-1">
                    {regularChats.map((chat, index) => {
                      const globalIndex = starredChats.length + index
                      return (
                        <button
                          key={chat.id}
                          onClick={() => handleChatSelect(chat)}
                          className={cn(
                            "w-full px-3 py-2 rounded-md text-left transition-colors flex items-center justify-between gap-2",
                            selectedIndex === globalIndex
                              ? "bg-sidebar-accent text-sidebar-accent-foreground"
                              : "hover:bg-sidebar-accent/50 text-sidebar-foreground"
                          )}
                        >
                          <div className="flex items-center min-w-0 flex-1">
                            <span className="truncate text-sm">
                              {highlightMatch(chat.title, searchQuery)}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            {chat.comment && (
                              <MessageSquareText 
                                className="h-3 w-3 flex-shrink-0" 
                                style={{ color: getCommentColor() }}
                              />
                            )}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        
        {allFilteredChats.length > 0 && (
          <div className="px-6 pb-6 pt-2">
            <p className="text-xs text-muted-foreground">
              Use ↑↓ to navigate, Enter to select, Esc to close
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}