import { Head } from '@inertiajs/react';
import {
    ArrowLeft,
    Check,
    ChevronRight,
    CircleAlert,
    Download,
    FileCode2,
    FilePlus2,
    FileText,
    FolderPlus,
    HardDrive,
    LoaderCircle,
    PanelLeftClose,
    PanelLeftOpen,
    Play,
    Save,
    Settings2,
    Star,
    Terminal,
    X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { toast } from 'sonner';
import { CodeEditor } from '@/components/editor/code-editor';
import { FileTree } from '@/components/editor/file-tree';
import { Brand, LocalBadge, ProjectModal } from '@/components/editor/shared';
import { api, errorMessage, projectUrl } from '@/lib/editor-api';
import type { Build, Project, ProjectFile } from '@/lib/editor-api';

type Modal = 'file' | 'directory' | 'rename' | 'settings' | null;

export default function Editor({
    project: initialProject,
}: {
    project: Project;
}) {
    const [project, setProject] = useState(initialProject);
    const initialPath = initialProject.files.some(
        (file) => file.path === initialProject.settings.main_file,
    )
        ? initialProject.settings.main_file
        : (initialProject.files.find(
              (file) => file.type === 'file' && file.path.endsWith('.tex'),
          )?.path ?? '');
    const [selected, setSelected] = useState(initialPath);
    const [content, setContent] = useState('');
    const [savedContent, setSavedContent] = useState('');
    const [loading, setLoading] = useState(Boolean(initialPath));
    const [operation, setOperation] = useState<
        'save' | 'compile' | 'mutation' | null
    >(null);
    const [fileError, setFileError] = useState('');
    const [build, setBuild] = useState<Build | null>(null);
    const [pdfUrl, setPdfUrl] = useState<string | null>(null);
    const [logs, setLogs] = useState(false);
    const [sidebar, setSidebar] = useState(
        () => typeof window === 'undefined' || window.innerWidth > 600,
    );
    const [mobilePane, setMobilePane] = useState('source');
    const [cursor, setCursor] = useState([1, 1]);
    const [modal, setModal] = useState<Modal>(null);
    const [field, setField] = useState('');
    const [target, setTarget] = useState<ProjectFile | null>(null);
    const [engine, setEngine] = useState(project.settings.engine);
    const [mainFile, setMainFile] = useState(project.settings.main_file);
    const [modalError, setModalError] = useState('');
    const [destination, setDestination] = useState<string | null>(null);
    const dirty = Boolean(selected) && content !== savedContent;
    const busy = operation !== null || loading;
    const baseUrl = projectUrl(project.name);
    const initialUrl = projectUrl(initialProject.name);

    useEffect(() => {
        if (!initialPath) return;
        let active = true;
        void api<{ content: string }>(
            `${initialUrl}/files?path=${encodeURIComponent(initialPath)}`,
        )
            .then((file) => {
                if (active) {
                    setContent(file.content);
                    setSavedContent(file.content);
                }
            })
            .catch((error: unknown) => {
                if (active) setFileError(errorMessage(error));
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, [initialUrl, initialPath]);

    useEffect(() => {
        if (!dirty) return;
        function preventClose(event: BeforeUnloadEvent) {
            event.preventDefault();
        }
        window.addEventListener('beforeunload', preventClose);
        return () => window.removeEventListener('beforeunload', preventClose);
    }, [dirty]);

    useEffect(() => {
        if (destination && !dirty) window.location.assign(destination);
    }, [destination, dirty]);

    function canDiscard() {
        return (
            !dirty ||
            window.confirm(
                'В файле есть несохранённые изменения. Продолжить без сохранения?',
            )
        );
    }

    async function refresh() {
        const updated = await api<Project>(baseUrl);
        setProject(updated);
    }

    async function openFile(path: string) {
        if (busy || (path !== selected && !canDiscard())) return;
        setLoading(true);
        setFileError('');
        try {
            const file = await api<{ content: string }>(
                `${baseUrl}/files?path=${encodeURIComponent(path)}`,
            );
            setSelected(path);
            setContent(file.content);
            setSavedContent(file.content);
            setCursor([1, 1]);
        } catch (error) {
            setFileError(errorMessage(error));
        } finally {
            setLoading(false);
        }
    }

    async function setMainDocument(path: string) {
        if (busy) return;
        setOperation('mutation');
        try {
            const updated = await api<{ settings: Project['settings'] }>(
                baseUrl,
                'PATCH',
                { main_file: path },
            );
            setProject((previous) => ({
                ...previous,
                settings: updated.settings,
            }));
            setMainFile(updated.settings.main_file);
            toast.success(`Главный документ: ${path}`);
        } catch (error) {
            toast.error(errorMessage(error));
        } finally {
            setOperation(null);
        }
    }

    async function saveFile() {
        if (!selected || busy || fileError) return;
        setOperation('save');
        try {
            await api(`${baseUrl}/files`, 'PUT', { path: selected, content });
            setSavedContent(content);
            toast.success('Файл сохранён');
        } catch (error) {
            toast.error(errorMessage(error));
        } finally {
            setOperation(null);
        }
    }

    async function compile() {
        if (busy) return;
        setOperation('compile');
        try {
            if (dirty) {
                await api(`${baseUrl}/files`, 'PUT', {
                    path: selected,
                    content,
                });
                setSavedContent(content);
            }
            const result = await api<Build>(`${baseUrl}/compilations`, 'POST');
            setBuild(result);
            await refresh();
            if (result.status === 'success' && result.pdf_url) {
                setPdfUrl(result.pdf_url);
                setLogs(false);
                toast.success('Документ собран');
            } else {
                setLogs(true);
                toast.error(
                    result.status === 'timeout'
                        ? 'Превышено время компиляции'
                        : 'Ошибка компиляции. Подробности в журнале.',
                );
            }
        } catch (error) {
            toast.error(errorMessage(error));
        } finally {
            setOperation(null);
        }
    }

    function openModal(kind: Modal, file?: ProjectFile) {
        setModal(kind);
        setModalError('');
        setTarget(file ?? null);
        setField(kind === 'settings' ? project.name : (file?.path ?? ''));
        setEngine(project.settings.engine);
        setMainFile(project.settings.main_file);
    }

    async function mutate(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setOperation('mutation');
        setModalError('');
        try {
            if (modal === 'settings') {
                if (dirty && field !== project.name && !canDiscard()) {
                    setOperation(null);
                    return;
                }
                const updated = await api<{ name: string }>(baseUrl, 'PATCH', {
                    name: field,
                    engine,
                    main_file: mainFile,
                });
                if (updated.name !== project.name) {
                    setSavedContent(content);
                    setDestination(projectUrl(updated.name));
                    return;
                }
                await refresh();
            } else if (modal === 'rename' && target) {
                if (dirty) {
                    setModalError('Сначала сохраните открытый файл.');
                    setOperation(null);
                    return;
                }
                await api(`${baseUrl}/files`, 'PATCH', {
                    path: target.path,
                    new_path: field,
                });
                if (
                    selected === target.path ||
                    selected.startsWith(`${target.path}/`)
                )
                    setSelected(field + selected.slice(target.path.length));
                await refresh();
            } else {
                await api(`${baseUrl}/files`, 'POST', {
                    path: field,
                    type: modal === 'directory' ? 'directory' : 'file',
                    content: '',
                });
                await refresh();
            }
            setModal(null);
            toast.success('Изменения сохранены');
        } catch (error) {
            setModalError(errorMessage(error));
        } finally {
            setOperation(null);
        }
    }

    async function deleteFile(file: ProjectFile) {
        if (
            !canDiscard() ||
            !window.confirm(
                `Удалить ${file.type === 'directory' ? 'папку со всем содержимым' : 'файл'} «${file.path}»?`,
            )
        )
            return;
        setOperation('mutation');
        try {
            await api(`${baseUrl}/files`, 'DELETE', { path: file.path });
            if (
                selected === file.path ||
                selected.startsWith(`${file.path}/`)
            ) {
                setSelected('');
                setContent('');
                setSavedContent('');
            }
            await refresh();
            toast.success('Удалено');
        } catch (error) {
            toast.error(errorMessage(error));
        } finally {
            setOperation(null);
        }
    }

    async function deleteProject() {
        if (
            !window.confirm(
                `Удалить проект «${project.name}» и все его файлы? Это действие нельзя отменить.`,
            )
        )
            return;
        setOperation('mutation');
        try {
            await api(baseUrl, 'DELETE');
            setSavedContent(content);
            setDestination('/projects');
        } catch (error) {
            setModalError(errorMessage(error));
            setOperation(null);
        }
    }

    return (
        <div
            className="tex-app editor-app"
            onKeyDown={(event) => {
                if (
                    (event.ctrlKey || event.metaKey) &&
                    event.key.toLowerCase() === 's'
                ) {
                    event.preventDefault();
                    void saveFile();
                }
                if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                    event.preventDefault();
                    void compile();
                }
            }}
        >
            <Head title={project.name} />
            <header className="editor-header">
                <Brand onNavigate={() => !busy} />
                <div className="editor-breadcrumb">
                    <a
                        href="/projects"
                        onClick={(event) => {
                            if (busy) event.preventDefault();
                        }}
                    >
                        Мои проекты
                    </a>
                    <ChevronRight size={14} />
                    <strong>{project.name}</strong>
                </div>
                <LocalBadge />
                <a
                    className="icon-button back-projects"
                    href="/projects"
                    aria-label="К проектам"
                    onClick={(event) => {
                        if (busy) event.preventDefault();
                    }}
                >
                    <ArrowLeft size={18} />
                </a>
            </header>
            <div className="editor-toolbar">
                <div className="toolbar-project">
                    <button
                        className="icon-button"
                        aria-label={sidebar ? 'Скрыть файлы' : 'Показать файлы'}
                        onClick={() => setSidebar(!sidebar)}
                    >
                        {sidebar ? (
                            <PanelLeftClose size={18} />
                        ) : (
                            <PanelLeftOpen size={18} />
                        )}
                    </button>
                    <span className="project-title">{project.name}</span>
                    <button
                        className="icon-button"
                        aria-label="Настройки проекта"
                        disabled={busy}
                        onClick={() => openModal('settings')}
                    >
                        <Settings2 size={17} />
                    </button>
                </div>
                <div className="toolbar-actions">
                    <span className="engine-label">
                        {project.settings.engine}
                        <span>LaTeX engine</span>
                    </span>
                    <button
                        className="tex-button secondary save-button"
                        disabled={
                            busy || !selected || Boolean(fileError) || !dirty
                        }
                        onClick={() => void saveFile()}
                    >
                        {operation === 'save' ? (
                            <LoaderCircle className="spin" size={16} />
                        ) : (
                            <Save size={16} />
                        )}
                        <span>Сохранить</span>
                    </button>
                    <button
                        className="tex-button primary compile-button"
                        disabled={busy}
                        onClick={() => void compile()}
                    >
                        {operation === 'compile' ? (
                            <LoaderCircle size={16} className="spin" />
                        ) : (
                            <Play size={15} fill="currentColor" />
                        )}
                        <span>
                            {operation === 'compile'
                                ? 'Компиляция…'
                                : 'Собрать PDF'}
                        </span>
                        <kbd>⌃ ↵</kbd>
                    </button>
                </div>
            </div>
            <div className="mobile-pane-tabs">
                <button
                    className={mobilePane === 'source' ? 'active' : ''}
                    onClick={() => setMobilePane('source')}
                >
                    Исходник
                </button>
                <button
                    className={mobilePane === 'pdf' ? 'active' : ''}
                    onClick={() => setMobilePane('pdf')}
                >
                    PDF / Журнал
                </button>
            </div>
            <main
                className={`editor-workspace ${sidebar ? '' : 'sidebar-hidden'} mobile-${mobilePane}`}
            >
                {sidebar && (
                    <aside className="files-pane">
                        <div className="pane-heading">
                            <span>ФАЙЛЫ ПРОЕКТА</span>
                            <div>
                                <button
                                    className="icon-button"
                                    aria-label="Новый файл"
                                    title="Новый файл"
                                    disabled={busy}
                                    onClick={() => openModal('file')}
                                >
                                    <FilePlus2 size={16} />
                                </button>
                                <button
                                    className="icon-button"
                                    aria-label="Новая папка"
                                    title="Новая папка"
                                    disabled={busy}
                                    onClick={() => openModal('directory')}
                                >
                                    <FolderPlus size={16} />
                                </button>
                            </div>
                        </div>
                        <div className="tree-scroll">
                            <FileTree
                                files={project.files}
                                selected={selected}
                                mainFile={project.settings.main_file}
                                onSetMain={(path) => void setMainDocument(path)}
                                disabled={busy}
                                onOpen={(path) => void openFile(path)}
                                onRename={(file) => openModal('rename', file)}
                                onDelete={(file) => void deleteFile(file)}
                            />
                        </div>
                        <div className="files-footer">
                            <HardDrive size={14} />
                            <span>workspace / {project.name}</span>
                        </div>
                    </aside>
                )}
                <section className="source-pane" aria-label="Редактор">
                    <div className="source-tabs">
                        <span className="source-tab">
                            <FileCode2 size={15} />
                            <span>{selected || 'Исходник'}</span>
                            {dirty && (
                                <span
                                    className="dirty-dot"
                                    title="Есть несохранённые изменения"
                                />
                            )}
                        </span>
                        {selected.endsWith('.tex') && (
                            <button
                                className="main-document-button"
                                title={
                                    selected === project.settings.main_file
                                        ? 'Этот файл используется для компиляции'
                                        : 'Компилировать проект из этого файла'
                                }
                                disabled={
                                    busy ||
                                    selected === project.settings.main_file
                                }
                                onClick={() => void setMainDocument(selected)}
                            >
                                <Star
                                    size={12}
                                    fill={
                                        selected === project.settings.main_file
                                            ? 'currentColor'
                                            : 'none'
                                    }
                                />
                                {selected === project.settings.main_file
                                    ? 'Главный документ'
                                    : 'Сделать главным'}
                            </button>
                        )}
                    </div>
                    {fileError ? (
                        <div className="editor-empty">
                            <CircleAlert size={28} />
                            <h3>Не удалось открыть файл</h3>
                            <p role="alert">{fileError}</p>
                            <button
                                className="tex-button secondary"
                                onClick={() => {
                                    setFileError('');
                                    if (selected) void openFile(selected);
                                }}
                            >
                                Повторить
                            </button>
                        </div>
                    ) : loading ? (
                        <div className="editor-empty">
                            <LoaderCircle className="spin" size={26} />
                            <p>Открываем файл…</p>
                        </div>
                    ) : selected ? (
                        <CodeEditor
                            key={selected}
                            value={content}
                            onChange={setContent}
                            disabled={operation !== null}
                            onCursor={(line, column) =>
                                setCursor([line, column])
                            }
                        />
                    ) : (
                        <div className="editor-empty">
                            <FileCode2 size={30} />
                            <h3>Выберите файл</h3>
                            <p>
                                Откройте документ в дереве слева
                                <br />
                                или создайте новый файл.
                            </p>
                        </div>
                    )}
                    <div className="source-status">
                        <span>
                            {operation === 'save' ? (
                                'Сохраняем…'
                            ) : dirty ? (
                                'Есть изменения'
                            ) : (
                                <>
                                    <Check size={12} /> Сохранено
                                </>
                            )}
                        </span>
                        <span>
                            Стр {cursor[0]}, стлб {cursor[1]}
                            <i />
                            UTF-8
                        </span>
                    </div>
                </section>
                <section className="preview-pane" aria-label="Предпросмотр PDF">
                    <div className="preview-toolbar">
                        <div className="preview-switch">
                            <button
                                className={!logs ? 'active' : ''}
                                onClick={() => setLogs(false)}
                            >
                                <FileText size={14} /> PDF
                            </button>
                            <button
                                className={logs ? 'active' : ''}
                                onClick={() => setLogs(true)}
                            >
                                <Terminal size={14} /> Журнал
                                {build && build.status !== 'success' && (
                                    <span className="log-error-dot" />
                                )}
                            </button>
                        </div>
                        {pdfUrl && (
                            <a
                                className="icon-button"
                                href={pdfUrl}
                                download={`${project.name}.pdf`}
                                title="Скачать PDF"
                                aria-label="Скачать PDF"
                            >
                                <Download size={16} />
                            </a>
                        )}
                    </div>
                    <div className="preview-content">
                        {logs ? (
                            <div className="build-log">
                                <div className="log-heading">
                                    <span
                                        className={`build-status ${build?.status ?? ''}`}
                                    >
                                        {operation === 'compile'
                                            ? 'Сборка выполняется'
                                            : build?.status === 'success'
                                              ? 'Сборка завершена'
                                              : build?.status === 'timeout'
                                                ? 'Превышено время ожидания'
                                                : build
                                                  ? 'Ошибка сборки'
                                                  : 'Журнал компиляции'}
                                    </span>
                                    <button
                                        className="icon-button"
                                        aria-label="Закрыть журнал"
                                        onClick={() => setLogs(false)}
                                    >
                                        <X size={15} />
                                    </button>
                                </div>
                                <pre>
                                    {build?.log ||
                                        (operation === 'compile'
                                            ? 'Ожидаем ответ компилятора…'
                                            : 'Запустите сборку, чтобы увидеть сообщения компилятора.')}
                                </pre>
                            </div>
                        ) : pdfUrl ? (
                            <iframe
                                key={pdfUrl}
                                src={pdfUrl}
                                title="PDF документа"
                            />
                        ) : (
                            <div className="pdf-empty">
                                <div className="empty-paper">
                                    <FileText size={35} strokeWidth={1} />
                                    <span />
                                    <span />
                                    <span />
                                </div>
                                <h2>Здесь оживёт ваш текст</h2>
                                <p>
                                    Соберите проект, чтобы увидеть
                                    <br />
                                    готовый PDF-документ.
                                </p>
                                <button
                                    className="tex-button secondary"
                                    disabled={busy}
                                    onClick={() => void compile()}
                                >
                                    <Play size={14} /> Первая сборка
                                </button>
                                <span className="preview-shortcut">
                                    или нажмите Ctrl + Enter
                                </span>
                            </div>
                        )}
                        {operation === 'compile' && (
                            <div className="compiling-overlay" role="status">
                                <LoaderCircle className="spin" size={24} />
                                <strong>Собираем документ</strong>
                                <span>Это может занять до минуты</span>
                            </div>
                        )}
                    </div>
                    <div className="preview-status">
                        <span
                            className={`status-dot ${build && build.status !== 'success' ? 'warning' : ''}`}
                        />
                        <span>
                            {operation === 'compile'
                                ? 'Компиляция…'
                                : build?.status === 'success'
                                  ? 'PDF обновлён'
                                  : build
                                    ? 'Проверьте журнал компиляции'
                                    : 'Готов к первой сборке'}
                        </span>
                        {pdfUrl && build?.status !== 'success' && (
                            <span className="previous-pdf">
                                Последний успешный PDF
                            </span>
                        )}
                    </div>
                </section>
            </main>
            <ProjectModal
                title={
                    modal === 'settings'
                        ? 'Настройки проекта'
                        : modal === 'rename'
                          ? 'Переименовать или переместить'
                          : modal === 'directory'
                            ? 'Новая папка'
                            : 'Новый файл'
                }
                description={
                    modal === 'settings'
                        ? 'Настройте документ и движок компиляции.'
                        : 'Укажите путь относительно папки проекта.'
                }
                open={modal !== null}
                onClose={() => setModal(null)}
                onSubmit={(event) => void mutate(event)}
                busy={operation === 'mutation'}
                error={modalError}
                submitLabel={
                    modal === 'file' || modal === 'directory'
                        ? 'Создать'
                        : 'Сохранить'
                }
            >
                <label>
                    {modal === 'settings' ? 'Название проекта' : 'Путь'}
                    <input
                        autoFocus
                        required
                        value={field}
                        onChange={(e) => setField(e.target.value)}
                        placeholder={
                            modal === 'directory'
                                ? 'chapters'
                                : 'chapters/introduction.tex'
                        }
                    />
                </label>
                {modal === 'settings' ? (
                    <>
                        <label>
                            Главный файл
                            <select
                                value={mainFile}
                                onChange={(e) => setMainFile(e.target.value)}
                            >
                                {!project.files.some(
                                    (file) => file.path === mainFile,
                                ) && (
                                    <option value={mainFile}>
                                        {mainFile
                                            ? `${mainFile} — не найден`
                                            : 'Выберите главный файл'}
                                    </option>
                                )}
                                {project.files
                                    .filter(
                                        (file) =>
                                            file.type === 'file' &&
                                            file.path.endsWith('.tex'),
                                    )
                                    .map((file) => (
                                        <option
                                            key={file.path}
                                            value={file.path}
                                        >
                                            {file.path}
                                        </option>
                                    ))}
                            </select>
                        </label>
                        <label>
                            Движок
                            <select
                                value={engine}
                                onChange={(e) => setEngine(e.target.value)}
                            >
                                <option value="pdflatex">pdfLaTeX</option>
                                <option value="xelatex">XeLaTeX</option>
                                <option value="lualatex">LuaLaTeX</option>
                            </select>
                        </label>
                        <p className="field-hint">
                            Для кириллицы и системных шрифтов обычно удобно
                            использовать XeLaTeX.
                        </p>
                        <button
                            className="delete-project"
                            type="button"
                            disabled={busy}
                            onClick={() => void deleteProject()}
                        >
                            Удалить проект со всеми файлами
                        </button>
                    </>
                ) : (
                    <p className="field-hint">
                        Например: introduction.tex или
                        chapters/introduction.tex. Родительская папка должна
                        существовать.
                    </p>
                )}
            </ProjectModal>
        </div>
    );
}
