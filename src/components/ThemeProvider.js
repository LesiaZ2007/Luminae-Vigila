'use client'

import { ThemeProvider as NextThemesProvider } from 'next-themes'

export default function ThemeProvider({ children }) {
  return (
    // enableSystem must stay on: SettingsMenu offers a System option next to Light
    // and Dark, and with it off that button set a theme next-themes then ignored —
    // the control looked selected while the app stayed on whatever it was.
    //
    // disableTransitionOnChange is intentionally left off. It works by injecting a
    // stylesheet that kills every transition for one frame, which is the exact
    // opposite of what lib/themeTransition.js is doing.
    <NextThemesProvider attribute="class" defaultTheme="light" enableSystem>
      {children}
    </NextThemesProvider>
  )
}
