import { useLingui } from '@lingui/react/macro'
import { Link } from '@tanstack/react-router'

/** Same page for "missing" and "no access" so nothing reveals what exists (FR-012). */
export function NotFound() {
  const { t } = useLingui()
  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-semibold">{t`Not found`}</h1>
      <p>{t`This page does not exist or you do not have access to it.`}</p>
      <Link to="/" className="underline">
        {t`Back to projects`}
      </Link>
    </div>
  )
}
