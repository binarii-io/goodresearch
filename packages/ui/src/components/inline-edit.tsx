import { cn } from '@goodresearch/ui/lib/utils'
import { type KeyboardEvent, type ReactNode, useEffect, useId, useRef, useState } from 'react'

export type InlineEditProps = {
  /** Current saved value. */
  value: string
  /** Accessible name of the field, e.g. "Project name". */
  label: string
  /** Saves the new value; reject (throw) to keep the field open and show `error`. */
  onSave: (next: string) => Promise<void> | void
  multiline?: boolean
  maxLength?: number
  /** Shown instead of the value when it is empty. */
  placeholder?: string
  /** Announced to screen readers after a successful save. */
  savedMessage: string
  /** Hint shown while editing, e.g. "Enter to save, Escape to cancel". */
  editHint: string
  /** Validation or server error to show under the field. */
  error?: string | undefined
  /** Custom rendering of the displayed value. */
  renderValue?: (value: string) => ReactNode
  className?: string
}

/**
 * Text shown as a button; activating it turns it into a field. Enter (Ctrl/Cmd+Enter when multiline)
 * or leaving the field saves, Escape cancels and returns focus to the button (FR-019, WCAG 2.2 AA).
 */
export function InlineEdit({
  value,
  label,
  onSave,
  multiline = false,
  maxLength,
  placeholder,
  savedMessage,
  editHint,
  error,
  renderValue,
  className,
}: InlineEditProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [saving, setSaving] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const fieldRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const cancelled = useRef(false)
  const hintId = useId()
  const errorId = useId()

  useEffect(() => {
    if (editing) fieldRef.current?.focus()
  }, [editing])

  useEffect(() => {
    if (!editing) setDraft(value)
  }, [value, editing])

  const close = () => {
    setEditing(false)
    requestAnimationFrame(() => buttonRef.current?.focus())
  }

  const save = async () => {
    if (cancelled.current) {
      cancelled.current = false
      return
    }
    if (draft === value) return close()
    setSaving(true)
    try {
      await onSave(draft)
      setAnnouncement(savedMessage)
      close()
    } catch {
      // The caller shows the error through `error`; keep the field open.
    } finally {
      setSaving(false)
    }
  }

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      cancelled.current = true
      setDraft(value)
      close()
    } else if (event.key === 'Enter' && (!multiline || event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      void save()
    }
  }

  const fieldClass =
    'w-full rounded-md border border-input bg-background px-3 py-2 text-base outline-none focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive'

  return (
    <div className={cn('grid gap-1', className)}>
      {editing ? (
        <>
          {multiline ? (
            <textarea
              ref={fieldRef}
              aria-label={label}
              aria-describedby={error ? `${hintId} ${errorId}` : hintId}
              aria-invalid={error ? true : undefined}
              className={cn(fieldClass, 'min-h-32 whitespace-pre-wrap')}
              value={draft}
              maxLength={maxLength}
              disabled={saving}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              onBlur={() => void save()}
            />
          ) : (
            <input
              ref={fieldRef}
              aria-label={label}
              aria-describedby={error ? `${hintId} ${errorId}` : hintId}
              aria-invalid={error ? true : undefined}
              className={fieldClass}
              value={draft}
              maxLength={maxLength}
              disabled={saving}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              onBlur={() => void save()}
            />
          )}
          <p id={hintId} className="text-muted-foreground text-sm">
            {editHint}
          </p>
        </>
      ) : (
        <button
          ref={buttonRef}
          type="button"
          aria-label={`${label}: ${value || placeholder || ''}`}
          className="-mx-2 rounded-md px-2 py-1 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          onClick={() => setEditing(true)}
        >
          {value ? (
            (renderValue?.(value) ?? (
              <span className={cn(multiline && 'whitespace-pre-wrap')}>{value}</span>
            ))
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
        </button>
      )}
      {error ? (
        <p id={errorId} role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
      <span className="sr-only" aria-live="polite">
        {announcement}
      </span>
    </div>
  )
}
