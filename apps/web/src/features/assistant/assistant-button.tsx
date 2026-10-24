import { Button } from '@goodresearch/ui/components/button'
import { SparklesIcon } from '@goodresearch/ui/components/icons'
import { useLingui } from '@lingui/react/macro'
import { useEffect, useRef } from 'react'
import { ASSISTANT_PANEL_ID, useAssistant } from './state.tsx'

/** At the right end of the top bar, beside the panel (spec 005 FR-001): opens and closes the assistant panel. */
export function AssistantButton() {
  const { t } = useLingui()
  const { open, toggle } = useAssistant()
  const button = useRef<HTMLButtonElement>(null)
  const wasOpen = useRef(open)
  // Closing (button, close button, Escape) returns focus here (FR-003).
  useEffect(() => {
    if (wasOpen.current && !open) button.current?.focus()
    wasOpen.current = open
  }, [open])
  return (
    <Button
      ref={button}
      variant={open ? 'secondary' : 'outline'}
      size="sm"
      aria-pressed={open}
      aria-controls={ASSISTANT_PANEL_ID}
      onClick={toggle}
    >
      <SparklesIcon aria-hidden />
      {/* Icon only on phones, where the top bar is narrow; the name stays for screen readers. */}
      <span className="max-md:sr-only">{t`Assistant`}</span>
    </Button>
  )
}
