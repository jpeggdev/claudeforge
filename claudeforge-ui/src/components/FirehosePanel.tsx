import { useState, useEffect, useRef } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Download, Trash2 } from 'lucide-react'

export function FirehosePanel() {
  const [events, setEvents] = useState<any[]>([])
  const [isPaused, setIsPaused] = useState(false)
  const [autoScroll, setAutoScroll] = useState(true)
  const [filter, setFilter] = useState('')
  const [noiseReduction, setNoiseReduction] = useState(true)
  const [eventRate, setEventRate] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)
  const eventSourceRef = useRef<EventSource | null>(null)

  useEffect(() => {
    if (!isPaused) {
      eventSourceRef.current = new EventSource('/api/firehose/stream')
      
      eventSourceRef.current.onmessage = (event) => {
        const data = JSON.parse(event.data)
        
        // Apply noise reduction filter
        if (noiseReduction) {
          const excludeTypes = ['ws-out', 'ws-in', 'heartbeat', 'stats']
          if (excludeTypes.includes(data.type)) return
        }

        // Apply text filter
        if (filter && !JSON.stringify(data).toLowerCase().includes(filter.toLowerCase())) {
          return
        }

        setEvents(prev => [...prev.slice(-999), data])
        setEventRate(prev => prev + 1)
      }

      eventSourceRef.current.onerror = (error) => {
        console.error('Firehose stream error:', error)
      }
    }

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
      }
    }
  }, [isPaused, filter, noiseReduction])

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      const scrollElement = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]')
      if (scrollElement) {
        scrollElement.scrollTop = scrollElement.scrollHeight
      }
    }
  }, [events, autoScroll])

  useEffect(() => {
    const interval = setInterval(() => {
      setEventRate(0)
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  const handleClear = () => {
    setEvents([])
  }

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(events, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `firehose-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const getEventColor = (type: string) => {
    if (type.includes('error')) return 'destructive'
    if (type.includes('warning')) return 'outline'
    if (type.includes('success')) return 'default'
    if (type.includes('api')) return 'secondary'
    return 'outline'
  }

  return (
    <div className="h-full flex flex-col">
      <div className="space-y-3 mb-4">
        <div className="flex gap-2 items-center">
          <Input
            placeholder="Filter events..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="flex-1"
          />
          <Badge variant="outline">
            {eventRate} events/s
          </Badge>
          <Badge variant="outline">
            {events.length} total
          </Badge>
        </div>
        
        <div className="flex gap-4 items-center">
          <label className="flex items-center gap-2">
            <Switch
              checked={!isPaused}
              onCheckedChange={(val) => setIsPaused(!val)}
            />
            <span className="text-sm">Stream</span>
          </label>
          <label className="flex items-center gap-2">
            <Switch
              checked={autoScroll}
              onCheckedChange={setAutoScroll}
            />
            <span className="text-sm">Auto-scroll</span>
          </label>
          <label className="flex items-center gap-2">
            <Switch
              checked={noiseReduction}
              onCheckedChange={setNoiseReduction}
            />
            <span className="text-sm">Reduce Noise</span>
          </label>
          <div className="flex-1" />
          <Button size="sm" variant="outline" onClick={handleClear}>
            <Trash2 className="h-4 w-4 mr-1" />
            Clear
          </Button>
          <Button size="sm" variant="outline" onClick={handleExport}>
            <Download className="h-4 w-4 mr-1" />
            Export
          </Button>
        </div>
      </div>

      <Card className="flex-1 overflow-hidden">
        <ScrollArea ref={scrollRef} className="h-full">
          <div className="p-4 space-y-1 font-mono text-xs">
            {events.map((event, index) => (
              <div key={index} className="flex gap-2 items-start">
                <span className="text-muted-foreground min-w-[80px]">
                  {new Date(event.timestamp).toLocaleTimeString('en-US', { 
                    hour12: false,
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    fractionalSecondDigits: 3
                  })}
                </span>
                <Badge 
                  variant={getEventColor(event.type) as any}
                  className="min-w-[80px] text-xs"
                >
                  {event.type}
                </Badge>
                <span className="flex-1 text-foreground break-all">
                  {typeof event.data === 'string' ? event.data : JSON.stringify(event.data)}
                </span>
              </div>
            ))}
            {events.length === 0 && (
              <div className="text-center text-muted-foreground py-8">
                {isPaused ? 'Stream paused' : 'Waiting for events...'}
              </div>
            )}
          </div>
        </ScrollArea>
      </Card>
    </div>
  )
}