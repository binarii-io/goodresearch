import { CircleHelpIcon } from 'lucide-react'
import type * as React from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip.tsx'

/** A small "?" that explains what is next to it on hover or focus; `label` names the button. */
function HelpTip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={label}
            className="grid size-6 cursor-help place-items-center rounded-full hover:bg-muted"
          />
        }
      >
        <CircleHelpIcon aria-hidden className="size-3.5" />
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-left">
        {children}
      </TooltipContent>
    </Tooltip>
  )
}

export { HelpTip }
