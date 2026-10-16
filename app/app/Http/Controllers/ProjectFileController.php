<?php

namespace App\Http\Controllers;

use App\Services\ProjectWorkspace;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Validation\Rule;

class ProjectFileController extends Controller
{
    public function __construct(private ProjectWorkspace $workspace) {}

    public function show(Request $request, string $project): JsonResponse
    {
        $data = $request->validate(['path' => ['required', 'string']]);
        $path = $this->workspace->path($project, $data['path']);
        abort_unless(is_file($this->workspace->disk()->path($path)), 404, 'Файл не найден.');
        abort_if(filesize($this->workspace->disk()->path($path)) > 2 * 1024 * 1024, 413, 'Файл слишком большой для редактора.');
        $content = $this->workspace->disk()->get($path);
        abort_unless(mb_check_encoding($content, 'UTF-8') && ! str_contains($content, "\0"), 415, 'Редактор поддерживает текстовые файлы UTF-8.');

        return response()->json(['path' => $data['path'], 'content' => $content]);
    }

    public function store(Request $request, string $project): JsonResponse
    {
        $data = $request->validate([
            'path' => ['required', 'string'],
            'type' => ['required', Rule::in(['file', 'directory'])],
            'content' => ['sometimes', 'nullable', 'string', 'max:2097152'],
        ]);
        $path = $this->workspace->path($project, $data['path']);
        $disk = $this->workspace->disk();
        abort_if($disk->exists($path), 409, 'Файл или папка уже существует.');
        $this->requireParent($path);
        if ($data['type'] === 'directory') {
            $disk->makeDirectory($path);
        } else {
            $disk->put($path, $data['content'] ?? '');
        }

        return response()->json(['path' => $data['path'], 'type' => $data['type']], 201);
    }

    public function update(Request $request, string $project): JsonResponse
    {
        $data = $request->validate([
            'path' => ['required', 'string'],
            'content' => ['present', 'nullable', 'string', 'max:2097152'],
        ]);
        $path = $this->workspace->path($project, $data['path']);
        abort_unless(is_file($this->workspace->disk()->path($path)), 404, 'Файл не найден.');
        $this->workspace->disk()->put($path, $data['content'] ?? '');

        return response()->json(['path' => $data['path'], 'saved' => true]);
    }

    public function rename(Request $request, string $project): JsonResponse
    {
        $data = $request->validate(['path' => ['required', 'string'], 'new_path' => ['required', 'string']]);
        $path = $this->workspace->path($project, $data['path']);
        $newPath = $this->workspace->path($project, $data['new_path']);
        $disk = $this->workspace->disk();
        abort_unless($disk->exists($path), 404, 'Файл или папка не найдены.');
        abort_if($disk->exists($newPath), 409, 'Путь уже занят.');
        abort_if(str_starts_with($newPath, $path.'/'), 422, 'Нельзя переместить папку внутрь себя.');
        $this->requireParent($newPath);
        $settings = $this->workspace->settings($project);
        if ($settings['main_file'] === $data['path'] || str_starts_with($settings['main_file'], $data['path'].'/')) {
            $mainFile = $data['new_path'].substr($settings['main_file'], strlen($data['path']));
            $this->workspace->mainFile($project, $mainFile, mustExist: false);
            $settings['main_file'] = $mainFile;
        }
        $disk->move($path, $newPath);
        $this->workspace->saveSettings($project, $settings);

        return response()->json(['path' => $data['new_path']]);
    }

    public function destroy(Request $request, string $project): Response
    {
        $data = $request->validate(['path' => ['required', 'string']]);
        $path = $this->workspace->path($project, $data['path']);
        $disk = $this->workspace->disk();
        abort_unless($disk->exists($path), 404, 'Файл или папка не найдены.');
        $mainFile = $this->workspace->settings($project)['main_file'];
        abort_if($mainFile === $data['path'] || str_starts_with($mainFile, $data['path'].'/'), 422, 'Сначала выберите другой главный файл.');
        if (is_dir($disk->path($path))) {
            $disk->deleteDirectory($path);
        } else {
            $disk->delete($path);
        }

        return response()->noContent();
    }

    private function requireParent(string $path): void
    {
        abort_unless(is_dir($this->workspace->disk()->path(dirname($path))), 422, 'Родительская папка не существует.');
    }
}
