import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import { RefreshCw, Plus, X } from 'lucide-react'
import { useState } from 'react'
import type { Server } from '@/types'

interface ServerListProps {
  servers: Server[]
  selectedServer: string | null
  onServerSelect: (serverId: string) => void
  onRefresh: () => void
}

export function ServerList({ servers, selectedServer, onServerSelect, onRefresh }: ServerListProps) {
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [newServer, setNewServer] = useState({
    name: '',
    transport: 'stdio',
    command: '',
    args: '',
    env: ''
  })
  const handleRestart = async (serverId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await fetch(`/api/servers/${serverId}/restart`, { method: 'POST' })
      onRefresh()
    } catch (error) {
      console.error('Failed to restart server:', error)
    }
  }

  const handleRemove = async (serverId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('Remove this server from configuration?')) return
    try {
      await fetch(`/api/servers/${serverId}/remove`, { method: 'DELETE' })
      onRefresh()
    } catch (error) {
      console.error('Failed to remove server:', error)
    }
  }

  const handleAddServer = async () => {
    try {
      const serverConfig = {
        ...newServer,
        args: newServer.args.split('\n').filter(arg => arg.trim()),
        env: newServer.env ? JSON.parse(newServer.env) : {}
      }
      
      await fetch('/api/servers/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(serverConfig)
      })
      
      setShowAddDialog(false)
      setNewServer({ name: '', transport: 'stdio', command: '', args: '', env: '' })
      onRefresh()
    } catch (error) {
      console.error('Failed to add server:', error)
      alert('Failed to add server: ' + error)
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
                        className="text-xs"
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
                      title="Refresh server"
                    >
                      <RefreshCw className="h-3 w-3" />
                    </Button>
                    <Button 
                      size="sm" 
                      variant="ghost"
                      onClick={(e) => handleRemove(server.id, e)}
                      title="Remove server"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </ScrollArea>
      
      <Button 
        className="mt-4 w-full truncate" 
        onClick={() => setShowAddDialog(true)}
        variant="outline"
      >
        <Plus className="h-4 w-4 mr-2 flex-shrink-0" />
        <span className="truncate">Add Server</span>
      </Button>

      {showAddDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-[500px] max-w-[90vw]">
            <CardContent className="p-6">
              <h2 className="text-lg font-semibold mb-4">Add New MCP Server</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Server Name</label>
                  <Input
                    value={newServer.name}
                    onChange={(e) => setNewServer({...newServer, name: e.target.value})}
                    placeholder="My Server"
                  />
                </div>
                
                <div>
                  <label className="text-sm font-medium">Transport Type</label>
                  <select 
                    className="w-full p-2 border rounded-md"
                    value={newServer.transport}
                    onChange={(e) => setNewServer({...newServer, transport: e.target.value})}
                  >
                    <option value="stdio">Stdio</option>
                    <option value="sse">SSE</option>
                    <option value="websocket">WebSocket</option>
                    <option value="http">HTTP</option>
                  </select>
                </div>
                
                <div>
                  <label className="text-sm font-medium">Command</label>
                  <Input
                    value={newServer.command}
                    onChange={(e) => setNewServer({...newServer, command: e.target.value})}
                    placeholder="node, python, npx"
                  />
                </div>
                
                <div>
                  <label className="text-sm font-medium">Arguments (one per line)</label>
                  <textarea
                    className="w-full p-2 border rounded-md font-mono text-sm"
                    rows={3}
                    value={newServer.args}
                    onChange={(e) => setNewServer({...newServer, args: e.target.value})}
                    placeholder="/path/to/server.js"
                  />
                </div>
                
                <div>
                  <label className="text-sm font-medium">Environment Variables (JSON)</label>
                  <textarea
                    className="w-full p-2 border rounded-md font-mono text-sm"
                    rows={2}
                    value={newServer.env}
                    onChange={(e) => setNewServer({...newServer, env: e.target.value})}
                    placeholder='{"API_KEY": "value"}'
                  />
                </div>
              </div>
              
              <div className="flex gap-2 mt-6 justify-end">
                <Button variant="outline" onClick={() => setShowAddDialog(false)}>
                  Cancel
                </Button>
                <Button onClick={handleAddServer}>
                  Add Server
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}