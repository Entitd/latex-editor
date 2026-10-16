<?php

use App\Http\Controllers\CompilationController;
use App\Http\Controllers\ProjectController;
use App\Http\Controllers\ProjectFileController;
use Illuminate\Support\Facades\Route;

Route::get('/', [ProjectController::class, 'index'])->name('home');

Route::middleware(['auth', 'verified'])->group(function () {
    Route::inertia('dashboard', 'dashboard')->name('dashboard');
});

Route::get('/projects', [ProjectController::class, 'index'])->name('project.index');
Route::post('/projects', [ProjectController::class, 'store'])->name('project.store');
Route::get('/projects/{project}', [ProjectController::class, 'show'])->name('project.show');
Route::patch('/projects/{project}', [ProjectController::class, 'update'])->name('project.update');
Route::delete('/projects/{project}', [ProjectController::class, 'destroy'])->name('project.destroy');

// File paths are request parameters so nested paths do not interfere with routes.
Route::prefix('/projects/{project}/files')->name('project.file.')->group(function () {
    Route::get('/', [ProjectFileController::class, 'show'])->name('show');
    Route::post('/', [ProjectFileController::class, 'store'])->name('store');
    Route::put('/', [ProjectFileController::class, 'update'])->name('update');
    Route::patch('/', [ProjectFileController::class, 'rename'])->name('rename');
    Route::delete('/', [ProjectFileController::class, 'destroy'])->name('destroy');
});

Route::prefix('/projects/{project}/compilations')->name('compilation.')->group(function () {
    Route::post('/', [CompilationController::class, 'store'])->name('store');
    Route::get('/{compilation}', [CompilationController::class, 'show'])->whereUuid('compilation')->name('show');
    Route::get('/{compilation}/pdf', [CompilationController::class, 'pdf'])->whereUuid('compilation')->name('pdf');
});

require __DIR__.'/settings.php';
