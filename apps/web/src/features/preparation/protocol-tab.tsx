import {
  getGetTestProtocolQueryKey,
  type TestProtocol,
  useGetProtocolDesignCost,
  useGetTestProtocol,
  useMarkProtocolReadiness,
  useUnmarkProtocolReadiness,
} from '@goodresearch/api-client'
import { USABILITY_PRACTICES } from '@goodresearch/shared'
import { Button } from '@goodresearch/ui/components/button'
import { Checkbox } from '@goodresearch/ui/components/checkbox'
import { SectionTitle } from '@goodresearch/ui/components/count'
import {
  DownloadIcon,
  PencilIcon,
  SparklesIcon,
  SquarePenIcon,
} from '@goodresearch/ui/components/icons'
import { Label } from '@goodresearch/ui/components/label'
import { Skeleton } from '@goodresearch/ui/components/skeleton'
import { useLingui } from '@lingui/react/macro'
import { useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { normalise } from '../../app/i18n.ts'
import { useMoney } from '../assistant/cost.tsx'
import { useAssistant } from '../assistant/state.tsx'
import { errorMessage } from '../workspace/errors.ts'
import { useFormatRelative } from '../workspace/format.ts'
import { PracticesCard } from './best-practices.tsx'
import { downloadText, slug } from './download.ts'
import { DriveButton, DriveStatus, useDrivePublication } from './drive-publishing.tsx'
import { PROTOCOL_FLAGS, PROTOCOL_READINESS } from './labels.ts'
import { ProtocolEditor, useEmptyProtocol } from './protocol-editor.tsx'
import { protocolToMarkdown } from './protocol-markdown.ts'
import { ProtocolView } from './protocol-view.tsx'

type ReadinessKind = keyof typeof PROTOCOL_READINESS

/** Spec 026: outside the team, the protocol holds no name: it reads like the guide. */
export function ReaderProtocol({ studyId }: { studyId: string }) {
  const { t, i18n } = useLingui()
  const found = useGetTestProtocol(studyId)
  const p = found.data
  return (
    <section aria-labelledby="protocol-heading" className="grid gap-3">
      <SectionTitle id="protocol-heading" count={p ? p.content.tasks.length : undefined}>
        {t`Test protocol`}
      </SectionTitle>
      {found.isPending ? (
        <Skeleton className="h-32 w-full" />
      ) : found.isError ? (
        <p role="alert" className="text-destructive text-sm">
          {errorMessage(i18n, found.error)}
        </p>
      ) : p ? (
        <ProtocolView protocol={p.content} standard={p.standard} />
      ) : (
        <p className="text-muted-foreground">{t`No test protocol yet.`}</p>
      )}
    </section>
  )
}

/** The last checks before the first session (US6): they advise and block nothing. */
function Readiness({ studyId, p }: { studyId: string; p: TestProtocol }) {
  const { t, i18n } = useLingui()
  const queryClient = useQueryClient()
  const formatRelative = useFormatRelative()
  const mark = useMarkProtocolReadiness()
  const unmark = useUnmarkProtocolReadiness()
  const id = useId()
  const { publication } = useDrivePublication(studyId, 'protocol')
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: getGetTestProtocolQueryKey(studyId) })
  const computed: [string, boolean][] = [
    [t`Consent written`, p.content.framing.consent.trim().length > 0],
    [t`Every task has a success criterion`, p.content.tasks.every((task) => task.criterion.trim())],
    [t`Published and in sync`, publication?.state === 'in-sync'],
  ]
  const human = (kind: ReadinessKind) => {
    const m = p.readiness.find((r) => r.kind === kind)
    const who = m?.by?.name || t`a deleted account`
    const when = m ? formatRelative(m.at) : ''
    return (
      <li key={kind} className="grid gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <Checkbox
            id={`${id}-${kind}`}
            checked={Boolean(m)}
            onCheckedChange={(checked) =>
              void (
                checked
                  ? mark.mutateAsync({ studyId, kind })
                  : unmark.mutateAsync({ studyId, kind })
              )
                .then(refresh)
                .catch(() => undefined)
            }
          />
          <Label htmlFor={`${id}-${kind}`}>{i18n._(PROTOCOL_READINESS[kind])}</Label>
        </div>
        {m ? (
          <p className="text-muted-foreground text-xs">
            {t`Marked by ${who} ${when}`}
            {m.changedSince ? ` · ${t`protocol changed since`}` : ''}
          </p>
        ) : null}
      </li>
    )
  }
  return (
    <section aria-labelledby={`${id}-heading`} className="grid gap-2 rounded-md border p-3">
      <h3 id={`${id}-heading`} className="font-semibold">{t`Before the first session`}</h3>
      <p className="text-muted-foreground text-sm">{t`These checks advise: they block nothing.`}</p>
      <ul className="grid gap-2 text-sm">
        {computed.map(([label, done]) => (
          <li key={label}>
            {done ? '✓' : '○'} {label}
            <span className="sr-only">{done ? t`: done` : t`: to do`}</span>
          </li>
        ))}
        {(Object.keys(PROTOCOL_READINESS) as ReadinessKind[]).map(human)}
      </ul>
      {mark.isError || unmark.isError ? (
        <p role="alert" className="text-destructive text-sm">
          {errorMessage(i18n, mark.error ?? unmark.error)}
        </p>
      ) : null}
    </section>
  )
}

/** The participant sheet published again on its own, when only it was forgotten (PR #51 review). */
function SheetAgain({ studyId }: { studyId: string }) {
  const { t } = useLingui()
  const protocol = useDrivePublication(studyId, 'protocol')
  const sheet = useDrivePublication(studyId, 'participant-sheet')
  if (!protocol.publication || sheet.publication) return null
  return (
    <span className="flex items-center gap-1.5 text-sm">
      <span className="text-muted-foreground">{t`Participant sheet`}</span>
      <DriveButton studyId={studyId} kind="participant-sheet" label={t`Participant sheet`} />
    </span>
  )
}

