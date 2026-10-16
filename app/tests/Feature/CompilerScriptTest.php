<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;
use Symfony\Component\Process\Process;
use Tests\TestCase;

class CompilerScriptTest extends TestCase
{
    public function test_script_accepts_nested_names_and_escapes_result_json(): void
    {
        $root = sys_get_temp_dir().'/latex-script-'.Str::uuid();
        File::ensureDirectoryExists($root.'/workspace/docs');
        File::ensureDirectoryExists($root.'/bin');
        $file = 'docs/Диплом "черновик".tex';
        File::put($root.'/workspace/'.$file, '\begin{document}Text\end{document}');
        // Redirect container paths to a temporary filesystem; only latexmk is stubbed.
        $script = str_replace(['/workspace', '/output'], [$root.'/workspace', $root.'/output'], File::get(base_path('../compiler/compile.sh')));
        File::put($root.'/compile.sh', $script);
        File::put($root.'/bin/latexmk', <<<'BASH'
#!/usr/bin/env bash
for arg in "$@"; do
    if [[ "$arg" == -outdir=* ]]; then output="${arg#-outdir=}"; fi
done
source="${@: -1}"
printf '%s\n' "$source"
printf '%%PDF-1.4 test' > "$output/$(basename -- "$source" .tex).pdf"
BASH);
        chmod($root.'/bin/latexmk', 0755);
        try {
            $process = new Process(['bash', $root.'/compile.sh', $file, 'pdflatex'], $root.'/workspace', ['PATH' => $root.'/bin:'.getenv('PATH')]);
            $process->mustRun();
            $result = json_decode(File::get($root.'/output/result.json'), true, flags: JSON_THROW_ON_ERROR);
            $this->assertSame('success', $result['status']);
            $this->assertSame($file, $result['source']);
            $this->assertFileExists($root.'/output/Диплом "черновик".pdf');
            $this->assertStringContainsString('./'.$file, $process->getOutput());

            foreach (['../escape.tex', '/absolute.tex', "bad\nname.tex"] as $invalid) {
                $invalidProcess = new Process(['bash', $root.'/compile.sh', $invalid], $root.'/workspace');
                $this->assertSame(2, $invalidProcess->run());
            }
        } finally {
            File::deleteDirectory($root);
        }
    }
}
