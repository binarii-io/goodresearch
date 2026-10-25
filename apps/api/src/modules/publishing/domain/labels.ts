import type { Language } from './model.ts'

/**
 * Texts written into the published files (document headings, column titles, statuses). They are
 * file content in the publication language, not interface strings (the API has no Lingui).
 */
export const LABELS = {
  en: {
    guide: 'Interview guide',
    practices: 'Interview best practices',
    schedule: 'Interview schedule',
    framing: 'Framing',
    objectives: 'Objectives',
    hypotheses: 'Hypotheses',
    audience: 'Audience',
    format: 'Format',
    minutes: 'min',
    columns: {
      interviewee: 'Person to interview',
      role: 'Role',
      interviewers: 'Interviewer(s)',
      scheduledAt: 'Date and time',
      status: 'Status',
      notes: 'Notes',
    },
    statuses: {
      'to-contact': 'To contact',
      invited: 'Invited',
      scheduled: 'Scheduled',
      done: 'Done',
      postponed: 'Postponed',
      cancelled: 'Cancelled',
    },
  },
  fr: {
    guide: 'Guide d’entretien',
    practices: 'Bonnes pratiques d’entretien',
    schedule: 'Planning des entretiens',
    framing: 'Cadrage',
    objectives: 'Objectifs',
    hypotheses: 'Hypothèses',
    audience: 'Cible',
    format: 'Format',
    minutes: 'min',
    columns: {
      interviewee: 'Personne à interviewer',
      role: 'Rôle',
      interviewers: 'Intervieweur(s)',
      scheduledAt: 'Date et heure',
      status: 'Statut',
      notes: 'Notes',
    },
    statuses: {
      'to-contact': 'À contacter',
      invited: 'Invité',
      scheduled: 'Planifié',
      done: 'Réalisé',
      postponed: 'Reporté',
      cancelled: 'Annulé',
    },
  },
} as const satisfies Record<Language, unknown>
