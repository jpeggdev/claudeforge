import { useState, useEffect } from 'react'

export interface ThemeConfig {
  theme: 'light' | 'dark' | 'system'
  accentColor: string
  radius: string
}

export function useTheme() {
  const [themeConfig, setThemeConfig] = useState<ThemeConfig>({
    theme: 'dark',
    accentColor: '262 83% 58%',
    radius: '0.75rem'
  })

  // Load theme configuration from API
  useEffect(() => {
    fetch('/api/config/theme')
      .then(res => res.json())
      .then(data => {
        setThemeConfig(data)
      })
      .catch(err => {
        console.error('Failed to load theme config:', err)
      })
  }, [])

  // Apply theme to document
  useEffect(() => {
    const root = document.documentElement
    
    // Determine actual theme based on config
    let actualTheme = themeConfig.theme
    if (themeConfig.theme === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      actualTheme = prefersDark ? 'dark' : 'light'
    }
    
    // Apply theme class
    if (actualTheme === 'dark') {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
    
    // Apply custom CSS variables
    root.style.setProperty('--primary', themeConfig.accentColor)
    root.style.setProperty('--radius', themeConfig.radius)
    
    // Listen for system theme changes if using system theme
    if (themeConfig.theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
      const handleChange = (e: MediaQueryListEvent) => {
        if (e.matches) {
          root.classList.add('dark')
        } else {
          root.classList.remove('dark')
        }
      }
      
      mediaQuery.addEventListener('change', handleChange)
      return () => mediaQuery.removeEventListener('change', handleChange)
    }
  }, [themeConfig])

  return {
    themeConfig,
    setThemeConfig
  }
}