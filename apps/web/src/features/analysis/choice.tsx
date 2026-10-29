import { Label } from '@goodresearch/ui/components/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@goodresearch/ui/components/select'
import { useId } from 'react'

/** A labelled select of the Analysis filters and dialogs. */
export function Choice({
  label,
  value,
  options,
  onChange,
  className = 'w-44',
}: {
  label: string
  value: string
  options: readonly { value: string; label: string }[]
  onChange: (value: string) => void
  className?: string
}) {
  const id = useId()
  return (
    <div className="grid gap-1">
      <Label htmlFor={id} className="text-muted-foreground text-xs">
        {label}
      </Label>
      <Select value={value} onValueChange={(v) => onChange(String(v))}>
        <SelectTrigger id={id} className={className}>
          <SelectValue>{(v: string) => options.find((o) => o.value === v)?.label ?? v}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
