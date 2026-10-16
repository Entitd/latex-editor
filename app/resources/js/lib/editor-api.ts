export type ProjectSummary = { name: string };
export type ProjectFile = { path: string; type: 'file' | 'directory' };
export type Project = {
    name: string;
    settings: { main_file: string; engine: string };
    files: ProjectFile[];
};
export type Build = {
    id: string;
    status: 'running' | 'success' | 'error' | 'timeout';
    log: string;
    pdf_url: string | null;
    finished_at: string | null;
};

export function projectUrl(name: string): string {
    return `/projects/${encodeURIComponent(name)}`;
}

export async function api<T>(
    url: string,
    method = 'GET',
    data?: unknown,
): Promise<T> {
    const options: RequestInit = {
        method,
        credentials: 'same-origin',
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'X-CSRF-TOKEN':
                document.querySelector<HTMLMetaElement>(
                    'meta[name="csrf-token"]',
                )?.content ?? '',
        },
    };
    if (data !== undefined && method !== 'GET' && method !== 'HEAD') {
        options.body = JSON.stringify(data);
    }
    const response = await fetch(url, options);
    if (response.status === 204) return undefined as T;
    const body = (await response.json().catch(() => null)) as {
        message?: string;
        errors?: Record<string, string[]>;
    } | null;
    if (!response.ok) {
        const detail = body?.errors
            ? Object.values(body.errors).flat().join('\n')
            : body?.message;
        throw new Error(
            response.status === 419
                ? 'Сессия истекла. Обновите страницу и повторите действие.'
                : detail || `Не удалось выполнить запрос (${response.status}).`,
        );
    }
    return body as T;
}

export function errorMessage(error: unknown): string {
    return error instanceof Error
        ? error.message
        : 'Не удалось выполнить действие.';
}
