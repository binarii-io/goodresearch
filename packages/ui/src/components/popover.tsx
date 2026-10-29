'use client'

import { Popover as PopoverPrimitive } from '@base-ui/react/popover'
import { cn } from 'cn'

function Popover({ ...props }: PopoverPrimitive.Root.Props) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />
}

/**
 * A small floating panel, opened by its caller (no trigger). `anchor` places it next to an element
 * or a virtual one, such as a text selection (`{ getBoundingClientRect }`).
 */
function PopoverContent({
  className,
  anchor,
  side = 'bottom',
  sideOffset = 6,
  align = 'center',
  alignOffset = 0,
  children,
  ...props
}: PopoverPrimitive.Popup.Props &
  Pick<
    PopoverPrimitive.Positioner.Props,
    'anchor' | 'align' | 'alignOffset' | 'side' | 'sideOffset'
  >) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner
        anchor={anchor}
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        className="isolate z-50"
      >
        <PopoverPrimitive.Popup
          data-slot="popover-content"
          className={cn(
            'z-50 grid w-80 max-w-[calc(100vw-2rem)] origin-(--transform-origin) gap-2 rounded-lg border bg-popover p-3 text-popover-foreground text-sm shadow-dialog outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95',
            className,
          )}
          {...props}
        >
          {children}
        </PopoverPrimitive.Popup>
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  )
}

function PopoverTitle({ className, ...props }: PopoverPrimitive.Title.Props) {
  return (
    <PopoverPrimitive.Title
      data-slot="popover-title"
      className={cn('font-medium text-sm', className)}
      {...props}
    />
  )
}

export { Popover, PopoverContent, PopoverTitle }
