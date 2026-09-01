import { useMemo, useRef, useState, type KeyboardEvent } from "react"
import { CheckIcon, LoaderCircleIcon, WandSparklesIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  highlightHtmlTemplate,
  type HtmlHighlightKind,
} from "@/lib/html-template-highlight"
import { cn } from "@/lib/utils"

interface HtmlTemplateEditorProps {
  value: string
  onChange: (value: string) => void
  className?: string
}

const TOKEN_CLASSES: Record<HtmlHighlightKind, string> = {
  plain: "text-zinc-300",
  comment: "text-zinc-500 italic",
  doctype: "text-violet-400",
  punctuation: "text-zinc-500",
  tag: "text-rose-400",
  attribute: "text-amber-300",
  string: "text-emerald-400",
  "css-selector": "text-sky-300",
  "css-property": "text-cyan-300",
  "css-value": "text-orange-300",
  number: "text-violet-300",
  placeholder: "rounded-sm bg-fuchsia-400/10 text-fuchsia-300",
}

export function HtmlTemplateEditor({
  value,
  onChange,
  className,
}: HtmlTemplateEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const highlightRef = useRef<HTMLPreElement>(null)
  const [formatting, setFormatting] = useState(false)
  const [formatted, setFormatted] = useState(false)
  const tokens = useMemo(() => highlightHtmlTemplate(value), [value])

  const syncScroll = () => {
    if (!textareaRef.current || !highlightRef.current) return
    highlightRef.current.scrollTop = textareaRef.current.scrollTop
    highlightRef.current.scrollLeft = textareaRef.current.scrollLeft
  }

  const formatSource = async () => {
    if (formatting) return
    setFormatting(true)
    setFormatted(false)

    try {
      const [{ format }, htmlPlugin] = await Promise.all([
        import("prettier/standalone"),
        import("prettier/plugins/html"),
      ])
      const nextValue = await format(value, {
        parser: "html",
        plugins: [htmlPlugin.default],
        printWidth: 100,
        tabWidth: 2,
        useTabs: false,
      })
      onChange(nextValue)
      setFormatted(true)
      window.setTimeout(() => setFormatted(false), 1600)
    } catch (error) {
      toast.error(
        error instanceof Error
          ? `Could not format HTML: ${error.message}`
          : "Could not format HTML."
      )
    } finally {
      setFormatting(false)
    }
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const formatShortcut =
      (event.altKey && event.shiftKey && event.key.toLowerCase() === "f") ||
      ((event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === "f")

    if (formatShortcut) {
      event.preventDefault()
      void formatSource()
      return
    }

    if (event.key !== "Tab") return
    event.preventDefault()

    const textarea = event.currentTarget
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const nextValue = `${value.slice(0, start)}  ${value.slice(end)}`
    onChange(nextValue)

    window.requestAnimationFrame(() => {
      textarea.selectionStart = textarea.selectionEnd = start + 2
    })
  }

  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-input bg-[#111318] focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50",
        className
      )}
    >
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-white/8 bg-white/[0.025] px-2.5">
        <span className="font-mono text-[0.625rem] font-medium tracking-wide text-zinc-500">
          HTML + CSS
        </span>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={() => void formatSource()}
          disabled={formatting}
          title="Format document (Shift+Alt+F)"
          className="text-zinc-400 hover:bg-white/8 hover:text-zinc-100"
        >
          {formatting ? (
            <LoaderCircleIcon className="animate-spin" />
          ) : formatted ? (
            <CheckIcon />
          ) : (
            <WandSparklesIcon />
          )}
          {formatted ? "Formatted" : "Format"}
        </Button>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <pre
          ref={highlightRef}
          aria-hidden="true"
          className="tab-size-2 pointer-events-none absolute inset-0 overflow-hidden p-3 font-mono text-[0.6875rem] leading-[1.65] whitespace-pre"
        >
          {tokens.map((token, index) => (
            <span
              className={TOKEN_CLASSES[token.kind]}
              key={`${index}-${token.kind}`}
            >
              {token.text}
            </span>
          ))}
          {value.endsWith("\n") ? "\n" : null}
        </pre>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          onScroll={syncScroll}
          onSelect={syncScroll}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          wrap="off"
          aria-label="HTML lower-third source"
          className="tab-size-2 absolute inset-0 size-full resize-none overflow-auto border-0 bg-transparent p-3 font-mono text-[0.6875rem] leading-[1.65] whitespace-pre text-transparent caret-white outline-none selection:bg-sky-500/35"
          style={{ WebkitTextFillColor: "transparent" }}
        />
      </div>
    </div>
  )
}
