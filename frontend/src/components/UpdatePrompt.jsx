import { useState, useEffect } from 'react'

export default function UpdatePrompt() {
  const [updateFn, setUpdateFn] = useState(null)

  useEffect(() => {
    // Si el evento disparó antes de que montáramos, lo capturamos aquí
    if (window.__pwaUpdateFn) {
      setUpdateFn(() => window.__pwaUpdateFn)
    }
    const handler = (e) => setUpdateFn(() => e.detail.updateSW)
    window.addEventListener('pwa-update-available', handler)
    return () => window.removeEventListener('pwa-update-available', handler)
  }, [])

  if (!updateFn) return null

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 bg-blue-600
                    text-white rounded-xl shadow-lg p-4
                    flex items-center justify-between">
      <div>
        <p className="font-semibold text-sm">
          Nueva versión disponible 🔄
        </p>
        <p className="text-xs text-blue-200">
          Actualiza para tener los últimos cambios
        </p>
      </div>
      <button
        onClick={() => updateFn(true)}
        className="bg-white text-blue-600 font-bold text-sm
                   px-4 py-2 rounded-lg ml-4 shrink-0"
      >
        Actualizar
      </button>
    </div>
  )
}
