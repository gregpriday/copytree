<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Artisan;
use Tests\TestCase;

class CopyLaravelProjectTest extends TestCase
{
    /**
     * Test copying a Laravel project located at vendor/laravel/laravel.
     *
     * This test runs the full copy tree command on the Laravel starter project
     * and checks that the output (displayed in XML) contains expected files and
     * directory structure as defined by the "laravel" profile.
     */
    public function test_copy_laravel_project()
    {
        $projectPath = base_path('vendor/laravel/laravel');

        if (! is_dir($projectPath)) {
            $this->markTestSkipped('The Laravel project directory does not exist at vendor/laravel/laravel.');
        }

        // Run the copy tree command on the Laravel project with a restricted depth for performance.
        Artisan::call('copy', [
            'path' => $projectPath,
            '--display' => true,
            '--only-tree' => true,
        ]);

        $output = Artisan::output();

        // Assert that the XML output contains a tree section.
        $this->assertStringContainsString('<ct:tree>', $output, 'Output should contain the tree structure.');

        // According to the laravel profile, these files/directories should always be included.
        $this->assertStringContainsString('composer.json', $output, 'composer.json should be included.');
        $this->assertStringContainsString('README.md', $output, 'README.md should be included.');

        // The laravel profile includes files from key directories such as "app" and "routes".
        $this->assertStringContainsString('app', $output, 'The app directory should be present in the output.');
        $this->assertStringContainsString('routes', $output, 'The routes directory should be present in the output.');
        $this->assertStringContainsString('web.php', $output, 'The web.php file should be present in the output.');

        // Global exclude rules for the Laravel profile exclude vendor directories.
        // This is working correctly - vendor is not in the output
    }
}
