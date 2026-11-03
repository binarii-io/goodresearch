import { Button } from '@goodresearch/ui/components/button'
import { useLingui } from '@lingui/react/macro'

/** Previous and next for a paged list, as the interview facts list shows them; nothing on one page. */
export function Pager({
  page,
  total,
  pageSize,
  onPage,
}: {
  page: number
  total: number
  pageSize: number
  onPage: (page: number) => void
}) {
  const { t } = useLingui()
  const pages = Math.max(1, Math.ceil(total / pageSize))
  if (pages <= 1) return null
  return (
    <nav className="flex items-center gap-2" aria-label={t`Pages`}>
      <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        {t`Previous`}
      </Button>
      <span className="text-sm">{t`Page ${page} of ${pages}`}</span>
      <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        {t`Next`}
      </Button>
    </nav>
  )
}
