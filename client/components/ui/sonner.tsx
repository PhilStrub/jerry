"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, ToasterProps } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      style={
        {
          "--normal-bg": "hsl(var(--muted) / 0.15)",
          "--normal-text": "var(--foreground)",
          "--normal-border": "hsl(var(--border) / 0.2)",
          "--success-bg": "hsl(var(--muted) / 0.15)",
          "--success-text": "var(--foreground)",
          "--success-border": "hsl(var(--border) / 0.2)",
          "--error-bg": "hsl(var(--muted) / 0.15)",
          "--error-text": "var(--foreground)",
          "--error-border": "hsl(var(--border) / 0.2)",
          "--warning-bg": "hsl(var(--muted) / 0.15)",
          "--warning-text": "var(--foreground)",
          "--warning-border": "hsl(var(--border) / 0.2)",
          "--info-bg": "hsl(var(--muted) / 0.15)",
          "--info-text": "var(--foreground)",
          "--info-border": "hsl(var(--border) / 0.2)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "backdrop-blur-lg",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
