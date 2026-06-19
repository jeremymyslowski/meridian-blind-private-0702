import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { MeridianClient, type User } from '@meridian/api-client'
import { TOKEN_TTL_MS } from '../config/session'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
const TOKEN_KEY = 'meridian_token'
const USER_KEY = 'meridian_user'

interface AuthContextValue {
  user: User | null
  token: string | null
  client: MeridianClient
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  isAuthenticated: boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY))
  const [user, setUser] = useState<User | null>(() => {
    const stored = localStorage.getItem(USER_KEY)
    return stored ? JSON.parse(stored) : null
  })

  const client = useMemo(
    () => new MeridianClient(API_URL, () => token),
    [token],
  )

  const login = async (email: string, password: string) => {
    const response = await client.login(email, password)
    setToken(response.access_token)
    setUser(response.user)
    localStorage.setItem(TOKEN_KEY, response.access_token)
    localStorage.setItem(USER_KEY, JSON.stringify(response.user))
  }

  const logout = () => {
    setToken(null)
    setUser(null)
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
  }

  useEffect(() => {
    if (!token) return
    const timer = setTimeout(() => logout(), TOKEN_TTL_MS)
    return () => clearTimeout(timer)
  }, [token])

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        client,
        login,
        logout,
        isAuthenticated: !!token,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}