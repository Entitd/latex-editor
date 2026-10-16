<?php

namespace App\Services;

use Illuminate\Filesystem\FilesystemAdapter;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

class ProjectWorkspace
{
    public function disk(): FilesystemAdapter
    {
        return Storage::disk('projects');
    }

    public function name(string $name): string
    {
        // A project name is exactly one directory, including Cyrillic names.
        if (! preg_match('/\A[\pL\pN][\pL\pN _.-]{0,99}\z/u', $name) || str_ends_with($name, '.') || str_ends_with($name, ' ')) {
            throw ValidationException::withMessages(['name' => 'Недопустимое имя проекта.']);
        }

        return $name;
    }

    public function project(string $project): string
    {
        $project = $this->name($project);
        $this->safe($project);
        abort_unless(is_dir($this->disk()->path($project)), 404, 'Проект не найден.');

        return $project;
    }

    public function path(string $project, string $path): string
    {
        $this->project($project);
        $segments = explode('/', $path);
        if ($path === '' || strlen($path) > 1000 || preg_match('/[\\\\\x00-\x1F\x7F:]/', $path)) {
            throw ValidationException::withMessages(['path' => 'Недопустимый путь.']);
        }
        foreach ($segments as $segment) {
            if ($segment === '' || $segment === '.' || $segment === '..' || $segment === '.latex-editor.json') {
                throw ValidationException::withMessages(['path' => 'Недопустимый путь.']);
            }
        }

        $relative = $project.'/'.$path;
        $this->safe($relative);

        return $relative;
    }

    public function safe(string $relative): void
    {
        $current = rtrim($this->disk()->path(''), '/');
        foreach (explode('/', $relative) as $segment) {
            $current .= '/'.$segment;
            if (is_link($current)) {
                throw ValidationException::withMessages(['path' => 'Символические ссылки не поддерживаются.']);
            }
        }
    }

    /** @return array{main_file: string, engine: string} */
    public function settings(string $project): array
    {
        $this->project($project);
        $path = $project.'/.latex-editor.json';
        $this->safe($path);
        $settings = $this->disk()->exists($path)
            ? json_decode($this->disk()->get($path), true, flags: JSON_THROW_ON_ERROR)
            : [];

        $mainFile = $settings['main_file'] ?? '';
        if ($mainFile !== '') {
            $relative = $this->path($project, $mainFile);
            if (! str_ends_with($mainFile, '.tex') || ! is_file($this->disk()->path($relative))) {
                $mainFile = '';
            }
        }
        if ($mainFile === '') {
            $candidates = $this->mainCandidates($project);
            $mainFile = count($candidates) === 1 ? $candidates[0] : '';
        }

        return [
            'main_file' => $mainFile,
            'engine' => $settings['engine'] ?? 'pdflatex',
        ];
    }

    /** @return list<string> */
    public function mainCandidates(string $project): array
    {
        $candidates = [];
        foreach ($this->tree($project) as $file) {
            if ($file['type'] !== 'file' || ! str_ends_with($file['path'], '.tex')) {
                continue;
            }
            $relative = $this->path($project, $file['path']);
            $source = $this->withoutComments($this->disk()->get($relative));
            if (preg_match('~\\\\begin\s*\{\s*document\s*\}~', $source, $begin, PREG_OFFSET_CAPTURE)
                && preg_match('~\\\\end\s*\{\s*document\s*\}~', $source, $end, PREG_OFFSET_CAPTURE)
                && $begin[0][1] < $end[0][1]) {
                $candidates[] = $file['path'];
            }
        }

        return $candidates;
    }

    public function mainFile(string $project, string $path, bool $mustExist = true): string
    {
        $relative = $this->path($project, $path);
        if (! str_ends_with($path, '.tex')) {
            throw ValidationException::withMessages(['main_file' => 'Главным может быть только .tex-файл.']);
        }
        if ($mustExist) {
            abort_unless(is_file($this->disk()->path($relative)), 422, 'Главный файл не найден.');
        }

        return $relative;
    }

    private function withoutComments(string $source): string
    {
        $lines = explode("\n", $source);
        foreach ($lines as &$line) {
            $length = strlen($line);
            for ($index = 0; $index < $length; $index++) {
                if ($line[$index] !== '%') {
                    continue;
                }
                $slashes = 0;
                for ($previous = $index - 1; $previous >= 0 && $line[$previous] === '\\'; $previous--) {
                    $slashes++;
                }
                if ($slashes % 2 === 0) {
                    $line = substr($line, 0, $index);
                    break;
                }
            }
        }
        unset($line);

        return implode("\n", $lines);
    }

    /** @param array{main_file: string, engine: string} $settings */
    public function saveSettings(string $project, array $settings): void
    {
        $this->project($project);
        $this->safe($project.'/.latex-editor.json');
        $this->disk()->put($project.'/.latex-editor.json', json_encode($settings, JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR));
    }

    /** @return list<array{path: string, type: string}> */
    public function tree(string $project, string $folder = ''): array
    {
        $relative = $folder === '' ? $this->project($project) : $this->path($project, $folder);
        $entries = [];
        foreach (scandir($this->disk()->path($relative)) ?: [] as $name) {
            if (in_array($name, ['.', '..', '.latex-editor.json'], true) || is_link($this->disk()->path($relative.'/'.$name))) {
                continue;
            }
            $path = $folder === '' ? $name : $folder.'/'.$name;
            $isDirectory = is_dir($this->disk()->path($relative.'/'.$name));
            $entries[] = ['path' => $path, 'type' => $isDirectory ? 'directory' : 'file'];
            if ($isDirectory) {
                array_push($entries, ...$this->tree($project, $path));
            }
        }

        return $entries;
    }
}
