import { useCallback, useEffect, useState } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import { Nav } from './components/navigation/Nav'
import { CustomCursor } from './components/cursor/CustomCursor'
import { BootScreen } from './components/loading/BootScreen'
import { Landing } from './routes/Landing'
import { Explorer } from './routes/Explorer'
import { useSceneStore } from './hooks/useScene'

/**
 * Application shell.
 *
 * The boot screen owns scene generation, so nothing below it renders against a
 * null scene. Navigation is hidden on the explorer route — that route is a tool,
 * and a marketing header over a full-viewport instrument is noise.
 */
export function App() {
  const [booted, setBooted] = useState(false)
  const location = useLocation()
  const scene = useSceneStore((s) => s.scene)
  const loadDemo = useSceneStore((s) => s.loadDemo)

  const onBooted = useCallback(() => setBooted(true), [])

  // Safety net: if the boot screen was skipped for any reason, make sure a
  // scene exists before the routes try to render one.
  useEffect(() => {
    if (booted && !scene) loadDemo()
  }, [booted, scene, loadDemo])

  const isExplorer = location.pathname.startsWith('/explorer')

  return (
    <>
      {!booted && <BootScreen onDone={onBooted} />}
      <CustomCursor />
      {!isExplorer && <Nav />}

      {/* Film grain, rendered once and fixed to the viewport. Attaching it to a
          scrolling container would repaint the noise on every scroll frame. */}
      <div aria-hidden className="dw-grain-overlay z-[80]" />

      <Routes>
        <Route path="/" element={<Landing booted={booted} />} />
        <Route path="/explorer" element={<Explorer />} />
        <Route path="*" element={<Landing booted={booted} />} />
      </Routes>
    </>
  )
}
