import { useCallback } from 'react'

const API_BASE = 'http://localhost:8080/api'

export function useAPI() {
  const fetchServers = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/servers`)
      if (!response.ok) throw new Error('Failed to fetch servers')
      return await response.json()
    } catch (error) {
      console.error('Failed to fetch servers:', error)
      return []
    }
  }, [])

  const reloadConfig = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/config/reload`, { method: 'POST' })
      if (!response.ok) throw new Error('Failed to reload config')
      return true
    } catch (error) {
      console.error('Failed to reload config:', error)
      return false
    }
  }, [])

  const restartServer = useCallback(async (serverId: string) => {
    try {
      const response = await fetch(`${API_BASE}/servers/${serverId}/restart`, { method: 'POST' })
      if (!response.ok) throw new Error('Failed to restart server')
      return true
    } catch (error) {
      console.error('Failed to restart server:', error)
      return false
    }
  }, [])

  const stopServer = useCallback(async (serverId: string) => {
    try {
      const response = await fetch(`${API_BASE}/servers/${serverId}`, { method: 'DELETE' })
      if (!response.ok) throw new Error('Failed to stop server')
      return true
    } catch (error) {
      console.error('Failed to stop server:', error)
      return false
    }
  }, [])

  const fetchDebugStatus = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/debug/status`)
      if (!response.ok) throw new Error('Failed to fetch debug status')
      return await response.json()
    } catch (error) {
      console.error('Failed to fetch debug status:', error)
      return null
    }
  }, [])

  const enableDebug = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/debug/enable`, { method: 'POST' })
      if (!response.ok) throw new Error('Failed to enable debug')
      return true
    } catch (error) {
      console.error('Failed to enable debug:', error)
      return false
    }
  }, [])

  const disableDebug = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/debug/disable`, { method: 'POST' })
      if (!response.ok) throw new Error('Failed to disable debug')
      return true
    } catch (error) {
      console.error('Failed to disable debug:', error)
      return false
    }
  }, [])

  return {
    fetchServers,
    reloadConfig,
    restartServer,
    stopServer,
    fetchDebugStatus,
    enableDebug,
    disableDebug
  }
}