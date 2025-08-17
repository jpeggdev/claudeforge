import { useState, useEffect, useCallback } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ServerList } from './components/ServerList'
import { ToolsPanel } from './components/ToolsPanel'
import { ResourcesPanel } from './components/ResourcesPanel'
import { PromptsPanel } from './components/PromptsPanel'
import { ServerLogsPanel } from './components/ServerLogsPanel'
import { FirehosePanel } from './components/FirehosePanel'
import { DebugInspectorPanel } from './components/DebugInspectorPanel'
import { SystemLogsPanel } from './components/SystemLogsPanel'
import { useWebSocket } from './hooks/useWebSocket'
import { useAPI } from './hooks/useAPI'
import type { Server } from './types'

function App() {
  const [selectedServer, setSelectedServer] = useState<string | null>(null)
  const [servers, setServers] = useState<Server[]>([])
  const { isConnected } = useWebSocket()
  const { fetchServers, reloadConfig } = useAPI()

  const loadServers = useCallback(async () => {
    const data = await fetchServers()
    if (data) {
      setServers(data)
      if (data.length > 0 && !selectedServer) {
        setSelectedServer(data[0].id)
      }
    }
  }, [fetchServers, selectedServer])

  useEffect(() => {
    loadServers()
  }, [loadServers])

  const handleServerSelect = (serverId: string) => {
    setSelectedServer(serverId)
  }

  const handleReloadConfig = async () => {
    await reloadConfig()
    await loadServers()
  }

  const selectedServerData = servers.find(s => s.id === selectedServer) || null

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Header - Fixed */}
      <header className="flex items-center justify-between px-6 py-3 border-b bg-background">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 gradient-purple rounded-lg flex items-center justify-center text-white font-bold glow-purple">
            CF
          </div>
          <div>
            <h1 className="font-bold text-xl">ClaudeForge</h1>
            <p className="text-xs text-muted-foreground">MCP Orchestration Platform</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge 
            variant={isConnected ? "default" : "destructive"}
          >
            <div className={`inline-block w-2 h-2 rounded-full mr-2 ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
            {isConnected ? 'Connected' : 'Disconnected'}
          </Badge>
          <Button 
            variant="outline" 
            size="sm"
            onClick={handleReloadConfig}
            className="relative z-10"
          >
            Reload Config
          </Button>
        </div>
      </header>

      {/* Main Content - Flex container that fills remaining height */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Particle Background */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {[...Array(20)].map((_, i) => (
            <div
              key={i}
              className="particle"
              style={{
                left: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 15}s`,
                animationDuration: `${15 + Math.random() * 10}s`
              }}
            />
          ))}
        </div>
        {/* Sidebar - Fixed width with own scroll */}
        <aside className="w-80 border-r bg-muted/10 overflow-hidden flex flex-col">
          <ServerList 
            servers={servers}
            selectedServer={selectedServer}
            onServerSelect={handleServerSelect}
            onRefresh={loadServers}
          />
        </aside>

        {/* Content Area - Split into two panels */}
        <main className="flex-1 flex gap-4 p-4 overflow-hidden">
          {/* MCP Server Panel */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <Tabs defaultValue="tools" className="h-full flex flex-col">
              <TabsList className="grid w-full grid-cols-4 shrink-0">
                <TabsTrigger value="tools" className="tab-gradient">Tools</TabsTrigger>
                <TabsTrigger value="resources" className="tab-gradient">Resources</TabsTrigger>
                <TabsTrigger value="prompts" className="tab-gradient">Prompts</TabsTrigger>
                <TabsTrigger value="logs" className="tab-gradient">Server Logs</TabsTrigger>
              </TabsList>
              <TabsContent value="tools" className="flex-1 overflow-hidden mt-4">
                <ToolsPanel server={selectedServerData} />
              </TabsContent>
              <TabsContent value="resources" className="flex-1 overflow-hidden mt-4">
                <ResourcesPanel server={selectedServerData} />
              </TabsContent>
              <TabsContent value="prompts" className="flex-1 overflow-hidden mt-4">
                <PromptsPanel server={selectedServerData} />
              </TabsContent>
              <TabsContent value="logs" className="flex-1 overflow-hidden mt-4">
                <ServerLogsPanel server={selectedServerData} />
              </TabsContent>
            </Tabs>
          </div>

          {/* System Panel */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <Tabs defaultValue="firehose" className="h-full flex flex-col">
              <TabsList className="grid w-full grid-cols-3 shrink-0">
                <TabsTrigger value="firehose" className="gradient-pink text-white">Firehose</TabsTrigger>
                <TabsTrigger value="debug" className="gradient-blue text-white">Debug Inspector</TabsTrigger>
                <TabsTrigger value="system-logs">System Logs</TabsTrigger>
              </TabsList>
              <TabsContent value="firehose" className="flex-1 overflow-hidden mt-4">
                <FirehosePanel />
              </TabsContent>
              <TabsContent value="debug" className="flex-1 overflow-hidden mt-4">
                <DebugInspectorPanel />
              </TabsContent>
              <TabsContent value="system-logs" className="flex-1 overflow-hidden mt-4">
                <SystemLogsPanel />
              </TabsContent>
            </Tabs>
          </div>
        </main>
      </div>
    </div>
  )
}

export default App