import { useEffect, useState } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Trash2 } from 'lucide-react'
import type { Server, LogEntry, BadgeVariant } from '@/types'

interface ServerLogsPanelProps {
  server: Server | null
}

export function ServerLogsPanel({ server }: ServerLogsPanelProps) {
  const [logs, setLogs] = useState<LogEntry[]>([])

  useEffect(() => {
    if (server) {
      // In production, this would connect to WebSocket for real-time logs
      // For now, showing placeholder
      setLogs([
        { timestamp: new Date().toISOString(), level: 'info', message: `Server ${server.name} started` },
        { timestamp: new Date().toISOString(), level: 'debug', message: 'Initializing capabilities' },
      ])
    }
  }, [server])

  const getLevelVariant = (level: string): BadgeVariant => {
    switch (level) {
      case 'error': return 'destructive'
      case 'warning': return 'outline'
      case 'info': return 'default'
      case 'debug': return 'secondary'
      default: return 'outline'
    }
  }

  if (!server) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        Select a server to view its logs
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-medium">Server Logs: {server.name}</h3>
        <Button size="sm" variant="outline" onClick={() => setLogs([])}>
          <Trash2 className="h-4 w-4 mr-1" />
          Clear
        </Button>
      </div>
      <Card className="flex-1 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="p-4 space-y-2 font-mono text-xs">
            {logs.map((log, index) => (
              <div 
                key={index} 
                className={`flex gap-2 items-start p-2 rounded transition-all duration-300 log-${log.level}`}
                style={{ animation: 'slide-in 0.3s ease-out' }}
              >
                <span className="text-muted-foreground min-w-[80px]">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
                <Badge variant={getLevelVariant(log.level)} className="text-xs">
                  {log.level}
                </Badge>
                <span className="flex-1 text-foreground">{log.message}</span>
              </div>
            ))}
            {logs.length === 0 && (
              <div className="text-center text-muted-foreground py-8">
                No logs available
              </div>
            )}
          </div>
        </ScrollArea>
      </Card>
    </div>
  )
}