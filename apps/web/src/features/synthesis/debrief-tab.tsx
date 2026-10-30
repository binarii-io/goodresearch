import {
  ApiError,
  type DebriefView,
  type DeckSlide,
  getGetDebriefQueryKey,
  useGetDebrief,
  usePublishDebrief,
  useUpdateDebrief,
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
import { Checkbox } from '@goodresearch/ui/components/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@goodresearch/ui/components/dialog'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  ExternalLinkIcon,
  LoaderCircleIcon,
  PresentationIcon,
  TriangleAlertIcon,
  XIcon,
} from '@goodresearch/ui/components/icons'
import { Label } from '@goodresearch/ui/components/label'
import { RadioGroup, RadioGroupItem } from '@goodresearch/ui/components/radio-group'
import { Segmented, SegmentedItem } from '@goodresearch/ui/components/segmented'
import { Skeleton } from '@goodresearch/ui/components/skeleton'
import { useLingui } from '@lingui/react/macro'
import { keepPreviousData, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { Choice } from '../analysis/choice.tsx'
import { errorCode, errorMessage } from '../workspace/errors.ts'
import { useFormatRelative } from '../workspace/format.ts'
import { DeckSlideView } from './deck-slide.tsx'

/** Goes to Google's consent for editing, then back to this tab (spec 007 FR-002). */
const askWriteConsent = (projectId: string) => {
  const back = `/projects/${projectId}?tab=debrief`
  window.location.assign(
    `/api/sources/google-drive/connect?access=write&returnTo=${encodeURIComponent(back)}`,
  )
}

/** Spec 015: the project's debrief deck, built from its data each time it is opened. */
export function DebriefTab({ projectId }: { projectId: string }) {
  const { t, i18n } = useLingui()
  const formatRelative = useFormatRelative()
  const queryClient = useQueryClient()
  const proposedId = useId()
  const [withProposed, setWithProposed] = useState(false)
  const [presenting, setPresenting] = useState<number | null>(null)
  // FR-005: all slides, or one at a time in the page; "Present" alone goes full screen.
  const [view, setView] = useState<'grid' | 'slide'>('grid')
  const [current, setCurrent] = useState(0)
  const [publishing, setPublishing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [printing, setPrinting] = useState(false)
  const debrief = useGetDebrief(
    projectId,
    { withProposed: withProposed ? 'true' : 'false' },
    // The option changes the deck without a flash: the previous one stays until the next is in.
    { query: { refetchOnMount: 'always', placeholderData: keepPreviousData } },
  )
  const update = useUpdateDebrief()
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: getGetDebriefQueryKey(projectId) })
  const data = debrief.data
  const count = data?.slides.length ?? 0
  const at = Math.min(current, Math.max(0, count - 1))
  // The arrows move between slides in the slide view, unless typing or presenting.
  useEffect(() => {
    if (view !== 'slide' || presenting !== null) return
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]'))
        return
      const step = ['ArrowRight', 'PageDown'].includes(event.key)
        ? 1
        : ['ArrowLeft', 'PageUp'].includes(event.key)
          ? -1
          : 0
      if (!step) return
      event.preventDefault()
      setCurrent((n) => Math.max(0, Math.min(count - 1, Math.min(n, count - 1) + step)))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [view, presenting, count])
  if (debrief.isPending) return <Skeleton className="h-40 w-full" />
  if (!data) return <p role="alert">{errorMessage(i18n, debrief.error)}</p>

  const runUpdate = async (replace: boolean) => {
    try {
      await update.mutateAsync({ projectId, data: { replace } })
      toast.success(t`Google Slides presentation updated`)
      await refresh()
    } catch (failure) {
      const code = errorCode(failure)
      if (code === 'DECK_CHANGED_IN_SLIDES') return setConfirming(true)
      if (code === 'DRIVE_WRITE_REQUIRED') return askWriteConsent(projectId)
      if (code === 'DECK_FILE_GONE') setPublishing(true)
      const owner =
        failure instanceof ApiError && typeof failure.problem?.detail?.owner === 'string'
          ? failure.problem.detail.owner
          : null
      toast.error(
        code === 'DRIVE_CANNOT_EDIT' && owner
          ? t`You cannot edit this presentation in Google Slides: ask its owner, ${owner}.`
          : errorMessage(i18n, failure),
      )
    }
  }

  const published = data.published
  const nothingDecided =
    data.counts.insights.validated + data.counts.recommendations.validated === 0
  const toDecide = data.counts.insights.toDecide + data.counts.recommendations.toDecide
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-semibold text-lg">{t`Debrief`}</h2>
          <span className="text-muted-foreground text-sm">{t`${data.slides.length} slides`}</span>
          {debrief.isFetching ? (
            <LoaderCircleIcon aria-hidden className="size-4 animate-spin text-muted-foreground" />
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented aria-label={t`View`}>
            <SegmentedItem pressed={view === 'grid'} onClick={() => setView('grid')}>
              {t`All slides`}
            </SegmentedItem>
            <SegmentedItem pressed={view === 'slide'} onClick={() => setView('slide')}>
              {t`Slide by slide`}
            </SegmentedItem>
          </Segmented>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPresenting(view === 'slide' ? at : 0)}
          >
            <PresentationIcon aria-hidden />
            {t`Present`}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setPrinting(true)}>
            <DownloadIcon aria-hidden />
            {t`Print or save as PDF`}
          </Button>
          {published && !data.otherAccess ? (
            <Button size="sm" disabled={update.isPending} onClick={() => void runUpdate(false)}>
              {update.isPending ? <LoaderCircleIcon aria-hidden className="animate-spin" /> : null}
              {t`Update in Google Slides`}
            </Button>
          ) : null}
          <Button
            size="sm"
            variant={published ? 'outline' : 'default'}
            disabled={data.folders.length === 0}
            onClick={() => setPublishing(true)}
          >
            {published ? t`Publish a new copy` : t`Publish to Google Slides`}
          </Button>
        </div>
      </div>

      {/* Kept while ticked, so it can be unticked; an unused takeaways draft offers it too. */}
      {toDecide > 0 || withProposed || data.takeawaysDraft ? (
        <div className="flex items-start gap-2">
          <Checkbox
            id={proposedId}
            checked={withProposed}
            onCheckedChange={(checked) => setWithProposed(checked === true)}
          />
          <Label htmlFor={proposedId} className="grid gap-0.5 font-normal">
            <span>{t`Include what is still to decide`}</span>
            <span className="text-muted-foreground text-xs">{t`${toDecide} insights and recommendations not validated yet; each slide holding one says "to validate".`}</span>
          </Label>
        </div>
      ) : null}

      {data.folders.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t`Publishing needs a study of the project with a Drive folder you can open.`}</p>
      ) : null}

      {published ? (
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <a
            href={published.link}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 underline underline-offset-2"
          >
            <ExternalLinkIcon aria-hidden className="size-4" />
            {t`Open in Google Slides`}
          </a>
          {data.otherAccess ? (
            <span className="text-muted-foreground text-xs">{t`Published from studies you cannot all open (or more of them): only someone with the same access can update it.`}</span>
          ) : (
            <Badge variant="outline">
              {data.outOfDate ? <TriangleAlertIcon aria-hidden /> : null}
              {data.outOfDate ? t`Out of date` : t`In sync`}
            </Badge>
          )}
          <span className="text-muted-foreground text-xs">
            {t`Published ${formatRelative(published.publishedAt)} by ${published.publishedBy.name ?? '…'}`}
            {published.language === 'fr' ? t` · in French` : t` · in English`}
            {published.withProposed ? t` · with what is still to decide` : ''}
          </span>
        </p>
      ) : null}

      {nothingDecided && !withProposed ? (
        <div className="grid gap-2 rounded-md bg-muted/50 p-3 text-sm">
          <p>{t`The deck shows the validated insights and recommendations only. Validate them first, or include what is still to decide.`}</p>
          <p className="flex flex-wrap gap-3">
            <Link to="." search={(p) => ({ ...p, tab: 'insights' })} className="underline">
              {t`Go to Insights`}
            </Link>
            <Link to="." search={(p) => ({ ...p, tab: 'recommendations' })} className="underline">
              {t`Go to Recommendations`}
            </Link>
          </p>
        </div>
      ) : null}

      {view === 'grid' ? (
        <ol aria-label={t`Slides`} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data.slides.map((slide, n) => (
            <li key={n} className="relative">
              <DeckSlideView slide={slide} number={n + 1} total={data.slides.length} />
              {/* Over the whole slide, not around it: the slide keeps its own structure (WCAG). */}
              <Button
                variant="ghost"
                className="absolute inset-x-0 top-0 aspect-video h-auto w-full rounded-lg p-0 hover:bg-foreground/5"
                aria-label={t`Open slide ${n + 1}`}
                onClick={() => {
                  setCurrent(n)
                  setView('slide')
                }}
              />
              <p className="mt-1 text-muted-foreground text-xs">{n + 1}</p>
            </li>
          ))}
        </ol>
      ) : data.slides[at] ? (
        <section aria-label={t`Slide ${at + 1} of ${count}`} className="grid gap-3">
          <div className="mx-auto w-full max-w-[min(100%,calc((100vh-16rem)*16/9))]">
            <DeckSlideView slide={data.slides[at]} number={at + 1} total={count} />
          </div>
          <div className="flex items-center justify-center gap-3">
            <Button
              variant="outline"
              size="icon"
              aria-label={t`Previous slide`}
              disabled={at === 0}
              onClick={() => setCurrent(at - 1)}
            >
              <ChevronLeftIcon aria-hidden />
            </Button>
            <span aria-live="polite" className="text-sm tabular-nums">
              {t`Slide ${at + 1} of ${count}`}
            </span>
            <Button
              variant="outline"
              size="icon"
              aria-label={t`Next slide`}
              disabled={at >= count - 1}
              onClick={() => setCurrent(at + 1)}
            >
              <ChevronRightIcon aria-hidden />
            </Button>
          </div>
        </section>
      ) : null}

      {printing ? <PrintDeck slides={data.slides} onDone={() => setPrinting(false)} /> : null}
      {presenting !== null ? (
        <Presenter slides={data.slides} start={presenting} onClose={() => setPresenting(null)} />
      ) : null}
      <PublishDialog
        projectId={projectId}
        data={data}
        withProposed={withProposed}
        open={publishing}
        onOpenChange={setPublishing}
        onDone={refresh}
      />
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t`Changed in Google Slides`}</AlertDialogTitle>
            <AlertDialogDescription>{t`The presentation was edited in Google Slides since it was published. Updating replaces those changes with the deck as it is now.`}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t`Cancel`}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirming(false)
                void runUpdate(true)
              }}
            >
              {t`Replace the Google Slides version`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/** Every slide on its own 16:9 page, then the browser's print (PDF) dialog (prototype). */
function PrintDeck({ slides, onDone }: { slides: readonly DeckSlide[]; onDone: () => void }) {
  // Printed once: a re-render of the tab (a refetch, a toast) never asks again (review of PR #15).
  const done = useRef(onDone)
  done.current = onDone
  useEffect(() => {
    const finish = () => done.current()
    window.addEventListener('afterprint', finish, { once: true })
    // Two frames: the slides are laid out, then fitted, before the print starts.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => window.print())
    })
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('afterprint', finish)
    }
  }, [])
  return createPortal(
    <div data-print-deck="">
      {slides.map((slide, n) => (
        <div key={n} data-print-slide="">
          <DeckSlideView slide={slide} number={n + 1} total={slides.length} />
        </div>
      ))}
    </div>,
    document.body,
  )
}

