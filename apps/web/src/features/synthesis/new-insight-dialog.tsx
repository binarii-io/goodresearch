import { useCreateInsight } from '@goodresearch/api-client'
import { Button } from '@goodresearch/ui/components/button'
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
import { useId, useState } from 'react'
import { toast } from 'sonner'
import { Choice } from '../analysis/choice.tsx'
import { errorMessage } from '../workspace/errors.ts'
import { FactsPanel } from './facts-panel.tsx'
import { useRefreshInsights } from './insight-panel.tsx'

/** FR-010: an insight written by hand, validated at once, with at least one supporting fact. */
export function NewInsightDialog({
  projectId,
  open,
  onOpenChange,
  themes,
}: {
  projectId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  themes: readonly { key: string; title: string | null }[]
}) {
  const { t, i18n } = useLingui()
  const lang = i18n.locale.startsWith('fr') ? 'fr' : 'en'
  const statementId = useId()
  const refresh = useRefreshInsights(projectId)
  const create = useCreateInsight()
  const [theme, setTheme] = useState('other')
  const [statement, setStatement] = useState('')
  const [roles, setRoles] = useState<Record<string, 'support' | 'counter'>>({})
  const support = Object.keys(roles).filter((id) => roles[id] === 'support')
  const counter = Object.keys(roles).filter((id) => roles[id] === 'counter')
  const reset = () => {
    setTheme('other')
    setStatement('')
    setRoles({})
  }
  const toggle = (id: string, role: 'support' | 'counter') =>
    setRoles((current) => {
      const next = { ...current }
      if (next[id] === role) delete next[id]
      else next[id] = role
      return next
    })
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset()
        onOpenChange(o)
      }}
    >
      <DialogContent closeLabel={t`Close`} className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t`New insight`}</DialogTitle>
          <DialogDescription>
            {t`Write the finding and choose the facts that support it. It is validated at once and translated into the other language.`}
          </DialogDescription>
        </DialogHeader>
        <Choice
          label={t`Theme`}
          value={theme}
          className="w-64"
          onChange={setTheme}
          options={themes.map((x) => ({ value: x.key, label: x.title ?? t`Other` }))}
        />
        <div className="grid gap-1">
          <Label htmlFor={statementId}>{t`Statement`}</Label>
          <Textarea
            id={statementId}
            value={statement}
            maxLength={200}
            onChange={(e) => setStatement(e.target.value)}
          />
        </div>
        <p className="text-sm" aria-live="polite">
          {t`${support.length} supporting facts, ${counter.length} against`}
        </p>
        <FactsPanel
          projectId={projectId}
          themes={themes}
          actions={(f) =>
            (['support', 'counter'] as const).map((role) => (
              <Button
                key={role}
                size="xs"
                variant={roles[f.id] === role ? 'secondary' : 'outline'}
                aria-pressed={roles[f.id] === role}
                disabled={!f.statement}
                onClick={() => toggle(f.id, role)}
              >
                {role === 'support' ? t`Supports` : t`Goes against`}
              </Button>
            ))
          }
        />
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              reset()
              onOpenChange(false)
            }}
          >
            {t`Cancel`}
          </Button>
          <Button
            disabled={!statement.trim() || support.length === 0 || create.isPending}
            onClick={() =>
              void create
                .mutateAsync({
                  projectId,
                  data: {
                    themeKey: theme,
                    statement: { [lang]: statement.trim() },
                    support,
                    ...(counter.length > 0 ? { counter } : {}),
                  },
                })
                .then(async () => {
                  await refresh()
                  reset()
                  onOpenChange(false)
                })
                .catch((failure: unknown) => toast.error(errorMessage(i18n, failure)))
            }
          >
            {t`Create the insight`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
