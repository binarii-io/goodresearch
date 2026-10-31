import { type SimpleReformulation, useRequalifyReformulation } from '@goodresearch/api-client'
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
import { errorMessage } from '../workspace/errors.ts'
import { useRefreshQuality } from './use-refresh.ts'

/** FR-008a: a person reads a simple reformulation otherwise. No AI call. */
export function RequalifyDialog({
  studyId,
  reformulation,
  onClose,
}: {
  studyId: string
  reformulation: SimpleReformulation | null
  onClose: () => void
}) {
  const { t, i18n } = useLingui()
  const refresh = useRefreshQuality(studyId)
  const requalify = useRequalifyReformulation()
  const [reason, setReason] = useState('')
  const [wording, setWording] = useState('')
  const reasonId = useId()
  const wordingId = useId()
  const close = () => {
    setReason('')
    setWording('')
    onClose()
  }
  return (
    <Dialog open={reformulation !== null} onOpenChange={(open) => (open ? null : close())}>
      <DialogContent closeLabel={t`Close`}>
        <DialogHeader>
          <DialogTitle>{t`A reformulation with opinion?`}</DialogTitle>
          <DialogDescription>« {reformulation?.text} »</DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor={reasonId}>{t`Why: what does it add?`}</Label>
          <Textarea
            id={reasonId}
            value={reason}
            maxLength={500}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={wordingId}>{t`A better wording (optional)`}</Label>
          <Textarea
            id={wordingId}
            value={wording}
            maxLength={500}
            onChange={(e) => setWording(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close}>{t`Cancel`}</Button>
          <Button
            disabled={!reason.trim() || requalify.isPending}
            onClick={() => {
              if (!reformulation) return
              void requalify
                .mutateAsync({
                  studyId,
                  reformulationId: reformulation.id,
                  data: {
                    reason,
                    ...(wording.trim() ? { recommendation: wording } : {}),
                  },
                })
                .then(refresh)
                .then(close)
                .catch((failure: unknown) => toast.error(errorMessage(i18n, failure)))
            }}
          >
            {t`Make it a remark`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
