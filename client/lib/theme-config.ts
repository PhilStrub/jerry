import { Flame, Sun, CircleDashed, Sunrise, Droplets, Waves, Moon } from "lucide-react";

export interface ThemeConfig {
  id: string;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  enabled: boolean;
}

/**
 * Theme configuration with visibility controls.
 * To hide a theme, set `enabled: false` for any theme below.
 * 
 * Example: To show only light and dark themes:
 * - Set enabled: false for sunset, black, and ocean
 * 
 * Example: To add a new theme:
 * - Add CSS definitions in globals.css
 * - Add the theme config here with enabled: true
 * - The theme will automatically appear in the toggle dropdown
 */
export const THEME_CONFIGS: ThemeConfig[] = [
  {
    id: "light",
    name: "Light",
    icon: Sun,
    enabled: true,
  },
  {
    id: "dark", 
    name: "Dark",
    icon: Flame,
    enabled: true,
  },
  {
    id: "sunset",
    name: "Sunset", 
    icon: Sunrise,
    enabled: false, // Set to false to hide this theme
  },
  {
    id: "black",
    name: "Black",
    icon: CircleDashed,
    enabled: false, // Set to false to hide this theme
  },
  {
    id: "ocean",
    name: "Ocean",
    icon: Droplets,
    enabled: false, // Set to false to hide this theme
  },
  {
    id: "coastal",
    name: "Coastal",
    icon: Waves,
    enabled: true,
  },
  {
    id: "dark-coastal",
    name: "Twilight",
    icon: Moon,
    enabled: true,
  },
];

// Get only enabled themes
export const getEnabledThemes = (): string[] => {
  return THEME_CONFIGS.filter(theme => theme.enabled).map(theme => theme.id);
};

// Get enabled theme configs  
export const getEnabledThemeConfigs = (): ThemeConfig[] => {
  return THEME_CONFIGS.filter(theme => theme.enabled);
};

// Default theme (should be one of the enabled themes)
export const DEFAULT_THEME = "dark"; 