/** FR-005: full screen, keyboard (arrows, Page Up/Down, Space, Home, End, Escape). */
function Presenter({
  slides,
  start,
  onClose,
}: {
  slides: readonly DeckSlide[]
  start: number
  onClose: () => void
}) {
  const { t } = useLingui()
  const [at, setAt] = useState(start)
  const root = useRef<HTMLDivElement>(null)
  const last = slides.length - 1
  const go = useCallback((n: number) => setAt(Math.max(0, Math.min(last, n))), [last])
  const close = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
    onClose()
  }, [onClose])
  useEffect(() => {
    root.current?.focus()
    // Full screen when the browser allows it; the overlay fills the window otherwise.
    void root.current?.requestFullscreen?.().catch(() => undefined)
    // Escape in full screen leaves it without a key event: leaving full screen closes too.
    const left = () => {
      if (!document.fullscreenElement) onClose()
    }
    document.addEventListener('fullscreenchange', left)
    return () => document.removeEventListener('fullscreenchange', left)
  }, [onClose])
  const onKey = (event: React.KeyboardEvent) => {
    const keys: Record<string, () => void> = {
      ArrowRight: () => go(at + 1),
      ArrowDown: () => go(at + 1),
      PageDown: () => go(at + 1),
      ' ': () => go(at + 1),
      ArrowLeft: () => go(at - 1),
      ArrowUp: () => go(at - 1),
      PageUp: () => go(at - 1),
      Home: () => go(0),
      End: () => go(last),
      Escape: close,
    }
    const action = keys[event.key]
    if (!action) return
    event.preventDefault()
    action()
  }
  const slide = slides[at]
  return (
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: the presentation is a modal dialog driven by the keyboard (FR-005).
    <div
      ref={root}
      role="dialog"
      aria-modal="true"
      aria-label={t`Debrief presentation`}
      tabIndex={-1}
      onKeyDown={onKey}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-background p-4 outline-none"
    >
      <div className="w-full max-w-[min(100%,calc((100vh-6rem)*16/9))]">
        {slide ? <DeckSlideView slide={slide} number={at + 1} total={slides.length} /> : null}
      </div>
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="icon"
          aria-label={t`Previous slide`}
          disabled={at === 0}
          onClick={() => go(at - 1)}
        >
          <ChevronLeftIcon aria-hidden />
        </Button>
        <span aria-live="polite" className="text-sm tabular-nums">
          {t`Slide ${at + 1} of ${slides.length}`}
        </span>
        <Button
          variant="outline"
          size="icon"
          aria-label={t`Next slide`}
          disabled={at === last}
          onClick={() => go(at + 1)}
        >
          <ChevronRightIcon aria-hidden />
        </Button>
        <Button variant="ghost" size="icon" aria-label={t`Leave the presentation`} onClick={close}>
          <XIcon aria-hidden />
        </Button>
      </div>
    </div>
  )
}

