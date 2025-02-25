<?php

namespace Tests\Unit\Renderer;

use App\Renderer\SizeReportRenderer;
use App\Transforms\FileTransformer;
use Illuminate\Container\Container;
use Illuminate\Filesystem\Filesystem;
use Illuminate\Support\Facades\Facade;
use PHPUnit\Framework\TestCase;
use Symfony\Component\Console\Output\BufferedOutput;
use Symfony\Component\Finder\SplFileInfo;

/**
 * A dummy transformer that extends FileTransformer and simply returns the file's content.
 */
class DummyTransformer extends FileTransformer
{
    public function __construct()
    {
        parent::__construct([]);
    }

    public function transform(SplFileInfo|string $input): string
    {
        if ($input instanceof SplFileInfo) {
            return file_get_contents($input->getRealPath());
        }
        return (string)$input;
    }
}

class SizeReportRendererTest extends TestCase
{
    /**
     * Holds paths of temporary files created during testing.
     *
     * @var string[]
     */
    private array $tempFiles = [];

    protected function setUp(): void
    {
        parent::setUp();

        // Set up a minimal container for Laravel facades.
        $container = new Container();
        // Bind the 'files' key so that the File facade works.
        $container->singleton('files', function () {
            return new Filesystem();
        });
        Facade::setFacadeApplication($container);
    }

    protected function tearDown(): void
    {
        // Clean up all temporary files.
        foreach ($this->tempFiles as $file) {
            if (file_exists($file)) {
                unlink($file);
            }
        }
        parent::tearDown();
    }

    /**
     * Creates a temporary file with given content and filename.
     *
     * @param string $content The file content.
     * @param string $name    The desired filename.
     * @return string         The full path to the temporary file.
     */
    private function createTempFile(string $content, string $name): string
    {
        $tempDir = sys_get_temp_dir();
        $filePath = $tempDir . DIRECTORY_SEPARATOR . $name;
        file_put_contents($filePath, $content);
        $this->tempFiles[] = $filePath;
        return $filePath;
    }

    public function testRenderGeneratesSizeReport(): void
    {
        // Create two temporary files with known content.
        $content1 = "Line one\nLine two\nLine three";
        $content2 = "Single line content";

        // Create temporary files.
        $file1Path = $this->createTempFile($content1, 'file1.txt');
        $file2Path = $this->createTempFile($content2, 'folder_file2.txt');

        // Create PHPUnit mocks for SplFileInfo.
        $file1Mock = $this->createMock(SplFileInfo::class);
        $file1Mock->method('getRelativePathname')->willReturn('file1.txt');
        $file1Mock->method('getRealPath')->willReturn($file1Path);

        $file2Mock = $this->createMock(SplFileInfo::class);
        $file2Mock->method('getRelativePathname')->willReturn('folder/file2.txt');
        $file2Mock->method('getRealPath')->willReturn($file2Path);

        $files = [$file1Mock, $file2Mock];

        // Instantiate the SizeReportRenderer with our dummy transformer.
        $transformer = new DummyTransformer();
        $renderer = new SizeReportRenderer($transformer);

        // Capture output using BufferedOutput.
        $output = new BufferedOutput();

        // Call render with no limits (0 means unlimited) and a limit of 10 files.
        $renderer->render($files, $output, 0, 0, 10);

        $report = $output->fetch();

        // Adjusted assertion: check for "File Size Report - Total:" without the styling markup.
        $this->assertStringContainsString('File Size Report - Total:', $report);
        $this->assertStringContainsString('file1.txt', $report);
        $this->assertStringContainsString('folder/file2.txt', $report);
        $this->assertStringContainsString('Top', $report);
    }
}
