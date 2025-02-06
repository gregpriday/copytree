<?php

namespace Tests;

use App\Commands\CopyTreeCommand;
use LaravelZero\Framework\Testing\TestCase as BaseTestCase;
use Symfony\Component\Console\Application;
use Symfony\Component\Console\Tester\CommandTester; // Adjust the namespace if needed

abstract class TestCase extends BaseTestCase
{
    use CreatesApplication;
    use FilesystemHelperTrait;

    protected CommandTester $commandTester;

    protected function setUp(): void
    {
        parent::setUp();

        // Define a PROJECT_ROOT constant if not already defined
        if (! defined('PROJECT_ROOT')) {
            define('PROJECT_ROOT', realpath(__DIR__.'/../'));
        }

        // Create a new Console Application instance and register the CopyTree command.
        $application = new Application;
        $application->add(new CopyTreeCommand);

        // Retrieve the command by its name. (If your command’s signature is "copy", use that.)
        $command = $application->find('copy');
        $this->commandTester = new CommandTester($command);
    }

    /**
     * A helper assertion to check how many files were copied or saved.
     *
     * This method inspects the command output for phrases such as
     * "Copied X files to clipboard" or "Saved X files to ..." and asserts that
     * the actual count matches the expected count.
     *
     * @param  string  $output  The output from the command.
     * @param  int  $expectedCount  The expected number of files.
     */
    protected function assertFilesCopied(string $output, int $expectedCount): void
    {
        if (preg_match('/Copied (\d+) files to clipboard/', $output, $matches)) {
            $actualCount = (int) $matches[1];
            $this->assertEquals(
                $expectedCount,
                $actualCount,
                "Expected {$expectedCount} files to be copied, but {$actualCount} were copied."
            );
        } elseif (preg_match('/Saved (\d+) files to/', $output, $matches)) {
            $actualCount = (int) $matches[1];
            $this->assertEquals(
                $expectedCount,
                $actualCount,
                "Expected {$expectedCount} files to be saved, but {$actualCount} were saved."
            );
        } else {
            $this->fail("Could not determine the number of files copied/saved from the output: {$output}");
        }
    }

    protected function getFixturesPath(string $subPath = ''): string
    {
        $subPath = ltrim($subPath, '/');

        return __DIR__.'/Fixtures'.($subPath ? '/'.$subPath : '');
    }
}
