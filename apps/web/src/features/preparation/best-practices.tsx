import { BEST_PRACTICES, type BestPractices } from '@goodresearch/shared'
import { Button } from '@goodresearch/ui/components/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@goodresearch/ui/components/dialog'
import { BookOpenIcon, DownloadIcon } from '@goodresearch/ui/components/icons'
import { useLingui } from '@lingui/react/macro'
import type { ReactNode } from 'react'
import { normalise } from '../../app/i18n.ts'
import { downloadText } from './download.ts'
import { DriveButton, DriveStatus } from './drive-publishing.tsx'

/** `**bold**` only. */
const strong = (text: string): ReactNode[] =>
  text
    .split(/(\*\*[^*]+\*\*)/)
    .map((part, i) =>
      part.startsWith('**') && part.endsWith('**') ? (
        <strong key={i}>{part.slice(2, -2)}</strong>
      ) : (
        part
      ),
    )

export const practicesToMarkdown = (doc: BestPractices): string => {
  const lines = [`# ${doc.title}`, '', doc.intro, '']
  for (const s of doc.sections) {
    lines.push(`${s.level === 3 ? '###' : '##'} ${s.heading}`, '')
    for (const b of s.blocks) {
      if ('p' in b) lines.push(b.p, '')
      else if ('list' in b) lines.push(...b.list.map((item) => `- ${item}`), '')
      else lines.push(...b.checklist.map((item) => `- [ ] ${item}`), '')
    }
  }
  return `${lines.join('\n').trimEnd()}\n`
}

/** The interview best practices (US4), in the interface language. */
export function BestPracticesCard({ studyId }: { studyId: string }) {
  const { t, i18n } = useLingui()
  const doc = BEST_PRACTICES[normalise(i18n.locale)]
  const download = () =>
    downloadText(t`interview-best-practices.md`, practicesToMarkdown(doc), 'text/markdown')
  return (
    <section
      aria-labelledby="practices-heading"
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-highlight-soft p-4 text-highlight-soft-foreground"
    >
      <div className="grid gap-0.5">
        <h3 id="practices-heading" className="font-semibold">
          {doc.title}
        </h3>
        <p className="text-sm">{t`How to run a neutral interview: phases, questions, follow-ups, biases, what is measured.`}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Dialog>
          <DialogTrigger render={<Button variant="outline" />}>
            <BookOpenIcon aria-hidden />
            {t`Read the best practices`}
          </DialogTrigger>
          <DialogContent
            closeLabel={t`Close`}
            className="max-h-[85vh] overflow-y-auto sm:max-w-2xl"
          >
            <DialogHeader>
              <DialogTitle>{doc.title}</DialogTitle>
              <DialogDescription>{strong(doc.intro)}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 text-sm">
              {doc.sections.map((s) => (
                <section key={s.heading} className="grid gap-2">
                  {s.level === 3 ? (
                    <h4 className="font-semibold">{s.heading}</h4>
                  ) : (
                    <h3 className="font-semibold text-base">{s.heading}</h3>
                  )}
                  {s.blocks.map((b, i) =>
                    'p' in b ? (
                      <p key={i}>{strong(b.p)}</p>
                    ) : 'list' in b ? (
                      <ul key={i} className="ml-5 grid list-disc gap-1">
                        {b.list.map((item) => (
                          <li key={item}>{strong(item)}</li>
                        ))}
                      </ul>
                    ) : (
                      <ul key={i} className="grid gap-1">
                        {b.checklist.map((item) => (
                          <li key={item} className="flex gap-2">
                            <span aria-hidden>☐</span>
                            {item}
                          </li>
                        ))}
                      </ul>
                    ),
                  )}
                </section>
              ))}
            </div>
            <div>
              <Button variant="outline" onClick={download}>
                <DownloadIcon aria-hidden />
                {t`Download (Markdown)`}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        <Button variant="ghost" onClick={download}>
          <DownloadIcon aria-hidden />
          {t`Download (Markdown)`}
        </Button>
        <DriveButton studyId={studyId} kind="best-practices" size="default" />
      </div>
      <div className="basis-full empty:hidden">
        <DriveStatus studyId={studyId} kind="best-practices" />
      </div>
    </section>
  )
}
