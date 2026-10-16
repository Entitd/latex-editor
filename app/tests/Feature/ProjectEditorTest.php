<?php

namespace Tests\Feature;

use Illuminate\Process\PendingProcess;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Inertia\Testing\AssertableInertia;
use Tests\TestCase;

class ProjectEditorTest extends TestCase
{
    private string $builds;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('projects');
        $this->builds = sys_get_temp_dir().'/latex-editor-test-'.Str::uuid();
        config(['latex.builds' => $this->builds]);
        Process::preventStrayProcesses();
    }

    protected function tearDown(): void
    {
        File::deleteDirectory($this->builds);
        parent::tearDown();
    }

    public function test_browser_pages_render_and_json_endpoints_remain_available(): void
    {
        $this->withoutVite();
        $this->postJson('/projects', ['name' => 'demo'])->assertCreated();
        $this->get('/')->assertOk()->assertInertia(fn (AssertableInertia $page) => $page
            ->component('projects/index')->has('projects', 1));
        $this->get('/projects')->assertOk()->assertSee('name="csrf-token"', false)
            ->assertInertia(fn (AssertableInertia $page) => $page->component('projects/index'));
        $this->get('/projects/demo')->assertOk()->assertInertia(fn (AssertableInertia $page) => $page
            ->component('projects/editor')->where('project.name', 'demo')->has('project.files', 1));
        $this->getJson('/projects')->assertOk()->assertJsonPath('projects.0.name', 'demo');
        $this->getJson('/projects/demo')->assertOk()->assertJsonPath('settings.main_file', 'main.tex');
    }

    public function test_project_lifecycle_uses_directories_and_preserves_existing_projects(): void
    {
        Storage::disk('projects')->put('existing/thesis.tex', 'Existing source');
        $this->postJson('/projects', ['name' => 'Диплом'])->assertCreated();
        $this->getJson('/projects')->assertOk()->assertJsonCount(2, 'projects');
        $this->getJson('/projects/Диплом')->assertOk()
            ->assertJsonPath('settings.main_file', 'main.tex')
            ->assertJsonPath('files.0.path', 'main.tex');
        $this->postJson('/projects', ['name' => 'Диплом'])->assertConflict();
        $this->patchJson('/projects/Диплом', ['name' => 'renamed', 'engine' => 'xelatex'])
            ->assertOk()->assertJsonPath('settings.engine', 'xelatex');
        $this->getJson('/projects/Диплом')->assertNotFound();
        $this->deleteJson('/projects/renamed')->assertNoContent();
        Storage::disk('projects')->assertExists('existing/thesis.tex');
    }

    public function test_nested_file_operations_and_empty_content(): void
    {
        $this->postJson('/projects', ['name' => 'demo'])->assertCreated();
        $this->postJson('/projects/demo/files', ['path' => 'chapters', 'type' => 'directory'])->assertCreated();
        $this->postJson('/projects/demo/files', ['path' => 'chapters/intro.tex', 'type' => 'file', 'content' => 'Text'])->assertCreated();
        $this->putJson('/projects/demo/files', ['path' => 'chapters/intro.tex', 'content' => "  Text\n\n"])->assertOk();
        $this->getJson('/projects/demo/files?path=chapters/intro.tex')->assertOk()->assertJsonPath('content', "  Text\n\n");
        $this->putJson('/projects/demo/files', ['path' => 'chapters/intro.tex', 'content' => ''])->assertOk();
        $this->getJson('/projects/demo/files?path=chapters/intro.tex')->assertOk()->assertJsonPath('content', '');
        $this->patchJson('/projects/demo/files', ['path' => 'chapters', 'new_path' => 'sections'])->assertOk();
        $this->getJson('/projects/demo')->assertOk()->assertJsonFragment(['path' => 'sections/intro.tex', 'type' => 'file']);
        $this->deleteJson('/projects/demo/files', ['path' => 'sections'])->assertNoContent();
        Storage::disk('projects')->assertMissing('demo/sections');
    }

    public function test_traversal_overwrites_symlinks_and_reserved_settings_are_rejected(): void
    {
        $this->postJson('/projects', ['name' => '../escape'])->assertUnprocessable();
        $this->postJson('/projects', ['name' => 'demo'])->assertCreated();
        foreach (['../outside.tex', '/outside.tex', 'folder/../../outside.tex', 'folder\\outside.tex', '.latex-editor.json'] as $path) {
            $this->putJson('/projects/demo/files', ['path' => $path, 'content' => 'bad'])->assertUnprocessable();
        }
        $this->postJson('/projects/demo/files', ['path' => 'main.tex', 'type' => 'file'])->assertConflict();
        $this->postJson('/projects/demo/files', ['path' => 'missing/new.tex', 'type' => 'file'])->assertUnprocessable();
        $outside = $this->builds.'-outside';
        File::ensureDirectoryExists($outside);
        File::put($outside.'/secret.tex', 'secret');
        try {
            symlink($outside, Storage::disk('projects')->path('demo/link'));
            $this->getJson('/projects/demo/files?path=link/secret.tex')->assertUnprocessable();
            $this->putJson('/projects/demo/files', ['path' => 'link/secret.tex', 'content' => 'bad'])->assertUnprocessable();
            $this->assertSame('secret', File::get($outside.'/secret.tex'));
            $this->getJson('/projects/demo')->assertOk()->assertJsonMissing(['path' => 'link']);
        } finally {
            unlink(Storage::disk('projects')->path('demo/link'));
            File::deleteDirectory($outside);
        }
    }

    public function test_main_file_settings_and_rename_stay_consistent(): void
    {
        $this->postJson('/projects', ['name' => 'demo'])->assertCreated();
        $this->patchJson('/projects/demo', ['main_file' => 'missing.tex'])->assertUnprocessable();
        $this->patchJson('/projects/demo', ['engine' => 'shell'])->assertUnprocessable();
        $this->deleteJson('/projects/demo/files', ['path' => 'main.tex'])->assertUnprocessable();
        $this->patchJson('/projects/demo/files', ['path' => 'main.tex', 'new_path' => 'thesis.tex'])->assertOk();
        $this->getJson('/projects/demo')->assertJsonPath('settings.main_file', 'thesis.tex');
    }

    public function test_detects_main_document_among_fragments_and_ignores_comments(): void
    {
        $disk = Storage::disk('projects');
        $disk->put('demo/main.tex', 'A fragment without a document environment.');
        $disk->put('demo/example.tex', "% \\begin{document}\n% \\end{document}\n");
        $disk->put('demo/reversed.tex', '\\end{document} \\begin{document}');
        $disk->put('demo/chapters/intro.tex', 'Introduction');
        $disk->put('demo/Thesis.tex', "\\documentclass{article}\n\\begin % comment\n{document}\nText with \\% escaped percent.\n\\end{document}");

        $this->getJson('/projects/demo')->assertOk()->assertJsonPath('settings.main_file', 'Thesis.tex');
        $disk->assertMissing('demo/.latex-editor.json');
    }

    public function test_stale_main_file_setting_falls_back_to_detected_document(): void
    {
        $disk = Storage::disk('projects');
        $disk->put('demo/.latex-editor.json', json_encode(['main_file' => 'missing.tex', 'engine' => 'xelatex']));
        $disk->put('demo/docs/Thesis.tex', '\\begin{document} Text \\end{document}');
        $this->getJson('/projects/demo')->assertOk()
            ->assertJsonPath('settings.main_file', 'docs/Thesis.tex')
            ->assertJsonPath('settings.engine', 'xelatex');
    }

    public function test_ambiguous_documents_require_explicit_choice_and_choice_is_preserved(): void
    {
        $disk = Storage::disk('projects');
        $disk->put('demo/first.tex', '\\begin{document} First \\end{document}');
        $disk->put('demo/second.tex', '\\begin{document} Second \\end{document}');
        $this->getJson('/projects/demo')->assertOk()->assertJsonPath('settings.main_file', '');
        $this->postJson('/projects/demo/compilations')->assertUnprocessable();
        $this->patchJson('/projects/demo', ['main_file' => 'second.tex'])->assertOk();
        // A user's explicit choice also works for a document still being written.
        $disk->put('demo/second.tex', '\\documentclass{article}');
        $this->getJson('/projects/demo')->assertOk()->assertJsonPath('settings.main_file', 'second.tex');
        $this->patchJson('/projects/demo', ['main_file' => '../outside.tex'])->assertUnprocessable();
        $disk->put('demo/notes.txt', 'notes');
        $this->patchJson('/projects/demo', ['main_file' => 'notes.txt'])->assertUnprocessable();
    }

    public function test_main_file_in_subdirectory_follows_directory_rename_and_is_protected_from_deletion(): void
    {
        $disk = Storage::disk('projects');
        $disk->put('demo/docs/Thesis.tex', '\\begin{document} Text \\end{document}');
        $this->patchJson('/projects/demo', ['main_file' => 'docs/Thesis.tex'])->assertOk();
        $this->deleteJson('/projects/demo/files', ['path' => 'docs'])->assertUnprocessable();
        $this->patchJson('/projects/demo/files', ['path' => 'docs', 'new_path' => 'source'])->assertOk();
        $this->getJson('/projects/demo')->assertOk()->assertJsonPath('settings.main_file', 'source/Thesis.tex');
        $this->patchJson('/projects/demo/files', ['path' => 'source/Thesis.tex', 'new_path' => 'source/Диплом.tex'])->assertOk();
        $this->getJson('/projects/demo')->assertOk()->assertJsonPath('settings.main_file', 'source/Диплом.tex');
    }

    public function test_compiles_automatically_detected_nested_document_and_serves_basename_pdf(): void
    {
        Storage::disk('projects')->put('demo/docs/Диплом.tex', '\\begin{document} Text \\end{document}');
        Process::fake(function (PendingProcess $process) {
            $command = $process->command;
            $this->assertIsArray($command);
            $this->assertSame('docs/Диплом.tex', $command[count($command) - 2]);
            $outputMount = array_values(array_filter($command, fn ($argument) => str_ends_with($argument, ':/output')))[0];
            File::put(substr($outputMount, 0, -strlen(':/output')).'/Диплом.pdf', '%PDF-1.4 test');

            return Process::result(output: 'Compilation completed');
        });
        $build = $this->postJson('/projects/demo/compilations')->assertCreated()
            ->assertJsonPath('status', 'success')->assertJsonPath('main_file', 'docs/Диплом.tex');
        $this->get('/projects/demo/compilations/'.$build->json('id').'/pdf')->assertOk();
    }

    public function test_builds_use_separate_output_directories_and_return_their_own_pdf(): void
    {
        $this->postJson('/projects', ['name' => 'demo'])->assertCreated();
        $this->postJson('/projects', ['name' => 'other'])->assertCreated();
        $mounts = [];
        Process::fake(function (PendingProcess $process) use (&$mounts) {
            $command = $process->command;
            $this->assertIsArray($command);
            $this->assertContains(Storage::disk('projects')->path('demo').':/workspace:ro', $command);
            $outputMount = array_values(array_filter($command, fn ($argument) => str_ends_with($argument, ':/output')))[0];
            $mounts[] = $outputMount;
            File::put(substr($outputMount, 0, -strlen(':/output')).'/main.pdf', '%PDF-1.4 test');

            return Process::result(output: 'Compilation completed');
        });
        $first = $this->postJson('/projects/demo/compilations')->assertCreated()->assertJsonPath('status', 'success');
        $id = $first->json('id');
        $this->getJson('/projects/demo/compilations/'.$id)->assertOk()->assertJsonPath('log', "Compilation completed\n");
        $this->get('/projects/demo/compilations/'.$id.'/pdf')->assertOk()->assertHeader('content-type', 'application/pdf');
        $this->getJson('/projects/other/compilations/'.$id)->assertNotFound();
        $this->postJson('/projects/demo/compilations')->assertCreated();
        $this->assertCount(2, array_unique($mounts));
        Process::assertRanTimes(fn () => true, 2);
    }

    public function test_non_utf8_compiler_output_can_be_returned_as_json_without_altering_raw_log(): void
    {
        $this->postJson('/projects', ['name' => 'demo'])->assertCreated();
        $output = "Начало журнала\nBroken character: \xD0\n";
        $errorOutput = "Ошибка компиляции: \xFF\n";
        Process::fake(['*' => Process::result(output: $output, errorOutput: $errorOutput, exitCode: 1)]);

        $response = $this->postJson('/projects/demo/compilations')->assertCreated()
            ->assertJsonPath('status', 'error')->assertJsonPath('pdf_url', null);
        $id = $response->json('id');
        $log = $response->json('log');
        $this->assertTrue(mb_check_encoding($log, 'UTF-8'));
        $this->assertStringContainsString('Начало журнала', $log);
        $this->assertStringContainsString('Ошибка компиляции', $log);
        $this->assertStringNotContainsString("\xFF", $log);
        $rawLog = File::get($this->builds.'/'.$id.'/process.log');
        $this->assertStringContainsString("\xD0\n", $rawLog);
        $this->assertStringContainsString("\xFF", $rawLog);
        $this->getJson('/projects/demo/compilations/'.$id)->assertOk()->assertJsonPath('log', $log);

        // Older builds may have only the compiler's own log.
        File::move($this->builds.'/'.$id.'/process.log', $this->builds.'/'.$id.'/compile.log');
        $this->getJson('/projects/demo/compilations/'.$id)->assertOk()->assertJsonPath('log', $log);
        $this->assertSame($rawLog, File::get($this->builds.'/'.$id.'/compile.log'));
    }

    public function test_failed_builds_and_timeouts_never_expose_a_pdf(): void
    {
        $this->postJson('/projects', ['name' => 'demo'])->assertCreated();
        Process::fake(['*' => Process::sequence()
            ->push(Process::result(errorOutput: 'LaTeX error', exitCode: 1))
            ->push(Process::result(errorOutput: 'Timed out', exitCode: 124))]);
        $failed = $this->postJson('/projects/demo/compilations')->assertCreated()
            ->assertJsonPath('status', 'error')->assertJsonPath('pdf_url', null);
        $this->getJson('/projects/demo/compilations/'.$failed->json('id').'/pdf')->assertNotFound();
        $this->postJson('/projects/demo/compilations')->assertCreated()->assertJsonPath('status', 'timeout');
        $this->getJson('/projects/demo/compilations/not-a-uuid')->assertNotFound();
    }
}
