import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { Badge } from './badge.tsx'
import { Button } from './button.tsx'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './card.tsx'
import { Progress } from './progress.tsx'
import { Skeleton } from './skeleton.tsx'
import { GoogleDriveIcon } from './source-icons.tsx'
import { StatTile, StatTiles } from './stat-tile.tsx'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './table.tsx'
import { Tabs, TabsBar, TabsList, TabsTrigger } from './tabs.tsx'

const meta = { title: 'Display' } satisfies Meta
export default meta

/** The line above a table: the tabs at the left edge, the action at the right, on one line. */
export const TableTabsBar: StoryObj = {
  render: () => (
    <Tabs defaultValue="one" className="w-[48rem] gap-4">
      <TabsBar action={<Button>Run</Button>}>
        <TabsList aria-label="Views">
          <TabsTrigger value="one">One</TabsTrigger>
          <TabsTrigger value="two">Two (3)</TabsTrigger>
        </TabsList>
      </TabsBar>
    </Tabs>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const bar = canvas.getByRole('tablist').parentElement?.getBoundingClientRect()
    const tabs = canvas.getByRole('tablist').getBoundingClientRect()
    const action = canvas.getByRole('button', { name: 'Run' }).getBoundingClientRect()
    await expect(tabs.left).toBeCloseTo(bar?.left ?? -1, 0)
    await expect(action.right).toBeCloseTo(bar?.right ?? -1, 0)
    await expect(action.top).toBeLessThan(tabs.bottom)
  },
}

export const RunProgress: StoryObj = {
  render: () => <Progress aria-label="Progress" value={3} max={8} />,
}

export const ProjectCard: StoryObj = {
  render: () => (
    <Card className="max-w-sm">
      <CardHeader>
        <CardTitle>Onboarding study</CardTitle>
        <CardDescription>Research · updated 2 hours ago</CardDescription>
      </CardHeader>
      <CardContent>
        <Badge variant="secondary">Research</Badge>
      </CardContent>
    </Card>
  ),
}

export const MembersTable: StoryObj = {
  render: () => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Role</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell>Alex Example</TableCell>
          <TableCell>
            <Badge>Admin</Badge>
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  ),
}

export const Loading: StoryObj = { render: () => <Skeleton className="h-6 w-48" /> }

export const SourceIcons: StoryObj = {
  render: () => (
    <span className="flex items-center gap-2">
      <GoogleDriveIcon /> Google Drive
    </span>
  ),
}

export const StatTileRow: StoryObj = {
  render: () => (
    <StatTiles>
      <StatTile label="Interviews found" value={12} detail="9 validated · 3 to review" />
      <StatTile label="With a recording" value={8} detail="6 videos · 2 audio" />
      <StatTile label="Planned interviews" value={14} detail="2 without a transcript yet" />
      <StatTile label="Done in the schedule" value={10} />
    </StatTiles>
  ),
}
