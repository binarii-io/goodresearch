import type { Meta, StoryObj } from '@storybook/react-vite'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './alert-dialog.tsx'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './dialog.tsx'

const meta = { title: 'Dialogs' } satisfies Meta
export default meta

export const OpenDialog: StoryObj = {
  render: () => (
    <Dialog defaultOpen>
      <DialogContent closeLabel="Close">
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>A project holds one research question.</DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  ),
}

export const Confirmation: StoryObj = {
  render: () => (
    <AlertDialog defaultOpen>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete team?</AlertDialogTitle>
          <AlertDialogDescription>Members lose access to this team.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction>Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  ),
}