/** The Preparation tab of a usability test study (spec 036). */
export function ProtocolTab({ studyId, studyName }: { studyId: string; studyName: string }) {
  const { t, i18n } = useLingui()
  const found = useGetTestProtocol(studyId)
  const cost = useGetProtocolDesignCost(studyId)
  const money = useMoney()
  const { ask } = useAssistant()
  const formatRelative = useFormatRelative()
  const empty = useEmptyProtocol()
  const [editing, setEditing] = useState(false)
  const practices = USABILITY_PRACTICES[normalise(i18n.locale)]

  const design = () =>
    ask(
      found.data
        ? t`Help me improve the test protocol of this study.`
        : t`Help me design the test protocol for this study.`,
      { thread: `protocol:${studyId}` },
    )

  const p = found.data
  const who = p?.updatedBy?.name || t`a deleted account`
  const when = p ? formatRelative(p.updatedAt) : ''
  const planned = p?.plannedMinutes ?? 0
  const session = p?.content.framing.sessionMinutes ?? 0
  const spent = cost.data?.total
  const designCost = spent === null ? t`unknown` : money(spent ?? 0)

  return (
    <div className="grid gap-8">
      <p className="text-muted-foreground text-base">{t`Before the sessions: the tested interface, a scenario, then tasks with their success criteria. Every session will be read task by task against this protocol.`}</p>

      <section aria-labelledby="protocol-heading" className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SectionTitle id="protocol-heading" count={p ? p.content.tasks.length : undefined}>
            {t`Test protocol`}
          </SectionTitle>
          {p && !editing ? (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={design}>
                <SparklesIcon aria-hidden />
                {t`Continue with the assistant`}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                <PencilIcon aria-hidden />
                {t`Edit`}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  downloadText(
                    `${slug(studyName)}-${t`test-protocol`}.md`,
                    protocolToMarkdown(i18n, studyName, p.content, p.standard),
                    'text/markdown',
                  )
                }
              >
                <DownloadIcon aria-hidden />
                {t`Download (Markdown)`}
              </Button>
              {/* Spec 036 FR-013a: publishing the protocol also publishes its participant sheet. */}
              <DriveButton studyId={studyId} kind="protocol" />
              <SheetAgain studyId={studyId} />
            </div>
          ) : null}
        </div>

        {!editing ? (
          <>
            <DriveStatus studyId={studyId} kind="protocol" />
            <DriveStatus studyId={studyId} kind="participant-sheet" />
          </>
        ) : null}

        {found.isPending ? (
          <Skeleton className="h-32 w-full" />
        ) : found.isError ? (
          <p role="alert" className="text-destructive text-sm">
            {errorMessage(i18n, found.error)}
          </p>
        ) : editing ? (
          <ProtocolEditor
            studyId={studyId}
            protocol={p ?? null}
            start={empty}
            onDone={() => setEditing(false)}
          />
        ) : p ? (
          <>
            <p className="text-muted-foreground text-sm">
              {p.origin === 'assistant'
                ? t`Version ${p.version + 1} · written with the assistant, applied by ${who} ${when}`
                : p.origin === 'drive'
                  ? t`Version ${p.version + 1} · changes from the document accepted by ${who} ${when}`
                  : t`Version ${p.version + 1} · edited by hand by ${who} ${when}`}
            </p>
            <p className="text-sm">
              {t`Planned length: about ${planned} min, for sessions of ${session} min (an estimate)`}
              {spent !== undefined && spent !== 0
                ? ` · ${t`Cost of the design: ${designCost}`}`
                : ''}
            </p>
            {p.checks.whole.length ? (
              <ul aria-label={t`To review on the whole`} className="ml-5 list-disc text-sm">
                {p.checks.whole.map((code) => {
                  const label = PROTOCOL_FLAGS[code]
                  return <li key={code}>{label ? i18n._(label) : code}</li>
                })}
              </ul>
            ) : null}
            <ProtocolView protocol={p.content} standard={p.standard} flags={p.checks.tasks} />
            <Readiness studyId={studyId} p={p} />
          </>
        ) : (
          <div className="grid gap-3 rounded-lg border border-dashed p-5">
            <p>{t`The protocol holds the tested interface, the framing and consent, the facilitator's script, the scenario and the tasks with their success criteria. It can end with the System Usability Scale and ask an ease question after each task.`}</p>
            <p className="text-muted-foreground text-sm">{t`The assistant asks you a few questions, shows its progress and proposes the whole protocol; nothing is saved until you apply it.`}</p>
            {spent ? <p className="text-sm">{t`Cost of the design: ${designCost}`}</p> : null}
            <div className="flex flex-wrap gap-2">
              <Button onClick={design}>
                <SparklesIcon aria-hidden />
                {t`Design with the assistant`}
              </Button>
              <Button variant="outline" onClick={() => setEditing(true)}>
                <SquarePenIcon aria-hidden />
                {t`Write it myself`}
              </Button>
            </div>
          </div>
        )}
      </section>

      <PracticesCard
        doc={practices}
        summary={t`How to run a usability test: realistic tasks, neutrality, think-aloud, standard questions, consent and recordings.`}
        fileName={t`usability-test-best-practices.md`}
        actions={<DriveButton studyId={studyId} kind="best-practices" label={practices.title} />}
        status={<DriveStatus studyId={studyId} kind="best-practices" label={practices.title} />}
      />
    </div>
  )
}
