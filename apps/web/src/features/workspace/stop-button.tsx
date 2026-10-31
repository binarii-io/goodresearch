import { Button } from '@goodresearch/ui/components/button'
import { LoaderCircleIcon, SquareIcon } from '@goodresearch/ui/components/icons'
import { useLingui } from '@lingui/react/macro'
import type { ComponentProps } from 'react'

/** Stops a run; a run ends only after the part it is on, so the button says it was heard. */
export function StopButton({
  stopping,
  ...props
}: Omit<ComponentProps<typeof Button>, 'children' | 'disabled'> & { stopping: boolean }) {
  const { t } = useLingui()
  return (
    <Button variant="outline" size="sm" disabled={stopping} {...props}>
      {stopping ? (
        <LoaderCircleIcon aria-hidden className="animate-spin" />
      ) : (
        <SquareIcon aria-hidden />
      )}
      {stopping ? t`Stopping…` : t`Stop`}
    </Button>
  )
}
