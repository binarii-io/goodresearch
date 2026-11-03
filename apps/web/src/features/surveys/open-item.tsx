import {
  getGetSurveyAnalysisQueryKey,
  getListOpenAnswersQueryKey,
  getListSurveyFactsQueryKey,
  getListSurveyThemesQueryKey,
  type SurveyAnalysis,
  type SurveyTheme,
  useCreateSurveyFact,
  useDecideSurveyTheme,
  useEstimateThemesRun,
  useListOpenAnswers,
  useListSurveyThemes,
  useMergeSurveyThemes,
  useMoveOpenAnswer,
  useStartThemesRun,
} from '@goodresearch/api-client'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@goodresearch/ui/components/alert-dialog'
import { Badge } from '@goodresearch/ui/components/badge'
import { Button } from '@goodresearch/ui/components/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@goodresearch/ui/components/dialog'
import {
  CheckIcon,
  LoaderCircleIcon,
  PencilIcon,
  PlusIcon,
  SparklesIcon,
  XIcon,
} from '@goodresearch/ui/components/icons'
import { Input } from '@goodresearch/ui/components/input'
import { Label } from '@goodresearch/ui/components/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@goodresearch/ui/components/select'
import { Skeleton } from '@goodresearch/ui/components/skeleton'
import { Textarea } from '@goodresearch/ui/components/textarea'
import { useLingui } from '@lingui/react/macro'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useState } from 'react'
import { toast } from 'sonner'
import { useMoney } from '../assistant/cost.tsx'
import { errorMessage } from '../workspace/errors.ts'
import { Pager } from '../workspace/pager.tsx'

type OpenItemView = SurveyAnalysis['openItems'][number]
const ALL = 'all'
const NONE = 'none'

