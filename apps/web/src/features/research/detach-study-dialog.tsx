import { useDetachStudy } from '@goodresearch/api-client'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@goodresearch/ui/components/alert-dialog'
import { Button } from '@goodresearch/ui/components/button'
import { useLingui } from '@lingui/react/macro'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { errorMessage } from '../workspace/errors.ts'

/** Spec 019 US2: nothing of the study is deleted; the confirmation says where it stays. */
export function DetachStudyDialog({
  projectId,
  study,
}: {
  projectId: string
  study: { id: string; name: string; alsoIn: readonly { name: string }[] }
}) {
  const { t, i18n } = useLingui()
  const queryClient = useQueryClient()
  const detach = useDetachStudy()
  const others = study.alsoIn.map((p) => p.name).join(', ')
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button size="sm" variant="ghost" className="relative z-10" />}>
        {t`Detach`}
        <span className="sr-only"> {study.name}</span>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t`Detach this study from the project?`}</AlertDialogTitle>
          <AlertDialogDescription>
            {others
              ? t`It stays in ${others}, with its interviews and facts. Insights already written keep citing its facts, marked as outside the project.`
              : t`It will no longer be in any project and stays on the team's Studies page, with its interviews and facts. Insights already written keep citing its facts, marked as outside the project.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t`Cancel`}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() =>
              void detach
                .mutateAsync({ projectId, studyId: study.id })
                .then(() => queryClient.invalidateQueries())
                .catch((failure: unknown) => toast.error(errorMessage(i18n, failure)))
            }
          >
            {t`Detach`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
