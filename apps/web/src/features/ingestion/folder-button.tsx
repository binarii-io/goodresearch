import { useGetFieldwork, useGetStudySource } from '@goodresearch/api-client'
import { Button } from '@goodresearch/ui/components/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@goodresearch/ui/components/dialog'
import { FolderIcon } from '@goodresearch/ui/components/icons'
import { Tooltip, TooltipContent, TooltipTrigger } from '@goodresearch/ui/components/tooltip'
import { useLingui } from '@lingui/react/macro'
import { useState } from 'react'
import { SourcePanel } from './source-panel.tsx'

/**
 * The study's Drive folder in the page bar: an icon whose name shows on hover, opening the folder
 * settings (refresh, replace, detach) in a dialog.
 */
export function FolderButton({
  studyId,
  isAdmin,
  interviewStudy,
}: {
  studyId: string
  isAdmin: boolean
  /** Only interview studies have interviews to count before a replace or a detach. */
  interviewStudy: boolean
}) {
  const { t } = useLingui()
  const [open, setOpen] = useState(false)
  const source = useGetStudySource(studyId)
  const folderName = source.data?.source?.folderName
  const fieldwork = useGetFieldwork(studyId, {
    query: { enabled: open && interviewStudy && source.data?.access === 'full' },
  })
  if (!folderName) return null
  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="outline"
              size="icon"
              aria-label={t`Study folder: ${folderName}. Change it`}
              onClick={() => setOpen(true)}
            />
          }
        >
          <FolderIcon aria-hidden />
        </TooltipTrigger>
        <TooltipContent className="grid gap-0.5">
          <span className="font-medium">{folderName}</span>
          <span>{t`Click to change`}</span>
        </TooltipContent>
      </Tooltip>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent closeLabel={t`Close`} className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t`Study folder`}</DialogTitle>
            <DialogDescription>{t`The Drive folder the interviews come from.`}</DialogDescription>
          </DialogHeader>
          <SourcePanel
            studyId={studyId}
            isAdmin={isAdmin}
            interviews={fieldwork.data?.sessions.length ?? 0}
            showFiles={false}
          />
        </DialogContent>
      </Dialog>
    </>
  )
}
