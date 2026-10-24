import { useRender } from '@base-ui/react/use-render'
import { cn } from 'cn'
import { MenuIcon, PanelLeftIcon } from 'lucide-react'
import * as React from 'react'
import { Button } from './button.tsx'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from './sheet.tsx'
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip.tsx'

type SidebarState = {
  /** Icon rail (desktop only). */
  collapsed: boolean
  /** Rendered in the small-screen drawer. */
  mobile: boolean
  toggle: () => void
  /** Closes the drawer after a choice (no effect on desktop). */
  close: () => void
}

const SidebarContext = React.createContext<SidebarState>({
  collapsed: false,
  mobile: false,
  toggle: () => {},
  close: () => {},
})

const useSidebar = () => React.useContext(SidebarContext)

// Browser storage can be unavailable (private mode): the sidebar then starts expanded.
const readCollapsed = (key: string): boolean => {
  try {
    return globalThis.localStorage?.getItem(key) === 'collapsed'
  } catch {
    return false
  }
}
const writeCollapsed = (key: string, collapsed: boolean) => {
  try {
    globalThis.localStorage?.setItem(key, collapsed ? 'collapsed' : 'expanded')
  } catch {
    // Only the memory of the choice is lost.
  }
}

/**
 * Signed-in frame (spec 003, US2): sidebar (264 px, or a 64 px icon rail) and a main column with a
 * sticky top bar. Below 768 px the sidebar moves into a drawer opened from the top bar.
 */
function AppShell({
  sidebar,
  topbar,
  mobileBrand,
  labels,
  storageKey = 'goodresearch.sidebar',
  location,
  panel,
  children,
}: {
  sidebar: React.ReactNode
  topbar?: React.ReactNode
  /** Shown next to the menu button on small screens. */
  mobileBrand?: React.ReactNode
  labels: { openMenu: string; menu: string; closeMenu: string }
  /** Changes on every navigation (the current path): the drawer closes, whatever was clicked. */
  location: string
  storageKey?: string
  /**
   * A panel on the right (spec 005): on ≥ 768 px it slides in and pushes the page, below it covers
   * the screen. Animated unless the person prefers reduced motion; inert while closed.
   */
  panel?: {
    id: string
    label: string
    open: boolean
    onClose: () => void
    content: React.ReactNode
  }
  children: React.ReactNode
}) {
  const [collapsed, setCollapsed] = React.useState(() => readCollapsed(storageKey))
  const [drawerOpen, setDrawerOpen] = React.useState(false)
  const panelRef = React.useRef<HTMLElement>(null)
  const onPanelClose = panel?.onClose
  // Escape inside the panel closes it (spec 005 FR-003), unless something in the panel already
  // used it (an edit field cancelling, a menu closing): listened on window, after React's handlers.
  React.useEffect(() => {
    if (!onPanelClose) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      if (!(event.target instanceof Node) || !panelRef.current?.contains(event.target)) return
      onPanelClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onPanelClose])
  // Any navigation closes the drawer, whatever was clicked (brand, shortcut, dialog).
  React.useEffect(() => setDrawerOpen(false), [location])
  const desktop = React.useMemo<SidebarState>(
    () => ({
      collapsed,
      mobile: false,
      toggle: () =>
        setCollapsed((value) => {
          writeCollapsed(storageKey, !value)
          return !value
        }),
      close: () => {},
    }),
    [collapsed, storageKey],
  )
  const drawer = React.useMemo<SidebarState>(
    () => ({ collapsed: false, mobile: true, toggle: () => {}, close: () => setDrawerOpen(false) }),
    [],
  )

  return (
    <div
      data-slot="app-shell"
      data-collapsed={collapsed || undefined}
      className="min-h-svh bg-card md:grid md:grid-cols-[264px_minmax(0,1fr)] md:data-collapsed:grid-cols-[64px_minmax(0,1fr)]"
    >
      <aside
        aria-label={labels.menu}
        className={cn(
          'sticky top-0 hidden h-svh flex-col gap-2 overflow-y-auto border-r bg-sidebar text-sidebar-foreground md:flex',
          collapsed ? 'items-center px-2.5 py-[18px]' : 'px-4 py-[22px]',
        )}
      >
        <SidebarContext value={desktop}>{sidebar}</SidebarContext>
      </aside>
      <div className="flex min-w-0">
        <div className="min-w-0 flex-1">
          <div className="sticky top-0 z-20 flex min-h-16 items-center justify-between gap-4 border-b bg-card/90 px-4 py-3 backdrop-blur md:px-8">
            <div className="flex items-center gap-2 md:hidden">
              <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
                <SheetTrigger
                  render={<Button variant="ghost" size="icon" aria-label={labels.openMenu} />}
                >
                  <MenuIcon />
                </SheetTrigger>
                <SheetContent
                  side="left"
                  closeLabel={labels.closeMenu}
                  className="w-72 gap-2 bg-sidebar px-4 py-[22px] text-sidebar-foreground"
                >
                  <SheetTitle className="sr-only">{labels.menu}</SheetTitle>
                  <SidebarContext value={drawer}>{sidebar}</SidebarContext>
                </SheetContent>
              </Sheet>
              {mobileBrand}
            </div>
            <div className="ml-auto flex items-center gap-4">{topbar}</div>
          </div>
          <main id="main" tabIndex={-1} className="px-4 pt-6 pb-12 outline-none md:px-8">
            {children}
          </main>
        </div>
        {panel ? (
          <aside
            id={panel.id}
            aria-label={panel.label}
            data-open={panel.open || undefined}
            inert={!panel.open}
            ref={panelRef}
            className="invisible fixed inset-0 z-40 translate-x-full bg-card transition-[transform,visibility] duration-200 ease-out data-open:visible data-open:translate-x-0 data-open:transition-transform motion-reduce:transition-none md:sticky md:inset-auto md:top-0 md:z-auto md:h-svh md:w-0 md:shrink-0 md:translate-x-0 md:overflow-hidden md:transition-[width,visibility] md:data-open:transition-[width] md:data-open:border-l md:data-open:w-[400px]"
          >
            <div className="flex h-full w-full flex-col md:w-[400px]">{panel.content}</div>
          </aside>
        ) : null}
      </div>
    </div>
  )
}

