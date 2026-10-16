import { useRef } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';

function highlight(text: string): ReactNode[] {
    return text
        .split(/(%[^\n]*|\\[a-zA-Z@]+\*?|\\[^\n]|[{}[\]$&])/g)
        .map((part, index) => {
            const kind = part.startsWith('%')
                ? 'comment'
                : part.startsWith('\\')
                  ? 'command'
                  : /^[{}[\]$&]$/.test(part)
                    ? 'bracket'
                    : '';
            return kind ? (
                <span className={`syntax-${kind}`} key={index}>
                    {part}
                </span>
            ) : (
                part
            );
        });
}

export function CodeEditor({
    value,
    onChange,
    disabled,
    onCursor,
}: {
    value: string;
    onChange: (value: string) => void;
    disabled: boolean;
    onCursor: (line: number, column: number) => void;
}) {
    const input = useRef<HTMLTextAreaElement>(null);
    const highlighted = useRef<HTMLPreElement>(null);
    const lines = useRef<HTMLDivElement>(null);
    function cursor() {
        const start = input.current?.selectionStart ?? 0;
        const before = value.slice(0, start).split('\n');
        onCursor(before.length, (before.at(-1)?.length ?? 0) + 1);
    }
    function keyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
        if (event.key === 'Tab' && !event.shiftKey) {
            event.preventDefault();
            const target = event.currentTarget;
            const start = target.selectionStart;
            onChange(
                value.slice(0, start) +
                    '    ' +
                    value.slice(target.selectionEnd),
            );
            requestAnimationFrame(() => {
                target.selectionStart = target.selectionEnd = start + 4;
            });
        }
    }
    return (
        <div className="code-editor">
            <div className="line-number-viewport" aria-hidden="true">
                <div ref={lines}>
                    {Array.from(
                        { length: value.split('\n').length },
                        (_, i) => (
                            <div key={i}>{i + 1}</div>
                        ),
                    )}
                </div>
            </div>
            <div className="code-input-area">
                <pre
                    ref={highlighted}
                    aria-hidden="true"
                    className="code-highlight"
                >
                    {highlight(value)}
                    {'\n'}
                </pre>
                <textarea
                    ref={input}
                    aria-label="Исходный код"
                    value={value}
                    disabled={disabled}
                    onChange={(e) => onChange(e.target.value)}
                    onSelect={cursor}
                    onKeyDown={keyDown}
                    onScroll={(e) => {
                        if (highlighted.current) {
                            highlighted.current.scrollTop =
                                e.currentTarget.scrollTop;
                            highlighted.current.scrollLeft =
                                e.currentTarget.scrollLeft;
                        }
                        if (lines.current)
                            lines.current.style.transform = `translateY(-${e.currentTarget.scrollTop}px)`;
                    }}
                    spellCheck={false}
                    autoCapitalize="off"
                    autoComplete="off"
                    autoCorrect="off"
                    wrap="off"
                />
            </div>
        </div>
    );
}
