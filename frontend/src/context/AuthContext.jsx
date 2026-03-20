import { createContext, useContext, useState } from 'react'

const AuthContext = createContext()

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(
    JSON.parse(localStorage.getItem('usuario')) || null
  )
  const [token, setToken] = useState(
    localStorage.getItem('token') || null
  )

  const login = (datos, tkn) => {
    setUsuario(datos)
    setToken(tkn)
    localStorage.setItem('usuario', JSON.stringify(datos))
    localStorage.setItem('token', tkn)
  }

  const logout = () => {
    setUsuario(null)
    setToken(null)
    localStorage.removeItem('usuario')
    localStorage.removeItem('token')
  }

  return (
    <AuthContext.Provider value={{ usuario, token, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)