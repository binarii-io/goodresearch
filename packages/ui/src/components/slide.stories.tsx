import type { Meta, StoryObj } from '@storybook/react-vite'
import { SlideFlag, SlideLabel, SlidePill, SlideStat, SlideTable } from './slide.tsx'

const meta = { title: 'Slide' } satisfies Meta
export default meta

const Frame = ({ children }: { children: React.ReactNode }) => (
  <article className="flex aspect-video w-[720px] flex-col gap-[2cqw] rounded-xl border bg-card p-[5%] [container-type:inline-size]">
    {children}
  </article>
)

export const Pieces: StoryObj = {
  render: () => (
    <Frame>
      <SlideLabel>Numbers</SlideLabel>
      <div className="flex gap-[6cqw]">
        <SlideStat value={12} label="interviews retained" mark />
        <SlideStat value={9} label="participants" />
      </div>
      <SlideTable
        head={['#', 'Insight', 'Confidence']}
        rows={[
          [
            '1',
            'Teams lose time finding their data.',
            <SlidePill key="c" strong>
              High confidence
            </SlidePill>,
          ],
          [
            '2',
            <span key="s">
              Sharing happens by email. <SlideFlag>To validate</SlideFlag>
            </span>,
            <SlidePill key="c">Low confidence</SlidePill>,
          ],
        ]}
      />
    </Frame>
  ),
}
