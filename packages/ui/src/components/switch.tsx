import { Switch as SwitchPrimitive } from '@base-ui/react/switch'
import { cn } from 'cn'

/** An on/off control that acts at once (a checkbox waits for a form to be sent). */
function Switch({ className, ...props }: SwitchPrimitive.Root.Props) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        'peer relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-transparent bg-input transition-colors after:absolute after:-inset-x-2 after:-inset-y-2.5 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-highlight/50 disabled:cursor-not-allowed disabled:opacity-50 data-checked:bg-primary dark:bg-input/60 dark:data-checked:bg-primary',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block size-4 translate-x-0.5 rounded-full bg-background shadow-sm ring-0 transition-transform data-checked:translate-x-4"
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
