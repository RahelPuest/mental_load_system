import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { App } from './App.js'
import { SessionProvider } from './lib/session.js'
import { ColorProvider } from './lib/colors.js'
import { ToastProvider } from './design/index.js'
import './design/fonts.css'
import './design/tokens.css'
import './design/components.css'
import { DEFAULT_SCHEME, readScheme, readSetting } from './lib/storage.js'

// Dichte und Farbschema vor dem ersten Rendern setzen, damit die Oberfläche nicht springt.
document.documentElement.dataset['density'] = readSetting('density') ?? 'calm'
const theme = readSetting('theme') ?? 'system'
if (theme !== 'system') document.documentElement.dataset['theme'] = theme
const scheme = readScheme()
if (scheme !== DEFAULT_SCHEME) document.documentElement.dataset['scheme'] = scheme

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <SessionProvider>
          <ColorProvider>
            <App />
          </ColorProvider>
        </SessionProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
)