/** FR-007: what a theme run sends and costs, confirmed by a person before it starts. */
function ThemesRunDialog({
  studyId,
  item,
  onlyNew,
  open,
  onOpenChange,
}: {
  studyId: string
  item: OpenItemView
  onlyNew: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t, i18n } = useLingui()
  const money = useMoney()
  const queryClient = useQueryClient()
  const estimate = useEstimateThemesRun(
    studyId,
    item.id,
    { onlyNew: onlyNew ? 'true' : 'false' },
    { query: { enabled: open, staleTime: 0, gcTime: 0, retry: false } },
  )
  const start = useStartThemesRun()
  const e = estimate.data
  const cost = e?.cost === null ? t`unknown` : money(e?.cost ?? 0)
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t`Find themes in “${item.text}”?`}</AlertDialogTitle>
          <AlertDialogDescription>{t`The answers are masked first: names the team knows, emails, phone numbers, web addresses and long numbers never leave the app. The AI groups them into themes you decide.`}</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="grid gap-2 text-sm" aria-live="polite">
          {estimate.isError ? (
            <p role="alert" className="text-destructive">
              {errorMessage(i18n, estimate.error)}
            </p>
          ) : !e ? (
            <p>{t`Masking and counting the answers…`}</p>
          ) : !e.aiConnected ? (
            <p>{t`Set up your AI provider first.`}</p>
          ) : (
            <p>{t`${e.answers} answers in ${e.parts} parts: about ${cost} with your AI provider.`}</p>
          )}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>{t`Cancel`}</AlertDialogCancel>
          <AlertDialogAction
            disabled={!e || !e.aiConnected || start.isPending}
            onClick={() => {
              onOpenChange(false)
              void start
                .mutateAsync({ studyId, itemId: item.id, data: { onlyNew, consent: false } })
                .then(() =>
                  queryClient.invalidateQueries({
                    queryKey: getGetSurveyAnalysisQueryKey(studyId),
                  }),
                )
                .catch((failure: unknown) => toast.error(errorMessage(i18n, failure)))
            }}
          >
            <SparklesIcon aria-hidden />
            {t`Find the themes`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function RenameDialog({
  studyId,
  theme,
  onClose,
}: {
  studyId: string
  theme: SurveyTheme
  onClose: () => void
}) {
  const { t, i18n } = useLingui()
  const queryClient = useQueryClient()
  const decide = useDecideSurveyTheme()
  const ids = { label: useId(), description: useId() }
  const language = i18n.locale.startsWith('fr') ? 'fr' : 'en'
  const [label, setLabel] = useState(theme.label[language])
  const [description, setDescription] = useState(theme.description[language])
  const submit = async () => {
    try {
      await decide.mutateAsync({
        studyId,
        themeId: theme.id,
        data: {
          decision: 'edit',
          version: theme.version,
          ...(label !== theme.label[language] ? { label: { [language]: label } } : {}),
          ...(description !== theme.description[language]
            ? { description: { [language]: description } }
            : {}),
        },
      })
      await queryClient.invalidateQueries({
        queryKey: getListSurveyThemesQueryKey(studyId, theme.itemId),
      })
      onClose()
    } catch {
      // Shown in the dialog.
    }
  }
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent closeLabel={t`Close`} className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t`Rename the theme`}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor={ids.label}>{t`Label`}</Label>
          <Input
            id={ids.label}
            value={label}
            maxLength={80}
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={ids.description}>{t`Description`}</Label>
          <Textarea
            id={ids.description}
            value={description}
            maxLength={400}
            onChange={(e) => setDescription(e.target.value)}
          />
          <p className="text-muted-foreground text-xs">{t`The other language is translated after you save.`}</p>
        </div>
        {decide.isError ? (
          <p role="alert" className="text-destructive text-sm">
            {errorMessage(i18n, decide.error)}
          </p>
        ) : null}
        <DialogFooter>
          <Button
            disabled={!label.trim() || !description.trim() || decide.isPending}
            onClick={() => void submit()}
          >
            {t`Save`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Spec 029 US3: an open item's themes, and its masked answers, decided by a person. */
function OpenItemThemes({
  studyId,
  item,
  canChange,
}: {
  studyId: string
  item: OpenItemView
  canChange: boolean
}) {
  const { t, i18n } = useLingui()
  const queryClient = useQueryClient()
  const language = i18n.locale.startsWith('fr') ? 'fr' : 'en'
  const [filter, setFilter] = useState<string>(ALL)
  const [page, setPage] = useState(1)
  const [renaming, setRenaming] = useState<SurveyTheme | null>(null)
  const filterId = useId()
  const themes = useListSurveyThemes(studyId, item.id)
  const answers = useListOpenAnswers(studyId, item.id, {
    ...(filter === ALL ? {} : { theme: filter }),
    page,
  })
  const decide = useDecideSurveyTheme()
  const merge = useMergeSurveyThemes()
  const move = useMoveOpenAnswer()
  const fact = useCreateSurveyFact()
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: getListSurveyThemesQueryKey(studyId, item.id) }),
      queryClient.invalidateQueries({ queryKey: getListOpenAnswersQueryKey(studyId, item.id) }),
      queryClient.invalidateQueries({ queryKey: getGetSurveyAnalysisQueryKey(studyId) }),
      queryClient.invalidateQueries({ queryKey: getListSurveyFactsQueryKey(studyId) }),
    ])
  const run = (job: Promise<unknown>, done?: string) =>
    void job
      .then(() => {
        if (done) toast.success(done)
        return refresh()
      })
      .catch((failure: unknown) => {
        toast.error(errorMessage(i18n, failure))
        return refresh()
      })

  if (themes.isPending) return <Skeleton className="h-24 w-full" />
  if (themes.isError)
    return (
      <p role="alert" className="text-destructive text-sm">
        {errorMessage(i18n, themes.error)}
      </p>
    )
  const live = themes.data.themes.filter((th) => th.status !== 'rejected')
  const nameOf = (id: string | null) =>
    id ? (live.find((th) => th.id === id)?.label[language] ?? '') : t`No theme`

  return (
    <div className="grid gap-4">
      {themes.data.themes.length ? (
        <ul className="grid gap-2">
          {themes.data.themes.map((th) => (
            <li key={th.id} className="grid gap-2 rounded-md border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{th.label[language]}</span>
                <Badge variant={th.status === 'accepted' ? 'secondary' : 'outline'}>
                  {th.status === 'accepted'
                    ? t`Accepted`
                    : th.status === 'rejected'
                      ? t`Rejected`
                      : t`To decide`}
                </Badge>
                <span className="text-muted-foreground text-xs">{t`${th.answers} answers`}</span>
                {th.translation === 'translating' ? (
                  <span className="text-muted-foreground text-xs">{t`Translating…`}</span>
                ) : null}
              </div>
              <p className="text-sm">{th.description[language]}</p>
              {th.quotes.length ? (
                <ul className="ml-4 list-disc text-muted-foreground text-sm">
                  {th.quotes.map((q) => (
                    <li key={q}>« {q} »</li>
                  ))}
                </ul>
              ) : null}
              {canChange && th.status !== 'rejected' ? (
                <div className="flex flex-wrap items-center gap-2">
                  {th.status !== 'accepted' ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={decide.isPending}
                      onClick={() =>
                        run(
                          decide.mutateAsync({
                            studyId,
                            themeId: th.id,
                            data: { decision: 'accept', version: th.version },
                          }),
                        )
                      }
                    >
                      <CheckIcon aria-hidden />
                      {t`Accept`}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={fact.isPending}
                      onClick={() =>
                        run(
                          fact.mutateAsync({
                            studyId,
                            data: { from: { theme: { themeId: th.id } }, polarity: 'neutral' },
                          }),
                          t`Fact proposed: decide it in the Facts tab.`,
                        )
                      }
                    >
                      <PlusIcon aria-hidden />
                      {t`Make a fact`}
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setRenaming(th)}>
                    <PencilIcon aria-hidden />
                    {t`Rename`}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={decide.isPending}
                    onClick={() =>
                      run(
                        decide.mutateAsync({
                          studyId,
                          themeId: th.id,
                          data: { decision: 'reject', version: th.version },
                        }),
                      )
                    }
                  >
                    <XIcon aria-hidden />
                    {t`Reject`}
                  </Button>
                  {live.length > 1 ? (
                    <Select
                      value=""
                      onValueChange={(into) => {
                        const target = live.find((x) => x.id === into)
                        if (target)
                          run(
                            merge.mutateAsync({
                              studyId,
                              themeId: target.id,
                              data: { from: [th.id], version: target.version },
                            }),
                          )
                      }}
                    >
                      <SelectTrigger
                        aria-label={t`Merge into another theme`}
                        className="w-48"
                        size="sm"
                      >
                        <SelectValue>{() => t`Merge into…`}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {live
                          .filter((x) => x.id !== th.id)
                          .map((x) => (
                            <SelectItem key={x.id} value={x.id}>
                              {x.label[language]}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  ) : null}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="grid gap-2">
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid gap-1">
            <span id={filterId} className="text-sm">{t`Answers`}</span>
            <Select
              value={filter}
              onValueChange={(v) => {
                if (!v) return
                setFilter(v)
                setPage(1)
              }}
            >
              <SelectTrigger aria-labelledby={filterId} className="w-60 max-w-full">
                <SelectValue>
                  {(v: string) =>
                    v === ALL
                      ? t`All (${themes.data.answers})`
                      : v === NONE
                        ? t`In no theme (${themes.data.unthemed})`
                        : nameOf(v)
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t`All (${themes.data.answers})`}</SelectItem>
                <SelectItem value={NONE}>{t`In no theme (${themes.data.unthemed})`}</SelectItem>
                {live.map((th) => (
                  <SelectItem key={th.id} value={th.id}>
                    {th.label[language]} ({th.answers})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-muted-foreground text-xs">{t`Shown masked, as the AI receives them.`}</p>
        </div>
        {answers.isPending ? (
          <Skeleton className="h-16 w-full" />
        ) : answers.data?.answers.length ? (
          <ul className="grid gap-1">
            {answers.data.answers.map((a) => (
              <li
                key={a.responseId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-sm"
              >
                <span className="min-w-0 flex-1 whitespace-pre-wrap wrap-anywhere">{a.text}</span>
                {canChange && live.length ? (
                  <Select
                    value={a.themeId ?? NONE}
                    onValueChange={(to) =>
                      run(
                        move.mutateAsync({
                          studyId,
                          itemId: item.id,
                          data: { responseId: a.responseId, to: to === NONE ? null : String(to) },
                        }),
                      )
                    }
                  >
                    <SelectTrigger aria-label={t`Theme of this answer`} className="w-48" size="sm">
                      <SelectValue>{(v: string) => nameOf(v === NONE ? null : v)}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>{t`No theme`}</SelectItem>
                      {live.map((th) => (
                        <SelectItem key={th.id} value={th.id}>
                          {th.label[language]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <span className="text-muted-foreground text-xs">{nameOf(a.themeId)}</span>
                )}
              </li>
            ))}
          </ul>
        ) : null}
        {answers.data?.answers.length ? (
          <Pager
            page={page}
            total={answers.data.total}
            pageSize={answers.data.pageSize}
            onPage={setPage}
          />
        ) : (
          <p className="text-muted-foreground text-sm">{t`No answer here.`}</p>
        )}
        {answers.data?.leftOut ? (
          <p className="text-muted-foreground text-xs">{t`${answers.data.leftOut} answers held nothing once masked: they are left out.`}</p>
        ) : null}
      </div>
      {renaming ? (
        <RenameDialog studyId={studyId} theme={renaming} onClose={() => setRenaming(null)} />
      ) : null}
    </div>
  )
}

/** One open item of the Analysis tab: its counts, its run, its themes (spec 029 US3). */
export function OpenItem({
  studyId,
  item,
  run,
  canChange,
}: {
  studyId: string
  item: OpenItemView
  run: SurveyAnalysis['run']
  canChange: boolean
}) {
  const { t } = useLingui()
  const money = useMoney()
  const queryClient = useQueryClient()
  const [asking, setAsking] = useState<'all' | 'new' | null>(null)
  const [shown, setShown] = useState(false)
  const running = run?.state === 'running'
  const mine = run?.itemId === item.id ? run : null
  // A run of this item that ends brings its themes and answers.
  const finished = mine?.finishedAt ?? null
  useEffect(() => {
    if (!finished) return
    void Promise.all([
      queryClient.invalidateQueries({ queryKey: getListSurveyThemesQueryKey(studyId, item.id) }),
      queryClient.invalidateQueries({ queryKey: getListOpenAnswersQueryKey(studyId, item.id) }),
    ])
  }, [finished, queryClient, studyId, item.id])
  const enough = item.answers >= 5
  return (
    <li className="grid gap-3 rounded-md border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="grid gap-0.5">
          <span className="font-medium">{item.text}</span>
          <span className="text-muted-foreground text-xs">
            {t`${item.answers} answers · ${item.themed} in ${item.themes} themes`}
            {item.cost !== null && item.cost > 0 ? ` · ${t`AI cost: ${money(item.cost)}`}` : ''}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {canChange && enough ? (
            item.themes === 0 ? (
              <Button
                size="sm"
                variant="outline"
                disabled={running}
                onClick={() => setAsking('all')}
              >
                <SparklesIcon aria-hidden />
                {t`Find themes`}
              </Button>
            ) : item.themed < item.answers ? (
              <Button
                size="sm"
                variant="outline"
                disabled={running}
                onClick={() => setAsking('new')}
              >
                <SparklesIcon aria-hidden />
                {t`Theme the other answers`}
              </Button>
            ) : null
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            aria-expanded={shown}
            onClick={() => setShown((v) => !v)}
          >
            {shown ? t`Hide` : t`See the answers and themes`}
          </Button>
        </div>
      </div>
      {!enough ? (
        <p className="text-muted-foreground text-xs">{t`Themes are offered from 5 counted answers.`}</p>
      ) : null}
      {mine?.state === 'running' ? (
        <p className="flex items-center gap-2 text-sm" aria-live="polite">
          <LoaderCircleIcon aria-hidden className="size-4 animate-spin" />
          {t`Finding themes: part ${mine.partsDone + 1} of ${mine.parts}…`}
        </p>
      ) : mine?.state === 'failed' ? (
        <p
          role="alert"
          className="text-destructive text-sm"
        >{t`The last search for themes failed: try again.`}</p>
      ) : mine?.state === 'done' && (mine.droppedQuotes || mine.droppedThemes) ? (
        <p className="text-muted-foreground text-xs">{t`Left out of the last search: ${mine.droppedQuotes} quotes not found in the answers, ${mine.droppedThemes} themes without an answer.`}</p>
      ) : null}
      {shown ? <OpenItemThemes studyId={studyId} item={item} canChange={canChange} /> : null}
      {asking ? (
        <ThemesRunDialog
          studyId={studyId}
          item={item}
          onlyNew={asking === 'new'}
          open
          onOpenChange={(open) => (open ? undefined : setAsking(null))}
        />
      ) : null}
    </li>
  )
}
