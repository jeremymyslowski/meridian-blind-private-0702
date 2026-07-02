import { createContext, useContext, useMemo, useState, useEffect, useRef, type ReactNode } from 'react'
import { MeridianClient, type User } from '@meridian/api-client'

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

function getTokenExpiration(token: string): number | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const payloadBase64 = parts[1]
    // Convert base64url to base64
    let base64 = payloadBase64.replace(/-/g, '+').replace(/_/g, '/')
    while (base64.length % 4) {
      base64 += '='
    }
    const payload = JSON.parse(atob(base64))
    return payload.exp ? payload.exp * 1000 : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY))
  const [user, setUser] = useState<User | null>(() => {
    const stored = localStorage.getItem(USER_KEY)
    return stored ? JSON.parse(stored) : null
  })

  const logoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const client = useMemo(
    () => new MeridianClient(API_URL, () => token),
    [token],
  )

  const clearLogoutTimer = () => {
    if (logoutTimerRef.current) {
      clearTimeout(logoutTimerRef.current)
      logoutTimerRef.current = null
    }
  }

  const scheduleLogout = (exp: number) => {
    clearLogoutTimer()
    const now = Date.now()
    const delay = exp - now
    if (delay > 0) {
      logoutTimerRef.current = setTimeout(() => {
        logout()
      }, delay)
    } else {
      logout()
    }
  }

  const checkAndScheduleToken = (currentToken: string | null) => {
    if (!currentToken) {
      clearLogoutTimer()
      return
    }
    const exp = getTokenExpiration(currentToken)
    if (exp && exp <= Date.now()) {
      logout()
    } else if (exp) {
      scheduleLogout(exp)
    }
    // if no exp claim, token doesn't expire or invalid, do nothing
  }

  useEffect(() => {
    checkAndScheduleToken(token)
    return () => clearLogoutTimer()
  }, [token])

  const login = async (email: string, password: string) => {
    const response = await client.login(email, password)
    setToken(response.access_token)
    setUser(response.user)
    localStorage.setItem(TOKEN_KEY, response.access_token)
    localStorage.setItem(USER_KEY, JSON.stringify(response.user))
    // scheduling handled by useEffect on token change
  }

  const logout = () => {
    clearLogoutTimer()
    setToken(null)
    setUser(null)
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
  }

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