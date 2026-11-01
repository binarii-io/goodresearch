import type { Proposal } from '@goodresearch/api-client'
import { Button } from '@goodresearch/ui/components/button'
import { Checkbox } from '@goodresearch/ui/components/checkbox'
import { Label } from '@goodresearch/ui/components/label'
import { useLingui } from '@lingui/react/macro'
import { useId, useState } from 'react'

/**
 * Spec 022: choices the assistant offers. Selecting sends them as the person's own message, and
 * `onReply` is only given on the last answer, so an old list cannot answer a newer question.
 */
export function Choices({
  proposal,
  onReply,
}: {
  proposal: Proposal
  onReply?: ((text: string) => void) | undefined
}) {
  const { t } = useLingui()
  const id = useId()
  const [ticked, setTicked] = useState<readonly string[]>([])
  const { question = '', choices = [], multiple = false } = proposal.preview
  return (
    <section
      aria-label={question}
      className="grid gap-3 rounded-lg border bg-card p-3 text-sm shadow-card"
    >
      <h3 className="font-semibold">{question}</h3>
      {!onReply ? (
        <ul className="ml-5 list-disc text-muted-foreground">
          {choices.map((choice) => (
            <li key={choice}>{choice}</li>
          ))}
        </ul>
      ) : multiple ? (
        <form
          className="grid gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            if (ticked.length) onReply(ticked.join('; '))
          }}
        >
          {choices.map((choice, index) => (
            <div key={choice} className="flex items-center gap-2">
              <Checkbox
                id={`${id}-${index}`}
                checked={ticked.includes(choice)}
                onCheckedChange={(checked) =>
                  setTicked(
                    checked
                      ? choices.filter((c) => c === choice || ticked.includes(c))
                      : ticked.filter((c) => c !== choice),
                  )
                }
              />
              <Label htmlFor={`${id}-${index}`}>{choice}</Label>
            </div>
          ))}
          <Button type="submit" size="sm" className="justify-self-start" disabled={!ticked.length}>
            {t`Send my choices`}
          </Button>
        </form>
      ) : (
        <div className="grid gap-2">
          {choices.map((choice) => (
            <Button
              key={choice}
              size="sm"
              variant="outline"
              className="h-auto justify-start whitespace-normal py-1.5 text-left"
              onClick={() => onReply(choice)}
            >
              {choice}
            </Button>
          ))}
        </div>
      )}
    </section>
  )
}
