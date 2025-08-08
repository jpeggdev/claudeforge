import { useState, useEffect } from 'react'
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

function App() {
  const [selectedServer, setSelectedServer] = useState<string | null>(null)
  const [servers, setServers] = useState<any[]>([])
  const { isConnected } = useWebSocket()
  const { fetchServers, reloadConfig } = useAPI()

  useEffect(() => {
    loadServers()
  }, [])

  const loadServers = async () => {
    const data = await fetchServers()
    if (data) {
      setServers(data)
      if (data.length > 0 && !selectedServer) {
        setSelectedServer(data[0].id)
      }
    }
  }

  const handleServerSelect = (serverId: string) => {
    setSelectedServer(serverId)
  }

  const handleReloadConfig = async () => {
    await reloadConfig()
    await loadServers()
  }

  const selectedServerData = servers.find(s => s.id === selectedServer)

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Header - Fixed */}
      <header className="flex items-center justify-between px-6 py-3 border-b bg-background">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg flex items-center justify-center text-white font-bold">
            CF
          </div>
          <div>
            <h1 className="font-bold text-xl">ClaudeForge</h1>
            <p className="text-xs text-muted-foreground">MCP Orchestration Platform</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={isConnected ? "default" : "destructive"}>
            {isConnected ? 'Connected' : 'Disconnected'}
          </Badge>
          <Button 
            variant="outline" 
            size="sm"
            onClick={handleReloadConfig}
          >
            Reload Config
          </Button>
        </div>
      </header>

      {/* Main Content - Flex container that fills remaining height */}
      <div className="flex-1 flex overflow-hidden">
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
                <TabsTrigger value="tools">Tools</TabsTrigger>
                <TabsTrigger value="resources">Resources</TabsTrigger>
                <TabsTrigger value="prompts">Prompts</TabsTrigger>
                <TabsTrigger value="logs">Server Logs</TabsTrigger>
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
                <TabsTrigger value="firehose">Firehose</TabsTrigger>
                <TabsTrigger value="debug">Debug Inspector</TabsTrigger>
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