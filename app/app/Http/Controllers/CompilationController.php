<?php

namespace App\Http\Controllers;

use App\Services\CompilationService;
use Illuminate\Http\JsonResponse;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class CompilationController extends Controller
{
    public function __construct(private CompilationService $compilations) {}

    public function store(string $project): JsonResponse
    {
        return response()->json($this->compilations->compile($project), 201);
    }

    public function show(string $project, string $compilation): JsonResponse
    {
        return response()->json($this->compilations->find($project, $compilation));
    }

    public function pdf(string $project, string $compilation): BinaryFileResponse
    {
        return response()->file($this->compilations->pdf($project, $compilation), [
            'Content-Type' => 'application/pdf',
        ]);
    }
}
