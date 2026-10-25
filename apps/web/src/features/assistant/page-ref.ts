import type { AssistantPage } from '@goodresearch/api-client'
import { useRouterState } from '@tanstack/react-router'

/** The page the assistant is looking at (spec 005 US2), from the address. */
export const usePageRef = (): AssistantPage => {
  const { pathname, search } = useRouterState({
    select: (state) => ({ pathname: state.location.pathname, search: state.location.search }),
  })
  // Ids are UUIDs; anything else is not a page the assistant can describe.
  const project = /^\/projects\/([0-9a-f-]{36})(?:\/|$)/i.exec(pathname)?.[1]
  if (project) return { kind: 'project', id: project }
  const study = /^\/studies\/([0-9a-f-]{36})(?:\/|$)/i.exec(pathname)?.[1]
  if (study) {
    // The tab the person is on (the study opens on Fieldwork, spec 008).
    const phase = (search as { phase?: unknown }).phase
    return {
      kind: 'study',
      id: study,
      phase: phase === 'preparation' || phase === 'analysis' ? phase : 'fieldwork',
    }
  }
  if (pathname === '/') return { kind: 'home' }
  if (pathname.startsWith('/teams')) return { kind: 'teams' }
  if (pathname.startsWith('/members')) return { kind: 'members' }
  if (pathname.startsWith('/sources')) return { kind: 'sources' }
  return { kind: 'other' }
}
