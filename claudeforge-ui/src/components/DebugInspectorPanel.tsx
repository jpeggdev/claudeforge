import { useState, useEffect } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Download, Trash2 } from 'lucide-react'

export function DebugInspectorPanel() {
  const [debugEnabled, setDebugEnabled] = useState(false)
  const [messages, setMessages] = useState<any[]>([])
  const [stats, setStats] = useState({
    totalMessages: 0,
    requests: 0,
    responses: 0,
    notifications: 0,
    avgResponseTime: 0
  })

  useEffect(() => {
    loadDebugStatus()
  }, [])

  useEffect(() => {
    if (debugEnabled) {
      const eventSource = new EventSource('/api/debug/stream')
      
      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data)
        setMessages(prev => [...prev.slice(-99), data])
        updateStats(data)
      }

      return () => {
        eventSource.close()
      }
    }
  }, [debugEnabled])

  const loadDebugStatus = async () => {
    try {
      const response = await fetch('/api/debug/status')
      const data = await response.json()
      setDebugEnabled(data.enabled)
      setStats(data.stats || {
        totalMessages: 0,
        requests: 0,
        responses: 0,
        notifications: 0,
        avgResponseTime: 0
      })
    } catch (error) {
      console.error('Failed to load debug status:', error)
    }
  }

  const toggleDebug = async () => {
    try {
      const endpoint = debugEnabled ? '/api/debug/disable' : '/api/debug/enable'
      await fetch(endpoint, { method: 'POST' })
      setDebugEnabled(!debugEnabled)
      if (!debugEnabled) {
        setMessages([])
      }
    } catch (error) {
      console.error('Failed to toggle debug:', error)
    }
  }

  const updateStats = (message: any) => {
    setStats(prev => ({
      totalMessages: prev.totalMessages + 1,
      requests: prev.requests + (message.type === 'request' ? 1 : 0),
      responses: prev.responses + (message.type === 'response' ? 1 : 0),
      notifications: prev.notifications + (message.type === 'notification' ? 1 : 0),
      avgResponseTime: message.responseTime ? 
        (prev.avgResponseTime * prev.responses + message.responseTime) / (prev.responses + 1) : 
        prev.avgResponseTime
    }))
  }

  const handleExport = async () => {
    try {
      const response = await fetch('/api/debug/export')
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `debug-${Date.now()}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Failed to export debug data:', error)
    }
  }

  const getTypeVariant = (type: string): any => {
    switch (type) {
      case 'request': return 'default'
      case 'response': return 'secondary'
      case 'notification': return 'outline'
      default: return 'outline'
    }
  }

  return (
    <div className="h-full flex flex-col">
      <div className="space-y-3 mb-4">
        <div className="flex justify-between items-center">
          <label className="flex items-center gap-2">
            <Switch
              checked={debugEnabled}
              onCheckedChange={toggleDebug}
            />
            <span className="text-sm font-medium">
              Debug Mode {debugEnabled ? 'Enabled' : 'Disabled'}
            </span>
          </label>
          <div className="flex gap-2">
            <Button 
              size="sm" 
              variant="outline" 
              onClick={() => setMessages([])}
              disabled={!debugEnabled}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Clear
            </Button>
            <Button 
              size="sm" 
              variant="outline" 
              onClick={handleExport}
              disabled={!debugEnabled}
            >
              <Download className="h-4 w-4 mr-1" />
              Export
            </Button>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          <Badge variant="outline">Total: {stats.totalMessages}</Badge>
          <Badge variant="default">Requests: {stats.requests}</Badge>
          <Badge variant="secondary">Responses: {stats.responses}</Badge>
          <Badge variant="outline">Notifications: {stats.notifications}</Badge>
          <Badge variant="outline">Avg Time: {stats.avgResponseTime.toFixed(2)}ms</Badge>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-2 pr-4">
          {messages.map((msg, index) => (
            <Card key={index}>
              <CardHeader className="py-2">
                <div className="flex justify-between items-center w-full">
                  <div className="flex gap-2 items-center">
                    <Badge 
                      variant={getTypeVariant(msg.type)}
                      className="text-xs"
                    >
                      {msg.type}
                    </Badge>
                    <span className="text-sm font-medium">{msg.method}</span>
                    {msg.serverId && (
                      <span className="text-xs text-muted-foreground">({msg.serverId})</span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(msg.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="py-2">
                <pre className="text-xs overflow-x-auto bg-muted p-2 rounded">
                  {JSON.stringify(msg.data, null, 2)}
                </pre>
                {msg.responseTime && (
                  <div className="mt-2 text-xs text-muted-foreground">
                    Response time: {msg.responseTime}ms
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
          {messages.length === 0 && (
            <div className="text-center text-muted-foreground py-8">
              {debugEnabled ? 'Waiting for debug messages...' : 'Debug mode is disabled'}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}