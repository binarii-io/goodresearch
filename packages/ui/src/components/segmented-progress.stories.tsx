import type { Meta, StoryObj } from '@storybook/react-vite'
import { SegmentedProgress } from './segmented-progress.tsx'

const meta = { title: 'Segmented progress' } satisfies Meta
export default meta

const labels = { missing: 'missing', partial: 'partial', done: 'covered' } as const
const points = [
  ['objectives', 'Objectives and themes', 15, 'done'],
  ['hypotheses', 'Hypotheses', 10, 'partial'],
  ['audience', 'Audience and recruitment', 15, 'partial'],
  ['format', 'Format and logistics', 10, 'missing'],
  ['intro', 'Introduction and warm-up', 10, 'missing'],
  ['themes', 'Thematic questions', 25, 'missing'],
  ['followUps', 'Follow-ups', 10, 'missing'],
  ['biasReview', 'Bias review', 5, 'missing'],
] as const

export const GuideDesign: StoryObj = {
  render: () => (
    <SegmentedProgress
      className="max-w-sm"
      label="Interview guide design"
      percent={33}
      listLabel="8 points"
      segments={points.map(([key, label, weight, status]) => ({
        key,
        label,
        weight,
        status,
        statusLabel: labels[status],
      }))}
    />
  ),
}
