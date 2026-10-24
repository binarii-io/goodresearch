import { useLingui } from '@lingui/react/macro'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { CreateTeamForm } from '../../features/workspace/first-team.tsx'

/** Shown to an admin while no team exists: every project belongs to a team (FR-002). */
export const Route = createFileRoute('/_authenticated/welcome')({ component: Welcome })

function Welcome() {
  const { t } = useLingui()
  const navigate = useNavigate()
  return (
    <div className="grid max-w-xl gap-6">
      <h1 className="text-2xl font-semibold">{t`Welcome to goodresearch`}</h1>
      <p>{t`Every project belongs to a team, and people get access to projects through their teams. Create a first team to start.`}</p>
      <CreateTeamForm submitLabel={t`Create team`} onCreated={() => void navigate({ to: '/' })} />
    </div>
  )
}
