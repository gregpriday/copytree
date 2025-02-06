<?php

// tests/Unit/Transforms/BaseTransformerTest.php

namespace Tests\Unit\Transforms;

use App\Transforms\BaseTransformer;
use Illuminate\Cache\ArrayStore;
use Illuminate\Cache\Repository;
use Illuminate\Container\Container;
use Illuminate\Support\Facades\Facade;
use PHPUnit\Framework\TestCase;
use Symfony\Component\Finder\SplFileInfo;

class TestTransformer extends BaseTransformer
{
    // Expose the protected cacheTransformResult method.
    public function publicCacheTransformResult(SplFileInfo $file, callable $callback): string
    {
        return $this->cacheTransformResult($file, $callback);
    }
}

class BaseTransformerTest extends TestCase
{
    protected string $tempFile;

    protected function setUp(): void
    {
        parent::setUp();

        // Set up a minimal container and bind a cache repository.
        $container = new Container;
        Facade::setFacadeApplication($container);
        $container->singleton('cache', function () {
            return new Repository(new ArrayStore);
        });

        // Clear any previous cache data.
        $container->make('cache')->flush();

        // Create a temporary file.
        $this->tempFile = tempnam(sys_get_temp_dir(), 'bt_test_');
        file_put_contents($this->tempFile, 'initial content');
    }

    protected function tearDown(): void
    {
        if (file_exists($this->tempFile)) {
            unlink($this->tempFile);
        }
        parent::tearDown();
    }

    public function test_cache_transform_result_returns_and_caches_value()
    {
        $transformer = new TestTransformer;
        // Provide full path, empty relative path, and the basename as relative pathname.
        $fileInfo = new SplFileInfo($this->tempFile, '', basename($this->tempFile));
        $callCount = 0;
        $callback = function () use (&$callCount) {
            $callCount++;

            return 'transformed value';
        };

        // First call: callback should be executed.
        $result1 = $transformer->publicCacheTransformResult($fileInfo, $callback);
        $this->assertEquals('transformed value', $result1);
        $this->assertEquals(1, $callCount, 'Callback should be called once on first execution.');

        // Second call: file unchanged, so cache hit; callback not called again.
        $result2 = $transformer->publicCacheTransformResult($fileInfo, $callback);
        $this->assertEquals('transformed value', $result2);
        $this->assertEquals(1, $callCount, 'Callback should not be called again due to caching.');
    }

    public function test_cache_invalidates_when_file_changes()
    {
        $transformer = new TestTransformer;
        $fileInfo = new SplFileInfo($this->tempFile, '', basename($this->tempFile));
        $callCount = 0;
        $callback = function () use (&$callCount) {
            $callCount++;

            return 'value '.$callCount;
        };

        // Call once to cache the result.
        $result1 = $transformer->publicCacheTransformResult($fileInfo, $callback);
        $this->assertEquals('value 1', $result1);
        $this->assertEquals(1, $callCount);

        // Change the file content (which changes its MD5 hash).
        file_put_contents($this->tempFile, 'modified content');

        // Calling again should trigger the callback because the cache is invalidated.
        $result2 = $transformer->publicCacheTransformResult($fileInfo, $callback);
        $this->assertEquals('value 2', $result2);
        $this->assertEquals(2, $callCount, 'Callback should be called again after file modification.');
    }

    public function test_cache_transform_result_with_invalid_file_executes_callback()
    {
        $transformer = new TestTransformer;
        // Create a SplFileInfo for a non-existent file.
        $nonExistentPath = '/non/existent/path.txt';
        $nonExistent = new SplFileInfo($nonExistentPath, '', basename($nonExistentPath));
        $callbackCalled = false;
        $callback = function () use (&$callbackCalled) {
            $callbackCalled = true;

            return 'fallback';
        };

        $result = $transformer->publicCacheTransformResult($nonExistent, $callback);
        $this->assertEquals('fallback', $result);
        $this->assertTrue($callbackCalled, 'Callback should execute when file is invalid.');
    }
}
