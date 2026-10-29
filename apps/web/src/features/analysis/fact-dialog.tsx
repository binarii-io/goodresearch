import {
  type Fact,
  getGetFactsOverviewQueryKey,
  getGetInterviewFactsQueryKey,
  getListFactsQueryKey,
  type Theme,
  useCreateFact,
  useDecideFact,
} from '@goodresearch/api-client'
import { Button } from '@goodresearch/ui/components/button'
import { Checkbox } from '@goodresearch/ui/components/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@goodresearch/ui/components/dialog'
import { Label } from '@goodresearch/ui/components/label'
import { Textarea } from '@goodresearch/ui/components/textarea'
import { useLingui } from '@lingui/react/macro'
import { useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { toast } from 'sonner'
import { errorMessage } from '../workspace/errors.ts'
import { Choice } from './choice.tsx'
import { POLARITIES } from './labels.ts'

const OTHER = 'other'
const MAX = 200

/** The fact's statements are refreshed everywhere they show. */
export const useRefreshFacts = (studyId: string, sessionId: string) => {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: getGetInterviewFactsQueryKey(studyId, sessionId) }),
      queryClient.invalidateQueries({ queryKey: getListFactsQueryKey(studyId) }),
      queryClient.invalidateQueries({ queryKey: getGetFactsOverviewQueryKey(studyId) }),
    ])
}

/**
 * Writes a fact, or edits one (FR-009): a statement in English and in French (one is enough, the
 * other is translated), a polarity, a theme and its verbatims. A person's fact is accepted at once.
 */
export function FactDialog({
  studyId,
  sessionId,
  open,
  onOpenChange,
  fact,
  verbatims,
  chosen,
  themes,
}: {
  studyId: string
  sessionId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Editing this fact; none: a new one. */
  fact?: Fact | undefined
  /** The verbatims to choose from; none: the fact's own stay as they are. */
  verbatims?: readonly { id: string; text: string }[] | undefined
  /** The verbatims a new fact starts with. */
  chosen?: readonly string[] | undefined
  themes: readonly Theme[]
}) {
  const { t, i18n } = useLingui()
  const ids = { en: useId(), fr: useId() }
  const refresh = useRefreshFacts(studyId, sessionId)
  const create = useCreateFact()
  const decide = useDecideFact()
  const [en, setEn] = useState(fact?.statement.en ?? '')
  const [fr, setFr] = useState(fact?.statement.fr ?? '')
  const [polarity, setPolarity] = useState<Fact['polarity']>(fact?.polarity ?? 'neutral')
  const [theme, setTheme] = useState(fact?.theme?.id ?? OTHER)
  const [picked, setPicked] = useState<string[]>(
    fact ? fact.verbatims.map((v) => v.id) : [...(chosen ?? [])],
  )
  const changed = {
    en: en.trim() !== (fact?.statement.en ?? ''),
    fr: fr.trim() !== (fact?.statement.fr ?? ''),
  }
  const statement = {
    ...(changed.en && en.trim() ? { en: en.trim() } : {}),
    ...(changed.fr && fr.trim() ? { fr: fr.trim() } : {}),
  }
  const valid =
    picked.length > 0 &&
    (en.trim().length > 0 || fr.trim().length > 0) &&
    en.trim().length <= MAX &&
    fr.trim().length <= MAX
  const busy = create.isPending || decide.isPending

  const submit = async () => {
    try {
      const themeId = theme === OTHER ? null : theme
      if (fact)
        await decide.mutateAsync({
          studyId,
          factId: fact.id,
          data: {
            decision: 'edit',
            version: fact.version,
            ...(Object.keys(statement).length ? { statement } : {}),
            polarity,
            themeId,
            ...(verbatims ? { verbatims: picked } : {}),
          },
        })
      else
        await create.mutateAsync({
          studyId,
          data: { sessionId, statement, polarity, themeId, verbatims: picked },
        })
      onOpenChange(false)
      await refresh()
    } catch (failure) {
      toast.error(errorMessage(i18n, failure))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t`Close`} className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{fact ? t`Edit the fact` : t`New fact`}</DialogTitle>
          <DialogDescription>
            {t`A short, neutral statement of what the interviewee says, without any name. Write it in one language: the other is translated.`}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1">
            <Label htmlFor={ids.en}>{t`In English`}</Label>
            <Textarea
              id={ids.en}
              value={en}
              maxLength={MAX}
              rows={2}
              onChange={(e) => setEn(e.target.value)}
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor={ids.fr}>{t`In French`}</Label>
            <Textarea
              id={ids.fr}
              value={fr}
              maxLength={MAX}
              rows={2}
              onChange={(e) => setFr(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap gap-4">
            <Choice
              label={t`Polarity`}
              value={polarity}
              onChange={(v) => setPolarity(v as Fact['polarity'])}
              options={Object.entries(POLARITIES).map(([value, label]) => ({
                value,
                label: i18n._(label),
              }))}
            />
            <Choice
              label={t`Theme`}
              value={theme}
              onChange={setTheme}
              className="w-64"
              options={[
                ...themes.map((x) => ({ value: x.id, label: x.title })),
                // A theme removed from the guide since stays the fact's own.
                ...(fact?.theme && !themes.some((x) => x.id === fact.theme?.id)
                  ? [{ value: fact.theme.id, label: fact.theme.title }]
                  : []),
                { value: OTHER, label: t`Other` },
              ]}
            />
          </div>
          {verbatims ? (
            <fieldset className="grid gap-2">
              <legend className="font-medium text-sm">{t`Verbatims`}</legend>
              <div className="grid max-h-64 gap-2 overflow-y-auto">
                {verbatims.map((v) => (
                  <VerbatimChoice
                    key={v.id}
                    text={v.text}
                    checked={picked.includes(v.id)}
                    onChange={(on) =>
                      setPicked((p) => (on ? [...p, v.id] : p.filter((x) => x !== v.id)))
                    }
                  />
                ))}
              </div>
            </fieldset>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t`Cancel`}
          </Button>
          <Button disabled={!valid || busy} onClick={() => void submit()}>
            {fact ? t`Save` : t`Add the fact`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function VerbatimChoice({
  text,
  checked,
  onChange,
}: {
  text: string
  checked: boolean
  onChange: (on: boolean) => void
}) {
  const id = useId()
  return (
    <div className="flex items-start gap-2">
      <Checkbox id={id} checked={checked} onCheckedChange={(on) => onChange(on === true)} />
      <Label htmlFor={id} className="font-normal text-muted-foreground text-sm">
        « {text} »
      </Label>
    </div>
  )
}