/** Brand row of the sidebar: the brand and the collapse toggle. */
function SidebarHeader({
  brand,
  icon,
  labels,
}: {
  brand: React.ReactNode
  /** Shown instead of the brand in the icon rail. */
  icon: React.ReactNode
  labels: { collapse: string; expand: string }
}) {
  const { collapsed, mobile, toggle } = useSidebar()
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-2 pb-4',
        collapsed ? 'flex-col' : 'pl-2',
        mobile && 'pr-10',
      )}
    >
      {collapsed ? icon : brand}
      {mobile ? null : (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-label={collapsed ? labels.expand : labels.collapse}
          title={collapsed ? labels.expand : labels.collapse}
          className="text-muted-foreground"
        >
          <PanelLeftIcon />
        </Button>
      )}
    </div>
  )
}

function SidebarNav({ className, ...props }: React.ComponentProps<'nav'>) {
  return (
    <nav
      data-slot="sidebar-nav"
      className={cn('flex w-full flex-col gap-0.5 border-b pb-3.5', className)}
      {...props}
    />
  )
}

const itemClass =
  "relative flex w-full items-center gap-3 rounded-[10px] px-2.5 py-2 text-[0.92rem] whitespace-nowrap text-sidebar-foreground hover:bg-sidebar-accent aria-[current=page]:bg-sidebar-accent aria-[current=page]:font-medium aria-[current=page]:before:absolute aria-[current=page]:before:inset-y-2 aria-[current=page]:before:left-0 aria-[current=page]:before:w-[3px] aria-[current=page]:before:rounded-r-[3px] aria-[current=page]:before:bg-highlight aria-[current=page]:before:content-[''] [&_svg]:size-[18px] [&_svg]:shrink-0"

/**
 * A navigation entry; `render` takes the router's link (which sets `aria-current="page"`). In the
 * icon rail the label is hidden and shown as a tooltip; it stays the accessible name.
 */
function SidebarNavItem({
  icon,
  label,
  render,
  action,
}: {
  icon: React.ReactNode
  label: string
  render: useRender.RenderProp
  /** A shortcut shown at the end of the line ("+"), hidden in the icon rail. */
  action?: React.ReactNode
}) {
  const { collapsed, close } = useSidebar()
  const link = useRender({
    defaultTagName: 'a',
    render,
    props: {
      className: cn(
        itemClass,
        collapsed && 'justify-center p-2.5',
        action && !collapsed && 'pr-11',
      ),
      onClick: close,
      children: (
        <>
          {icon}
          <span className={collapsed ? 'sr-only' : 'truncate'}>{label}</span>
        </>
      ),
    },
  })
  if (collapsed)
    return (
      <Tooltip>
        <TooltipTrigger render={link} />
        <TooltipContent side="right">{label}</TooltipContent>
      </Tooltip>
    )
  return (
    <div className="relative">
      {link}
      {action ? <div className="absolute top-1/2 right-1.5 -translate-y-1/2">{action}</div> : null}
    </div>
  )
}

/** Bottom of the sidebar (account). */
function SidebarFooter({ className, ...props }: React.ComponentProps<'div'>) {
  const { collapsed } = useSidebar()
  return (
    <div
      data-slot="sidebar-footer"
      className={cn(
        'mt-auto w-full border-t pt-3.5 text-sm',
        collapsed && 'flex justify-center',
        className,
      )}
      {...props}
    />
  )
}

export { AppShell, SidebarFooter, SidebarHeader, SidebarNav, SidebarNavItem, useSidebar }
