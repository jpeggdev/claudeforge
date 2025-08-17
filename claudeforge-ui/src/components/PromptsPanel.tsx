import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import type { Server, Prompt, PromptArgument } from '@/types'

interface PromptsPanelProps {
  server: Server | null
}

export function PromptsPanel({ server }: PromptsPanelProps) {
  if (!server) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        Select a server to view its prompts
      </div>
    )
  }

  const prompts = server?.prompts || []

  if (prompts.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        This server has no prompts available
      </div>
    )
  }

  return (
    <ScrollArea className="h-full">
      <div className="space-y-3 p-1 pr-4">
        {prompts.map((prompt: Prompt, index: number) => (
          <Card key={index}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <CardTitle className="text-base">{prompt.name}</CardTitle>
                <Badge variant="default">Prompt</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-3">{prompt.description}</p>
              {prompt.arguments && prompt.arguments.length > 0 && (
                <div className="mt-3">
                  <h4 className="text-xs font-semibold text-foreground mb-2">Arguments:</h4>
                  <div className="space-y-1">
                    {prompt.arguments.map((arg: PromptArgument, i: number) => (
                      <div key={i} className="text-xs bg-muted p-2 rounded">
                        <span className="font-medium">{arg.name}</span>
                        {arg.required && <span className="text-destructive ml-1">*</span>}
                        {arg.description && <span className="text-muted-foreground ml-2">- {arg.description}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </ScrollArea>
  )
}