import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { registerSW } from 'virtual:pwa-register'

// Guardamos la fn globalmente para que UpdatePrompt la encuentre
// aunque el evento haya disparado antes de que el componente se monte
window.__pwaUpdateFn = null

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    window.__pwaUpdateFn = updateSW
    window.dispatchEvent(new CustomEvent('pwa-update-available', {
      detail: { updateSW }
    }))
  },
  onOfflineReady() {
    console.log('App lista para uso offline')
  },
  onRegisteredSW(_swUrl, registration) {
    // Si alguien deja la app abierta todo el día, el navegador puede tardar en
    // notar que hay una versión nueva. Se revisa cada 30 min mientras esté activa.
    if (!registration) return
    setInterval(() => {
      if (navigator.onLine) registration.update()
    }, 30 * 60 * 1000)
  },
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
