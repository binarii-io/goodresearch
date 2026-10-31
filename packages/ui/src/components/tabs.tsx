import { Tabs as TabsPrimitive } from '@base-ui/react/tabs'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from 'cn'
import type * as React from 'react'

function Tabs({ className, orientation = 'horizontal', ...props }: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      className={cn('group/tabs flex gap-4 data-horizontal:flex-col', className)}
      {...props}
    />
  )
}

/** `segmented`: pills on a second surface (study phases); `line`: ink underline (page tabs). */
const tabsListVariants = cva(
  'group/tabs-list inline-flex w-fit max-w-full flex-wrap items-center text-muted-foreground group-data-vertical/tabs:flex-col',
  {
    variants: {
      variant: {
        segmented: 'gap-1 rounded-[12px] border bg-muted p-1',
        line: 'w-full gap-1 border-b',
      },
    },
    defaultVariants: { variant: 'segmented' },
  },
)

function TabsList({
  className,
  variant = 'segmented',
  ...props
}: TabsPrimitive.List.Props & VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  )
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-trigger"
      className={cn(
        "relative inline-flex cursor-pointer items-center justify-center gap-1.5 text-sm font-medium whitespace-nowrap transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-active:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        'group-data-[variant=segmented]/tabs-list:rounded-[9px] group-data-[variant=segmented]/tabs-list:px-4 group-data-[variant=segmented]/tabs-list:py-2 group-data-[variant=segmented]/tabs-list:data-active:bg-card group-data-[variant=segmented]/tabs-list:data-active:shadow-[0_1px_2px_rgb(28_34_48/0.08),0_0_0_1px_var(--border)]',
        'group-data-[variant=line]/tabs-list:-mb-px group-data-[variant=line]/tabs-list:border-b-2 group-data-[variant=line]/tabs-list:border-transparent group-data-[variant=line]/tabs-list:px-3 group-data-[variant=line]/tabs-list:py-2.5 group-data-[variant=line]/tabs-list:data-active:border-foreground',
        className,
      )}
      {...props}
    />
  )
}

/** The line above a table: its tabs at the left, what acts on the table at the right. */
function TabsBar({
  action,
  className,
  children,
  ...props
}: React.ComponentProps<'div'> & { action?: React.ReactNode }) {
  return (
    <div
      data-slot="tabs-bar"
      className={cn('flex flex-wrap items-center gap-3', className)}
      {...props}
    >
      {children}
      {action ? <div className="ml-auto flex flex-wrap items-center gap-2">{action}</div> : null}
    </div>
  )
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-content"
      className={cn('flex-1 text-sm', className)}
      {...props}
    />
  )
}

export { Tabs, TabsBar, TabsContent, TabsList, TabsTrigger, tabsListVariants }
