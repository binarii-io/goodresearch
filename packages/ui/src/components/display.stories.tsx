import type { Meta, StoryObj } from '@storybook/react-vite'
import { Badge } from './badge.tsx'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './card.tsx'
import { Skeleton } from './skeleton.tsx'
import { GoogleDriveIcon } from './source-icons.tsx'
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
