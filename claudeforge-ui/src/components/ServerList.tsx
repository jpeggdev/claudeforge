import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { RefreshCw, Play, Square } from 'lucide-react'

interface Server {
  id: string
  name: string
  transport?: string
  status?: string
  connected?: boolean
  disabled?: boolean
  tools?: any[]
  resources?: any[]
  prompts?: any[]
}

interface ServerListProps {
  servers: Server[]
  selectedServer: string | null
  onServerSelect: (serverId: string) => void
  onRefresh: () => void
}

export function ServerList({ servers, selectedServer, onServerSelect, onRefresh }: ServerListProps) {
  const handleRestart = async (serverId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await fetch(`/api/servers/${serverId}/restart`, { method: 'POST' })
      onRefresh()
    } catch (error) {
      console.error('Failed to restart server:', error)
    }
  }

  const handleStop = async (serverId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await fetch(`/api/servers/${serverId}`, { method: 'DELETE' })
      onRefresh()
    } catch (error) {
      console.error('Failed to stop server:', error)
    }
  }

  return (
    <div className="h-full flex flex-col p-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">MCP Servers</h2>
        <Button size="sm" variant="ghost" onClick={onRefresh}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>
      
      <ScrollArea className="flex-1">
        <div className="space-y-2 pr-4">
          {servers.map((server) => (
            <Card 
              key={server.id}
              className={`cursor-pointer card-hover transition-all duration-300 ${
                selectedServer === server.id ? 'ring-2 ring-primary glow-purple' : ''
              } ${server.disabled ? 'opacity-60' : ''}`}
              onClick={() => !server.disabled && onServerSelect(server.id)}
              style={{ animation: 'slide-in 0.3s ease-out' }}
            >
              <CardContent className="p-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <div className={`status-indicator ${
                        server.status === 'connected' ? 'online' : 
                        server.status === 'connecting' ? 'pending' : 'offline'
                      }`} />
                      <Badge
                        variant={server.status === 'connected' ? "default" : "secondary"}
                        className={`text-xs ${
                          server.status === 'connected' ? 'gradient-green text-white' : ''
                        }`}
                      >
                        {server.status === 'connected' ? 'Connected' : 'Disconnected'}
                      </Badge>
                      {server.disabled && (
                        <Badge variant="outline" className="text-xs">
                          Disabled
                        </Badge>
                      )}
                    </div>
                    <h3 className="font-medium text-sm">{server.name}</h3>
                    {server.transport && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Transport: {server.transport}
                      </p>
                    )}
                    <div className="flex gap-2 mt-2">
                      {server.tools && server.tools.length > 0 && (
                        <Badge variant="outline" className="text-xs">
                          {server.tools.length} tools
                        </Badge>
                      )}
                      {server.resources && server.resources.length > 0 && (
                        <Badge variant="outline" className="text-xs">
                          {server.resources.length} resources
                        </Badge>
                      )}
                      {server.prompts && server.prompts.length > 0 && (
                        <Badge variant="outline" className="text-xs">
                          {server.prompts.length} prompts
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button 
                      size="sm" 
                      variant="ghost"
                      onClick={(e) => handleRestart(server.id, e)}
                    >
                      <Play className="h-3 w-3" />
                    </Button>
                    <Button 
                      size="sm" 
                      variant="ghost"
                      onClick={(e) => handleStop(server.id, e)}
                    >
                      <Square className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}