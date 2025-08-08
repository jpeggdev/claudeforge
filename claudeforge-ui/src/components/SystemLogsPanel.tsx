import { useState, useEffect } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Trash2 } from 'lucide-react'

export function SystemLogsPanel() {
  const [logs, setLogs] = useState<any[]>([])
  const [filter, setFilter] = useState('')

  useEffect(() => {
    // In production, this would connect to system log stream
    // For now, showing placeholder logs
    setLogs([
      { 
        timestamp: new Date().toISOString(), 
        level: 'info', 
        source: 'proxy-server',
        message: 'Proxy server started on port 3000' 
      },
      { 
        timestamp: new Date().toISOString(), 
        level: 'info', 
        source: 'web-server',
        message: 'Web server started on port 8080' 
      },
      { 
        timestamp: new Date().toISOString(), 
        level: 'debug', 
        source: 'server-manager',
        message: 'Initializing MCP servers from config' 
      },
    ])
  }, [])

  const getLevelVariant = (level: string): any => {
    switch (level) {
      case 'error': return 'destructive'
      case 'warning': return 'outline'
      case 'info': return 'default'
      case 'debug': return 'secondary'
      default: return 'outline'
    }
  }

  const filteredLogs = logs.filter(log => 
    !filter || JSON.stringify(log).toLowerCase().includes(filter.toLowerCase())
  )

  return (
    <div className="h-full flex flex-col">
      <div className="space-y-3 mb-4">
        <div className="flex gap-2 items-center">
          <Input
            placeholder="Filter logs..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="flex-1"
          />
          <Button size="sm" variant="outline" onClick={() => setLogs([])}>
            <Trash2 className="h-4 w-4 mr-1" />
            Clear
          </Button>
        </div>
      </div>

      <Card className="flex-1 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="p-4 space-y-2 font-mono text-xs">
            {filteredLogs.map((log, index) => (
              <div key={index} className="flex gap-2 items-start">
                <span className="text-muted-foreground min-w-[80px]">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
                <Badge 
                  variant={getLevelVariant(log.level)}
                  className="min-w-[60px] text-xs"
                >
                  {log.level}
                </Badge>
                <Badge 
                  variant="outline"
                  className="min-w-[100px] text-xs"
                >
                  {log.source}
                </Badge>
                <span className="flex-1 text-foreground">{log.message}</span>
              </div>
            ))}
            {filteredLogs.length === 0 && (
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