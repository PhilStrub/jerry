"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Separator } from "./ui/separator";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { Copy, Check, Settings as SettingsIcon } from "lucide-react";
import { MCPServer } from "@/lib/context/mcp-context";
import { MCPServerManager } from "./mcp-server-manager";
import { getEnabledThemeConfigs } from "@/lib/theme-config";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";

type Section = "general" | "mcp" | "theme";

export interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  onUserIdChange: (newUserId: string) => void;
  mcpServers: MCPServer[];
  selectedMcpServers: string[];
  onServersChange: (servers: MCPServer[]) => void;
  onSelectedServersChange: (ids: string[]) => void;
}

export function SettingsDialog({
  open,
  onOpenChange,
  userId,
  onUserIdChange,
  mcpServers,
  selectedMcpServers,
  onServersChange,
  onSelectedServersChange,
}: SettingsDialogProps) {
  const { setTheme, theme } = useTheme();
  const [active, setActive] = useState<Section>("general");
  const [editUserId, setEditUserId] = useState<string>(userId);
  const [copied, setCopied] = useState(false);
  const [accent, setAccent] = useState<string>(() => {
    if (typeof window === 'undefined') return 'default';
    return localStorage.getItem('accent-color') || 'default';
  });
  
  const enabledThemes = getEnabledThemeConfigs();

  // Ensure saved accent is applied after initial render
  // so CSS variables reflect the choice without calling during render.
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('accent-color') || 'default';
      // Apply on mount and whenever theme changes so theme vars don't stomp accent
      applyAccent(saved);
    }
  }, [theme]);

  const copyUserId = async () => {
    try {
      await navigator.clipboard.writeText(userId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {}
  };

  const saveUserId = () => {
    if (!editUserId.trim() || editUserId === userId) return;
    onUserIdChange(editUserId.trim());
  };

  const applyAccent = (key: string) => {
    setAccent(key);
    if (typeof window === 'undefined') return;
    localStorage.setItem('accent-color', key);
    const root = document.documentElement as HTMLElement;
    const isDark = theme === 'dark';
    
    const map: Record<string, { light: { primary: string; foreground: string }, dark: { primary: string; foreground: string } }> = {
      default: { 
        light: { primary: 'oklch(0.90 0.00 0)', foreground: 'oklch(0.20 0 0)' },
        dark: { primary: 'oklch(0.35 0.00 0)', foreground: '#ffffff' }
      },
      blue: { 
        light: { primary: '#8bb5f2', foreground: '#0a0a0a' },
        dark: { primary: '#6b9def', foreground: '#ffffff' }
      },
      green: { 
        light: { primary: '#7dd87f', foreground: '#0a0a0a' },
        dark: { primary: '#5cb85f', foreground: '#ffffff' }
      },
      yellow: { 
        light: { primary: '#f0c674', foreground: '#0a0a0a' },
        dark: { primary: '#d4a83a', foreground: '#ffffff' }
      },
      pink: { 
        light: { primary: '#f299c4', foreground: '#0a0a0a' },
        dark: { primary: '#e879a7', foreground: '#ffffff' }
      },
      orange: { 
        light: { primary: '#fba85c', foreground: '#0a0a0a' },
        dark: { primary: '#f8924c', foreground: '#ffffff' }
      },
      purple: { 
        light: { primary: '#b49df2', foreground: '#0a0a0a' },
        dark: { primary: '#9c7ef0', foreground: '#ffffff' }
      },
    };
    
    const colorConfig = map[key] || map.default;
    const cfg = isDark ? colorConfig.dark : colorConfig.light;
    
    // Set both accent and primary variables for consistent theming
    root.style.setProperty('--accent', cfg.primary);
    root.style.setProperty('--accent-foreground', cfg.foreground);
    root.style.setProperty('--primary', cfg.primary);
    root.style.setProperty('--primary-foreground', cfg.foreground);
    root.style.setProperty('--sidebar-primary', cfg.primary);
    root.style.setProperty('--sidebar-primary-foreground', cfg.foreground);
    // Ring follows accent via CSS (globals.css sets --ring: var(--accent))
  };

  const ACCENT_OPTIONS = [
    { key: 'default', color: '#808080', label: 'Default (Grey)' },
    { key: 'blue', color: '#8bb5f2', label: 'Blue' },
    { key: 'green', color: '#7dd87f', label: 'Green' },
    { key: 'yellow', color: '#f0c674', label: 'Yellow' },
    { key: 'pink', color: '#f299c4', label: 'Pink' },
    { key: 'orange', color: '#fba85c', label: 'Orange' },
    { key: 'purple', color: '#b49df2', label: 'Purple' },
  ] as const;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[860px] w-[860px] h-[85vh] overflow-hidden flex flex-col p-6 bg-background/90 dark:bg-muted/40 dark:backdrop-blur-md">
        <DialogHeader className="pt-2">
          <DialogTitle className="flex items-center gap-2">
            <SettingsIcon className="h-5 w-5 text-muted-foreground" />
            Settings
          </DialogTitle>
        </DialogHeader>

        <div className="flex gap-6 flex-1 min-h-0">
          {/* Left nav */}
          <div className="w-52 flex-shrink-0 space-y-1 pr-2">
            {(
              [
                { id: "general", label: "General" },
                { id: "mcp", label: "MCP servers" },
                { id: "theme", label: "Theme" },
              ] as { id: Section; label: string }[]
            ).map((s) => (
              <button
                key={s.id}
                className={cn(
                  "w-full text-left text-sm px-3 py-2 rounded-md hover:bg-secondary/80 transition-colors",
                  active === s.id && "bg-secondary text-secondary-foreground"
                )}
                onClick={() => setActive(s.id)}
              >
                {s.label}
              </button>
            ))}
          </div>

          <Separator orientation="vertical" className="h-auto" />

          {/* Right content */}
          <div className="flex-1 min-w-0 overflow-y-auto pr-1">
            {active === "general" && (
              <div className="space-y-8 pr-4">
                <div>
                  <Label className="text-xs">User ID</Label>
                  <div className="mt-2 flex items-center gap-2">
                    <Input value={editUserId} onChange={(e) => setEditUserId(e.target.value)} />
                    <Button variant="outline" onClick={copyUserId} className="gap-1.5">
                      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      {copied ? "Copied" : "Copy"}
                    </Button>
                    <Button onClick={saveUserId}>Save</Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Saving updates your local User ID and reloads chats.</p>
                </div>
              </div>
            )}

            {active === "mcp" && (
              <div className="space-y-4 pr-2">
                <MCPServerManager
                  servers={mcpServers}
                  onServersChange={onServersChange}
                  selectedServers={selectedMcpServers}
                  onSelectedServersChange={onSelectedServersChange}
                  embedded
                />
              </div>
            )}

            {active === "theme" && (
              <div className="space-y-8 pr-2 pt-1">
                <div>
                  <Label className="text-xs mb-1 block">Theme</Label>
                  <Select value={(theme as string) ?? "light"} onValueChange={(v) => setTheme(v)}>
                    <SelectTrigger aria-label="Theme" className="min-w-[180px]">
                      <SelectValue placeholder="Select theme" />
                    </SelectTrigger>
                    <SelectContent>
                      {enabledThemes.map((themeConfig) => {
                        const IconComponent = themeConfig.icon;
                        return (
                          <SelectItem key={themeConfig.id} value={themeConfig.id}>
                            <div className="flex items-center gap-2">
                              <IconComponent className="h-4 w-4" />
                              {themeConfig.name}
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs mb-2 block">Accent color</Label>
                  <div className="grid grid-cols-7 gap-4 max-w-[560px]">
                    {ACCENT_OPTIONS.map(opt => (
                      <button
                        key={opt.key}
                        className={cn(
                          'group flex flex-col items-center gap-1 rounded-md p-2.5 transition-colors hover:bg-muted/60',
                          accent === opt.key && 'bg-muted'
                        )}
                        onClick={() => applyAccent(opt.key)}
                        aria-pressed={accent === opt.key}
                      >
                        <span
                          className={cn(
                            'h-7 w-7 rounded-full shadow-inner',
                            accent === opt.key && 'ring-2 ring-offset-2 ring-accent ring-offset-background'
                          )}
                          style={{ background: opt.color }}
                        />
                        <span className="text-[11px] text-muted-foreground">{opt.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}


