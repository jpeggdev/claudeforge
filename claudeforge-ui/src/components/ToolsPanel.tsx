import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { ChevronDown, ChevronRight } from 'lucide-react'

interface ToolPermission {
  toolName: string
  serverId: string
  enabled: boolean
  permissions: {
    read: boolean
    write: boolean
    execute: boolean
  }
}

interface ToolsPanelProps {
  server: any
}

export function ToolsPanel({ server }: ToolsPanelProps) {
  const [toolPermissions, setToolPermissions] = useState<Map<string, ToolPermission>>(new Map())
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set())
  const [sessionId, setSessionId] = useState<string | null>(null)

  // Load permissions from server when component mounts or server changes
  useEffect(() => {
    loadPermissions()
  }, [server])

  const loadPermissions = async () => {
    try {
      // Get sessions first
      const sessionsRes = await fetch('/api/sessions')
      const sessions = await sessionsRes.json()
      
      if (sessions.length > 0) {
        const session = sessions[0]
        setSessionId(session.id)
        
        // Load permissions for this session
        const permsRes = await fetch(`/api/sessions/${session.id}/permissions`)
        const permissions = await permsRes.json()
        
        const newPermissions = new Map<string, ToolPermission>()
        
        // First, add all tools with defaults
        if (server?.tools) {
          server.tools.forEach((tool: any) => {
            const key = `${server.id}:${tool.name}`
            newPermissions.set(key, {
              toolName: tool.name,
              serverId: server.id,
              enabled: true,
              permissions: {
                read: true,
                write: true,
                execute: true
              }
            })
          })
        }
        
        // Then override with saved permissions
        permissions.forEach((perm: any) => {
          if (perm.serverId === server?.id) {
            newPermissions.set(perm.key, perm)
          }
        })
        
        setToolPermissions(newPermissions)
      }
    } catch (error) {
      console.error('Failed to load permissions:', error)
      // Fall back to defaults
      if (server?.tools) {
        const newPermissions = new Map<string, ToolPermission>()
        server.tools.forEach((tool: any) => {
          const key = `${server.id}:${tool.name}`
          newPermissions.set(key, {
            toolName: tool.name,
            serverId: server.id,
            enabled: true,
            permissions: {
              read: true,
              write: true,
              execute: true
            }
          })
        })
        setToolPermissions(newPermissions)
      }
    }
  }

  const handleToggleTool = async (toolName: string, enabled: boolean) => {
    const key = `${server.id}:${toolName}`
    const current = toolPermissions.get(key)
    
    if (!current || !sessionId) return
    
    // Update local state immediately
    setToolPermissions(prev => {
      const newMap = new Map(prev)
      newMap.set(key, { ...current, enabled })
      return newMap
    })
    
    // Save to server
    try {
      await fetch(`/api/sessions/${sessionId}/permissions/${server.id}/${toolName}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...current,
          enabled
        })
      })
    } catch (error) {
      console.error('Failed to save permission:', error)
    }
  }

  const handlePermissionChange = (toolName: string, permission: 'read' | 'write' | 'execute', checked: boolean) => {
    const key = `${server.id}:${toolName}`
    setToolPermissions(prev => {
      const newMap = new Map(prev)
      const current = newMap.get(key)
      if (current) {
        newMap.set(key, {
          ...current,
          permissions: {
            ...current.permissions,
            [permission]: checked
          }
        })
      }
      return newMap
    })
    updateToolPermission(server.id, toolName, undefined, { [permission]: checked })
  }

  const updateToolPermission = async (serverId: string, toolName: string, enabled?: boolean, permissions?: any) => {
    if (!sessionId) return
    
    const key = `${serverId}:${toolName}`
    const current = toolPermissions.get(key)
    if (!current) return
    
    try {
      await fetch(`/api/sessions/${sessionId}/permissions/${serverId}/${toolName}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...current,
          ...(enabled !== undefined && { enabled }),
          ...(permissions && { 
            permissions: { 
              ...current.permissions, 
              ...permissions 
            } 
          })
        })
      })
    } catch (error) {
      console.error('Failed to update tool permission:', error)
    }
  }

  const toggleExpanded = (toolName: string) => {
    setExpandedTools(prev => {
      const newSet = new Set(prev)
      if (newSet.has(toolName)) {
        newSet.delete(toolName)
      } else {
        newSet.add(toolName)
      }
      return newSet
    })
  }

  if (!server) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        Select a server to view its tools
      </div>
    )
  }

  const tools = server?.tools || []

  if (tools.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        This server has no tools available
      </div>
    )
  }

  return (
    <ScrollArea className="h-full">
      <div className="space-y-3 p-1 pr-4">
        {tools.map((tool: any) => {
          const key = `${server.id}:${tool.name}`
          const permission = toolPermissions.get(key)
          const isEnabled = permission?.enabled ?? true
          const isExpanded = expandedTools.has(tool.name)
          
          return (
            <Card key={tool.name} className={!isEnabled ? 'opacity-60' : ''}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-base">{tool.name}</CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                      {tool.description}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={isEnabled}
                      onCheckedChange={(checked) => handleToggleTool(tool.name, checked)}
                      aria-label={`Enable ${tool.name}`}
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {/* Permissions */}
                <div className="bg-muted/50 rounded-lg p-3 mb-3">
                  <div className="flex items-center gap-6">
                    <span className="text-sm font-medium">Permissions:</span>
                    <div className="flex items-center gap-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <Checkbox
                          checked={permission?.permissions.read ?? true}
                          onCheckedChange={(checked) => 
                            handlePermissionChange(tool.name, 'read', checked as boolean)
                          }
                          disabled={!isEnabled}
                        />
                        <span className="text-sm">Read</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <Checkbox
                          checked={permission?.permissions.write ?? true}
                          onCheckedChange={(checked) => 
                            handlePermissionChange(tool.name, 'write', checked as boolean)
                          }
                          disabled={!isEnabled}
                        />
                        <span className="text-sm">Write</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <Checkbox
                          checked={permission?.permissions.execute ?? true}
                          onCheckedChange={(checked) => 
                            handlePermissionChange(tool.name, 'execute', checked as boolean)
                          }
                          disabled={!isEnabled}
                        />
                        <span className="text-sm">Execute</span>
                      </label>
                    </div>
                  </div>
                </div>

                {/* Parameters */}
                {tool.inputSchema && (
                  <div>
                    <button
                      onClick={() => toggleExpanded(tool.name)}
                      className="flex items-center gap-1 text-sm font-medium hover:text-primary transition-colors"
                    >
                      {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      Parameters
                    </button>
                    {isExpanded && (
                      <pre className="text-xs bg-muted p-3 rounded-lg mt-2 overflow-x-auto">
                        {JSON.stringify(tool.inputSchema, null, 2)}
                      </pre>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </ScrollArea>
  )
}