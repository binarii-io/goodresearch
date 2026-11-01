import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip'

/** A figure and what it is made of, on hover and keyboard focus, named for assistive technology. */
function Breakdown({ text, lines }: { text: string; lines: readonly string[] }) {
  if (lines.length === 0) return <span>{text}</span>
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={`${text} (${lines.join(', ')})`}
            className="relative z-10 cursor-help underline decoration-dotted underline-offset-3"
          />
        }
      >
        {text}
      </TooltipTrigger>
      <TooltipContent side="top" className="grid gap-0.5 text-left">
        {lines.map((line) => (
          <span key={line}>{line}</span>
        ))}
      </TooltipContent>
    </Tooltip>
  )
}

export { Breakdown }
