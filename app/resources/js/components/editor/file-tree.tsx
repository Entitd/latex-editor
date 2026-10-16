import {
    ChevronDown,
    ChevronRight,
    File,
    FileCode2,
    Folder,
    FolderOpen,
    Pencil,
    Star,
    Trash2,
} from 'lucide-react';
import { useState } from 'react';
import type { ProjectFile } from '@/lib/editor-api';

export function FileTree({
    files,
    selected,
    mainFile,
    onSetMain,
    disabled,
    onOpen,
    onRename,
    onDelete,
    parent = '',
}: {
    files: ProjectFile[];
    selected: string;
    mainFile: string;
    onSetMain: (path: string) => void;
    disabled: boolean;
    onOpen: (path: string) => void;
    onRename: (file: ProjectFile) => void;
    onDelete: (file: ProjectFile) => void;
    parent?: string;
}) {
    const [collapsed, setCollapsed] = useState<string[]>([]);
    const children = files
        .filter((file) => {
            const slash = file.path.lastIndexOf('/');
            return (slash === -1 ? '' : file.path.slice(0, slash)) === parent;
        })
        .sort((a, b) =>
            a.type === b.type
                ? a.path.localeCompare(b.path)
                : a.type === 'directory'
                  ? -1
                  : 1,
        );
    return (
        <ul className="file-tree">
            {children.map((file) => {
                const isFolder = file.type === 'directory';
                const isCollapsed = collapsed.includes(file.path);
                return (
                    <li key={file.path}>
                        <div
                            className={`file-row ${selected === file.path ? 'selected' : ''}`}
                        >
                            <button
                                disabled={disabled}
                                className="file-open"
                                title={file.path}
                                onClick={() => {
                                    if (isFolder)
                                        setCollapsed((previous) =>
                                            isCollapsed
                                                ? previous.filter(
                                                      (path) =>
                                                          path !== file.path,
                                                  )
                                                : [...previous, file.path],
                                        );
                                    else onOpen(file.path);
                                }}
                            >
                                {isFolder ? (
                                    <>
                                        {isCollapsed ? (
                                            <ChevronRight size={12} />
                                        ) : (
                                            <ChevronDown size={12} />
                                        )}
                                        {isCollapsed ? (
                                            <Folder size={15} />
                                        ) : (
                                            <FolderOpen size={15} />
                                        )}
                                    </>
                                ) : (
                                    <>
                                        {/\.(tex|bib|sty|cls)$/.test(
                                            file.path,
                                        ) ? (
                                            <FileCode2 size={16} />
                                        ) : (
                                            <File size={16} />
                                        )}
                                    </>
                                )}
                                <span>{file.path.split('/').at(-1)}</span>
                                {mainFile === file.path && (
                                    <Star
                                        size={12}
                                        className="main-file-star"
                                        fill="currentColor"
                                        aria-label="Главный документ"
                                    />
                                )}
                            </button>
                            <div className="file-actions">
                                {!isFolder &&
                                    file.path.endsWith('.tex') &&
                                    mainFile !== file.path && (
                                        <button
                                            className="icon-button"
                                            title="Сделать главным документом"
                                            aria-label={`Сделать главным ${file.path}`}
                                            disabled={disabled}
                                            onClick={() => onSetMain(file.path)}
                                        >
                                            <Star size={12} />
                                        </button>
                                    )}
                                <button
                                    className="icon-button"
                                    aria-label={`Переименовать ${file.path}`}
                                    disabled={disabled}
                                    onClick={() => onRename(file)}
                                >
                                    <Pencil size={12} />
                                </button>
                                <button
                                    className="icon-button"
                                    aria-label={`Удалить ${file.path}`}
                                    disabled={disabled}
                                    onClick={() => onDelete(file)}
                                >
                                    <Trash2 size={12} />
                                </button>
                            </div>
                        </div>
                        {isFolder && !isCollapsed && (
                            <FileTree
                                files={files}
                                selected={selected}
                                mainFile={mainFile}
                                onSetMain={onSetMain}
                                disabled={disabled}
                                onOpen={onOpen}
                                onRename={onRename}
                                onDelete={onDelete}
                                parent={file.path}
                            />
                        )}
                    </li>
                );
            })}
        </ul>
    );
}
