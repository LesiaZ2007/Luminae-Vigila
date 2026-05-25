import { useState, useEffect } from 'react'

/**
 * Hook to track window width and provide responsive breakpoints
 * @returns {number} Current window width in pixels
 */
export function useWindowWidth() {
  const [width, setWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 1280
  )

  useEffect(() => {
    const handleResize = () => setWidth(window.innerWidth)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return width
}

/**
 * Hook to check responsive breakpoints
 * @returns {Object} { isMobile: boolean, isTablet: boolean, isDesktop: boolean }
 */
export function useResponsive() {
  const width = useWindowWidth()
  return {
    isMobile: width < 640,
    isTablet: width >= 640 && width < 1024,
    isDesktop: width >= 1024,
  }
}
