<?php

namespace App\Services;

use Illuminate\Process\Exceptions\ProcessTimedOutException;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Str;
use Throwable;

class CompilationService
{
    public function __construct(private ProjectWorkspace $workspace) {}

    /** @return array<string, mixed> */
    public function compile(string $project): array
    {
        $this->workspace->project($project);
        $settings = $this->workspace->settings($project);
        abort_unless(in_array($settings['engine'], ['pdflatex', 'xelatex', 'lualatex'], true), 422, 'Неизвестный движок.');
        abort_if($settings['main_file'] === '', 422, 'Не удалось однозначно определить главный документ. Выберите .tex-файл кнопкой «Сделать главным».');
        $this->workspace->mainFile($project, $settings['main_file']);
        $id = (string) Str::uuid();
        $directory = $this->directory($id);
        File::ensureDirectoryExists($directory);
        $build = [
            'id' => $id,
            'project' => $project,
            'status' => 'running',
            'main_file' => $settings['main_file'],
            'engine' => $settings['engine'],
            'started_at' => now()->toIso8601String(),
            'finished_at' => null,
            'exit_code' => null,
        ];
        $this->save($directory, $build);

        try {
            // Override the existing Compose mounts: the container sees only this project.
            $result = Process::path(config('latex.root'))->timeout(90)->run([
                'docker', 'compose', 'run', '--rm', '--no-deps', '-T',
                '--volume', $this->workspace->disk()->path($project).':/workspace:ro',
                '--volume', $directory.':/output',
                'compiler', 'bash', '/scripts/compile.sh', $settings['main_file'], $settings['engine'],
            ]);
            $build['exit_code'] = $result->exitCode();
            $build['status'] = $result->successful() && is_file($directory.'/'.$this->pdfName($build))
                ? 'success'
                : (in_array($result->exitCode(), [124, 137], true) ? 'timeout' : 'error');
            File::put($directory.'/process.log', $result->output().$result->errorOutput());
        } catch (Throwable $exception) {
            report($exception);
            $build['status'] = $exception instanceof ProcessTimedOutException ? 'timeout' : 'error';
            File::put($directory.'/process.log', 'Не удалось выполнить компиляцию: '.$exception->getMessage());
        }

        $build['finished_at'] = now()->toIso8601String();
        $this->save($directory, $build);

        return $this->find($project, $id);
    }

    /** @return array<string, mixed> */
    public function find(string $project, string $id): array
    {
        $this->workspace->project($project);
        $directory = $this->directory($id);
        abort_unless(is_file($directory.'/build.json'), 404, 'Сборка не найдена.');
        $build = json_decode(File::get($directory.'/build.json'), true, flags: JSON_THROW_ON_ERROR);
        abort_unless($build['project'] === $project, 404, 'Сборка не найдена.');
        $log = is_file($directory.'/process.log') ? $directory.'/process.log' : $directory.'/compile.log';
        // TeX may split a multibyte character across log lines. Keep the raw
        // bytes on disk and replace invalid sequences only for the JSON response.
        $build['log'] = is_file($log) ? mb_scrub(File::get($log), 'UTF-8') : '';
        $build['pdf_url'] = $build['status'] === 'success'
            ? route('compilation.pdf', ['project' => $project, 'compilation' => $id])
            : null;

        return $build;
    }

    public function pdf(string $project, string $id): string
    {
        $build = $this->find($project, $id);
        $path = $this->directory($id).'/'.$this->pdfName($build);
        abort_unless($build['status'] === 'success' && is_file($path), 404, 'PDF недоступен.');

        return $path;
    }

    private function directory(string $id): string
    {
        abort_unless(Str::isUuid($id), 404, 'Сборка не найдена.');

        return config('latex.builds').'/'.$id;
    }

    /** @param array<string, mixed> $build */
    private function pdfName(array $build): string
    {
        return pathinfo($build['main_file'], PATHINFO_FILENAME).'.pdf';
    }

    /** @param array<string, mixed> $build */
    private function save(string $directory, array $build): void
    {
        File::put($directory.'/build.json', json_encode($build, JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR));
    }
}
