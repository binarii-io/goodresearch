import type { Meta, StoryObj } from '@storybook/react-vite'
import { Badge } from './badge.tsx'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './card.tsx'
import { Skeleton } from './skeleton.tsx'
import { GoogleDriveIcon } from './source-icons.tsx'
import { StatTile, StatTiles } from './stat-tile.tsx'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './table.tsx'

const meta = { title: 'Display' } satisfies Meta
export default meta

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
