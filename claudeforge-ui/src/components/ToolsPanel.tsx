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

  useEffect(() => {
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
  }, [server])

  const handleToggleTool = (toolName: string, enabled: boolean) => {
    const key = `${server.id}:${toolName}`
    setToolPermissions(prev => {
      const newMap = new Map(prev)
      const current = newMap.get(key)
      if (current) {
        newMap.set(key, { ...current, enabled })
      }
      return newMap
    })
    updateToolPermission(server.id, toolName, enabled)
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
    try {
      await fetch('/api/permissions/tool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverId, toolName, enabled, permissions })
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