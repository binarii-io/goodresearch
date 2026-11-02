import { LockIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Badge } from './badge.tsx'

/** Says at once that a page is read only, and whose it is (spec 026). Texts come translated. */
export function ReadOnlyBadge({ children, team }: { children: ReactNode; team: string }) {
  return (
    <Badge variant="secondary" data-slot="read-only-badge">
      <LockIcon aria-hidden />
      <span>
        {children} · {team}
      </span>
    </Badge>
  )
}
