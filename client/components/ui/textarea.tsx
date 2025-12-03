import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        // Remove hard border; use subtle background and soft ring for focus
        "placeholder:text-muted-foreground flex field-sizing-content min-h-16 w-full rounded-xl bg-muted/60 dark:bg-muted/50 ocean:bg-muted/50 px-4 py-3 text-base shadow-xs transition-[color,box-shadow,background] outline-none",
        // Gentle focus treatment similar to OpenAI
        "focus-visible:ring-[2px] focus-visible:ring-ring/40 focus-visible:outline-none",
        // Validation states remain soft
        "aria-invalid:ring-destructive/15 dark:aria-invalid:ring-destructive/30 ocean:aria-invalid:ring-destructive/30",
        // Disabled state
        "disabled:cursor-not-allowed disabled:opacity-60 md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
