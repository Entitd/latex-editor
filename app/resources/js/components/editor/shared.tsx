import { ArrowUpRight, HardDrive, LoaderCircle } from 'lucide-react';
import type { FormEvent, ReactNode } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
} from '@/components/ui/dialog';
import '../../../css/editor.css';

export function Brand({ onNavigate }: { onNavigate?: () => boolean } = {}) {
    return (
        <a
            onClick={(event) => {
                if (onNavigate && !onNavigate()) event.preventDefault();
            }}
            className="tex-brand"
            href="/projects"
            aria-label="TeX Local — проекты"
        >
            <span className="tex-mark">
                T<span>E</span>X
            </span>
            <span>
                TeX Local
                <span className="tex-brand-caption">ВАШЕ МЕСТО ДЛЯ МЫСЛЕЙ</span>
            </span>
        </a>
    );
}

export function LocalBadge() {
    return (
        <span className="local-badge">
            <span className="status-dot" /> Локальное пространство
        </span>
    );
}

export function ProjectModal({
    title,
    description,
    open,
    onClose,
    onSubmit,
    busy,
    error,
    children,
    submitLabel = 'Сохранить',
}: {
    title: string;
    description: string;
    open: boolean;
    onClose: () => void;
    onSubmit: (event: FormEvent<HTMLFormElement>) => void;
    busy: boolean;
    error: string;
    children: ReactNode;
    submitLabel?: string;
}) {
    return (
        <Dialog
            open={open}
            onOpenChange={(value) => {
                if (!value && !busy) onClose();
            }}
        >
            <DialogContent className="tex-dialog">
                <DialogTitle>{title}</DialogTitle>
                <DialogDescription>{description}</DialogDescription>
                <form onSubmit={onSubmit} className="tex-form">
                    {children}
                    {error && (
                        <p role="alert" className="form-error">
                            {error}
                        </p>
                    )}
                    <div className="dialog-actions">
                        <button
                            type="button"
                            className="tex-button secondary"
                            onClick={onClose}
                            disabled={busy}
                        >
                            Отмена
                        </button>
                        <button className="tex-button primary" disabled={busy}>
                            {busy && (
                                <LoaderCircle className="spin" size={16} />
                            )}
                            {submitLabel}
                        </button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}

export function WorkspaceFooter() {
    return (
        <footer className="workspace-footer">
            <span>
                <HardDrive size={14} /> Файлы хранятся на вашем компьютере
            </span>
            <span>
                Меньше настроек. Больше текста. <ArrowUpRight size={14} />
            </span>
        </footer>
    );
}
