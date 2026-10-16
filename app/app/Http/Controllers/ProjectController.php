<?php

namespace App\Http\Controllers;

use App\Services\ProjectWorkspace;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response as InertiaResponse;

class ProjectController extends Controller
{
    public function __construct(private ProjectWorkspace $workspace) {}

    public function index(Request $request): JsonResponse|InertiaResponse
    {
        $projects = collect($this->workspace->disk()->directories())
            ->filter(fn (string $path) => ! is_link($this->workspace->disk()->path($path)))
            ->map(fn (string $path) => ['name' => basename($path)])
            ->sortBy('name')->values();

        return $request->expectsJson()
            ? response()->json(['projects' => $projects])
            : Inertia::render('projects/index', ['projects' => $projects]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate(['name' => ['required', 'string', 'max:100']]);
        $name = $this->workspace->name($data['name']);
        $this->workspace->safe($name);
        $disk = $this->workspace->disk();
        abort_if($disk->exists($name), 409, 'Проект уже существует.');
        $disk->makeDirectory($name);
        $disk->put($name.'/main.tex', "\\documentclass{article}\n\\begin{document}\nHello, LaTeX!\n\\end{document}\n");
        $this->workspace->saveSettings($name, ['main_file' => 'main.tex', 'engine' => 'pdflatex']);

        return response()->json(['name' => $name], 201);
    }

    public function show(Request $request, string $project): JsonResponse|InertiaResponse
    {
        $this->workspace->project($project);

        $data = [
            'name' => $project,
            'settings' => $this->workspace->settings($project),
            'files' => $this->workspace->tree($project),
        ];

        return $request->expectsJson()
            ? response()->json($data)
            : Inertia::render('projects/editor', ['project' => $data]);
    }

    public function update(Request $request, string $project): JsonResponse
    {
        $this->workspace->project($project);
        $data = $request->validate([
            'name' => ['sometimes', 'required', 'string', 'max:100'],
            'main_file' => ['sometimes', 'required', 'string'],
            'engine' => ['sometimes', 'required', Rule::in(['pdflatex', 'xelatex', 'lualatex'])],
        ]);
        $settings = $this->workspace->settings($project);
        if (isset($data['main_file'])) {
            $this->workspace->mainFile($project, $data['main_file']);
            $settings['main_file'] = $data['main_file'];
        }
        $settings['engine'] = $data['engine'] ?? $settings['engine'];
        $name = $this->workspace->name($data['name'] ?? $project);
        $this->workspace->safe($name);
        if ($name !== $project) {
            abort_if($this->workspace->disk()->exists($name), 409, 'Проект уже существует.');
            $this->workspace->disk()->move($project, $name);
        }
        $this->workspace->saveSettings($name, $settings);

        return response()->json(['name' => $name, 'settings' => $settings]);
    }

    public function destroy(string $project): Response
    {
        $this->workspace->project($project);
        $this->workspace->disk()->deleteDirectory($project);

        return response()->noContent();
    }
}
