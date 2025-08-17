import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import type { Server, Resource } from '@/types'

interface ResourcesPanelProps {
  server: Server | null
}

export function ResourcesPanel({ server }: ResourcesPanelProps) {
  if (!server) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        Select a server to view its resources
      </div>
    )
  }

  const resources = server?.resources || []

  if (resources.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        This server has no resources available
      </div>
    )
  }

  return (
    <ScrollArea className="h-full">
      <div className="space-y-3 p-1 pr-4">
        {resources.map((resource: Resource, index: number) => (
          <Card key={index}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <CardTitle className="text-base">{resource.name}</CardTitle>
                <Badge variant="secondary">Resource</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-2">{resource.description}</p>
              <div className="flex gap-2">
                <Badge variant="outline" className="text-xs">
                  URI: {resource.uri}
                </Badge>
                {resource.mimeType && (
                  <Badge variant="outline" className="text-xs">
                    Type: {resource.mimeType}
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </ScrollArea>
  )
}