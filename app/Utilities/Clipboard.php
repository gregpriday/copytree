<?php

namespace App\Utilities;

use RuntimeException;
use Symfony\Component\Process\Exception\ProcessFailedException;
use Symfony\Component\Process\Process;

class Clipboard
{
    private string $contents;

    private bool $isFilePath = false;

    public function __construct()
    {
        if (stripos(php_uname(), 'Darwin') === false) {
            throw new RuntimeException('This package only supports MacOS.');
        }
    }

    public function copy(string $contents, bool $isFilePath = false): void
    {
        $this->contents = $contents;
        $this->isFilePath = $isFilePath;

        if ($this->isFilePath) {
            $this->copyFileReference();
        } else {
            $this->copyTextContent();
        }
    }

    private function copyFileReference(): void
    {
        $command = sprintf(
            'osascript -e \'set aFile to POSIX file "%s"
            tell app "Finder" to set the clipboard to aFile\'',
            str_replace('"', '\"', $this->contents)
        );

        $process = Process::fromShellCommandline($command);
        $process->setWorkingDirectory(getcwd() ?: sys_get_temp_dir());
        $process->run();

        if (! $process->isSuccessful()) {
            throw new ProcessFailedException($process);
        }
    }

    private function copyTextContent(): void
    {
        $process = Process::fromShellCommandline('pbcopy');
        $process->setInput($this->contents);
        $process->setWorkingDirectory(getcwd() ?: sys_get_temp_dir());
        $process->run();

        if (! $process->isSuccessful()) {
            throw new ProcessFailedException($process);
        }
    }
}
