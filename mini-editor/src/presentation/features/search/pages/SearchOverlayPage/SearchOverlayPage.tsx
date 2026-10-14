import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { isMobile, isTauri } from '@/infrastructure/platform'
import { WindowsSearch } from '../../components/windows-search'

interface SearchOverlayPageProps {
  panelMode?: boolean;
}

export default function SearchOverlayPage({ panelMode }: SearchOverlayPageProps) {
  const [isVisible, setIsVisible] = useState(true)
  const navigate = useNavigate()

  const handleClose = useCallback(() => {
    setIsVisible(false)
    // Wait for the exit animation to finish before dismissing.
    setTimeout(async () => {
      // Mobile renders this in-app (single webview): go back instead of closing
      // the only window. Desktop closes the dedicated overlay window.
      if (isMobile()) {
        navigate(-1)
        return
      }
      if (!isTauri()) return
      const { getCurrentWindow } = await import('@tauri-apps/api/window')
      await getCurrentWindow().close()
    }, 180)
  }, [navigate])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose()
      }
    }

    const handleBlur = () => {
      handleClose()
    }

    window.addEventListener('keydown', handleKeyDown)
    // Blur-to-close only applies to the dedicated overlay window, not when
    // embedded as a panel inside another window (panelMode). In panelMode the
    // containing window losing focus (e.g. during a drag) must not close it.
    if (!isMobile() && !panelMode) window.addEventListener('blur', handleBlur)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('blur', handleBlur)
    }
  }, [handleClose, panelMode])

  // In panel mode: render inline without fullscreen overlay semantics
  if (panelMode) {
    return (
      <div style={{ width: "100%", height: "100%", overflow: "hidden" }}>
        <WindowsSearch />
      </div>
    )
  }

  // The window IS the panel now (no fullscreen scrim): fill it with WindowsSearch.
  // Clicking outside the window blurs it, which closes via the blur handler above.
  return isVisible ? (
    <div className="w-screen h-screen overflow-hidden will-change-transform animate-scale-up">
      <WindowsSearch />
    </div>
  ) : null
}
