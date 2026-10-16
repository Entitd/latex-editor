import { Head } from '@inertiajs/react';
import {
    ArrowDownAZ,
    ArrowUpRight,
    FileText,
    FolderOpen,
    Plus,
    Search,
    X,
} from 'lucide-react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import {
    Brand,
    LocalBadge,
    ProjectModal,
    WorkspaceFooter,
} from '@/components/editor/shared';
import { api, errorMessage, projectUrl } from '@/lib/editor-api';
import type { ProjectSummary } from '@/lib/editor-api';

export default function Projects({ projects }: { projects: ProjectSummary[] }) {
    const [search, setSearch] = useState('');
    const [descending, setDescending] = useState(false);
    const [creating, setCreating] = useState(false);
    const [name, setName] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const visible = projects
        .filter((p) =>
            p.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
        )
        .sort(
            (a, b) =>
                a.name.localeCompare(b.name, 'ru') * (descending ? -1 : 1),
        );

    async function create(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setBusy(true);
        setError('');
        try {
            const project = await api<ProjectSummary>('/projects', 'POST', {
                name,
            });
            window.location.assign(projectUrl(project.name));
        } catch (e) {
            setError(errorMessage(e));
            setBusy(false);
        }
    }

    return (
        <div className="tex-app library-app">
            <Head title="Мои проекты" />
            <header className="library-header">
                <Brand />
                <LocalBadge />
            </header>
            <main className="library-main">
                <section className="library-intro">
                    <div>
                        <p className="eyebrow">ВАША ЛОКАЛЬНАЯ БИБЛИОТЕКА</p>
                        <h1>
                            Большие идеи.
                            <br />
                            <span>С чистого листа.</span>
                        </h1>
                        <p className="intro-description">
                            Пишите, собирайте и храните LaTeX-проекты.
                            <br />В привычном браузере, на своём компьютере.
                        </p>
                    </div>
                    <div className="paper-illustration" aria-hidden="true">
                        <div className="illustration-back" />
                        <div className="illustration-paper">
                            <span className="paper-label">
                                THE NEXT GREAT IDEA
                            </span>
                            <div className="paper-heading">
                                Всё начинается
                                <br />с одной мысли.
                            </div>
                            <div className="paper-rule" />
                            <div className="paper-lines" />
                            <span className="paper-formula">
                                e<sup>iπ</sup> + 1 = 0
                            </span>
                            <span className="paper-number">01 — ∞</span>
                        </div>
                        <span className="illustration-caption">
                            СОСРЕДОТОЧЬТЕСЬ НА СОДЕРЖАНИИ
                        </span>
                    </div>
                </section>
                <section className="project-section">
                    <div className="section-heading">
                        <div className="section-title">
                            <h2>Мои проекты</h2>
                            <span className="count-badge">
                                {projects.length}
                            </span>
                        </div>
                        <button
                            className="tex-button primary"
                            onClick={() => {
                                setName('');
                                setError('');
                                setCreating(true);
                            }}
                        >
                            <Plus size={17} /> Новый проект
                        </button>
                    </div>
                    <div className="library-toolbar">
                        <div className="search-field">
                            <Search size={17} />
                            <input
                                aria-label="Поиск проектов"
                                placeholder="Найти проект…"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                            {search && (
                                <button
                                    className="icon-button"
                                    aria-label="Очистить поиск"
                                    onClick={() => setSearch('')}
                                >
                                    <X size={14} />
                                </button>
                            )}
                        </div>
                        <button
                            className="tex-button text-button"
                            onClick={() => setDescending(!descending)}
                        >
                            <ArrowDownAZ size={17} />
                            {descending ? 'От Я до А' : 'По названию'}
                        </button>
                    </div>
                    {visible.length > 0 ? (
                        <div className="project-grid">
                            {visible.map((project, index) => (
                                <a
                                    className="project-card"
                                    key={project.name}
                                    href={projectUrl(project.name)}
                                >
                                    <div
                                        className={`project-preview preview-${index % 3}`}
                                    >
                                        <div className="mini-page">
                                            <span className="mini-tex">
                                                T<span>E</span>X
                                            </span>
                                            <div />
                                            <div />
                                            <div />
                                            <div />
                                        </div>
                                        <span className="preview-type">
                                            LATEX PROJECT
                                        </span>
                                        <span className="project-open">
                                            <ArrowUpRight size={18} />
                                        </span>
                                    </div>
                                    <div className="project-card-info">
                                        <span className="project-file-icon">
                                            <FileText size={19} />
                                        </span>
                                        <div>
                                            <h3>{project.name}</h3>
                                            <p>Локальный проект</p>
                                        </div>
                                        <ArrowUpRight
                                            className="card-arrow"
                                            size={17}
                                        />
                                    </div>
                                </a>
                            ))}
                            <button
                                className="new-project-card"
                                onClick={() => {
                                    setName('');
                                    setError('');
                                    setCreating(true);
                                }}
                            >
                                <span>
                                    <Plus size={23} />
                                </span>
                                <strong>Новая история</strong>
                                <small>Создать LaTeX-проект</small>
                            </button>
                        </div>
                    ) : (
                        <div className="library-empty">
                            <FolderOpen size={34} />
                            <h3>
                                {search
                                    ? 'Ничего не нашлось'
                                    : 'Здесь начнётся ваш первый проект'}
                            </h3>
                            <p>
                                {search
                                    ? 'Попробуйте другое название.'
                                    : 'Создайте проект — начальный main.tex уже будет внутри.'}
                            </p>
                            {!search && (
                                <button
                                    className="tex-button primary"
                                    onClick={() => setCreating(true)}
                                >
                                    <Plus size={16} /> Создать проект
                                </button>
                            )}
                        </div>
                    )}
                </section>
            </main>
            <WorkspaceFooter />
            <ProjectModal
                title="Новый проект"
                description="Начнём с названия. Файл main.tex создадим за вас."
                open={creating}
                onClose={() => setCreating(false)}
                onSubmit={(event) => void create(event)}
                busy={busy}
                error={error}
                submitLabel="Создать проект"
            >
                <label>
                    Название проекта
                    <input
                        autoFocus
                        required
                        maxLength={100}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Например, Дипломная работа"
                    />
                </label>
                <p className="field-hint">
                    Проект будет сохранён в папке workspace на вашем компьютере.
                </p>
            </ProjectModal>
        </div>
    );
}