/** FR-007: a Google Slides copy in the folder of one of the project's studies. */
function PublishDialog({
  projectId,
  data,
  withProposed,
  open,
  onOpenChange,
  onDone,
}: {
  projectId: string
  data: DebriefView
  withProposed: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  onDone: () => Promise<void>
}) {
  const { t, i18n } = useLingui()
  const languageId = useId()
  const publish = usePublishDebrief()
  const [studyId, setStudyId] = useState(data.published?.studyId ?? data.folders[0]?.studyId ?? '')
  const [language, setLanguage] = useState<'en' | 'fr'>(data.language)
  const chosen = data.folders.some((f) => f.studyId === studyId)
    ? studyId
    : (data.folders[0]?.studyId ?? '')
  const send = async () => {
    try {
      await publish.mutateAsync({ projectId, data: { studyId: chosen, language, withProposed } })
      onOpenChange(false)
      toast.success(t`Published to Google Slides`)
      await onDone()
    } catch (failure) {
      if (errorCode(failure) === 'DRIVE_WRITE_REQUIRED') return askWriteConsent(projectId)
      toast.error(errorMessage(i18n, failure))
      // Created but left empty: it is kept and shown out of date, to be updated.
      if (errorCode(failure) === 'DECK_NOT_WRITTEN') {
        onOpenChange(false)
        await onDone()
      }
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t`Close`}>
        <DialogHeader>
          <DialogTitle>{t`Publish to Google Slides`}</DialogTitle>
          <DialogDescription>{t`A Google Slides presentation of the deck is created in the study's Drive folder, with your own Drive access. Nothing is ever deleted in Drive.`}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <Choice
            label={t`Folder of the study`}
            value={chosen}
            className="w-full"
            options={data.folders.map((f) => ({ value: f.studyId, label: f.name }))}
            onChange={setStudyId}
          />
          <fieldset className="grid gap-2">
            <legend className="mb-1 font-medium text-sm">{t`Language of the presentation`}</legend>
            <RadioGroup value={language} onValueChange={(v) => setLanguage(v as 'en' | 'fr')}>
              <div className="flex items-center gap-2">
                <RadioGroupItem id={`${languageId}-en`} value="en" />
                <Label htmlFor={`${languageId}-en`} className="font-normal">
                  {t`English`}
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem id={`${languageId}-fr`} value="fr" />
                <Label htmlFor={`${languageId}-fr`} className="font-normal">
                  {t`French`}
                </Label>
              </div>
            </RadioGroup>
          </fieldset>
          <p className="text-muted-foreground text-sm">
            {withProposed
              ? t`It includes what is still to decide, marked "to validate".`
              : t`It shows what is validated only.`}
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t`Cancel`}
          </Button>
          <Button disabled={!chosen || publish.isPending} onClick={() => void send()}>
            {publish.isPending ? <LoaderCircleIcon aria-hidden className="animate-spin" /> : null}
            {t`Publish`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
