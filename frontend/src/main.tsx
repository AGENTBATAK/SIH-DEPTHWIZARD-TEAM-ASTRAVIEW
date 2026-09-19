import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'

// Self-hosted variable fonts — no runtime request to a third-party font CDN.
import '@fontsource-variable/geist'
import '@fontsource-variable/space-grotesk'
import '@fontsource-variable/jetbrains-mono'

import './index.css'
import { App } from './App'

const container = document.getElementById('root')
if (!container) throw new Error('Root element #root is missing from index.html')

createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
