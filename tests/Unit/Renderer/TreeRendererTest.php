<?php

namespace Tests\Unit\Renderer;

use App\Renderer\TreeRenderer;
use Symfony\Component\Finder\SplFileInfo;
use Tests\TestCase;

class TreeRendererTest extends TestCase
{
    public function test_render_tree()
    {
        // Create a mock for a file with the relative path "a.txt"
        $fileA = $this->getMockBuilder(SplFileInfo::class)
            ->disableOriginalConstructor()
            ->onlyMethods(['getRelativePathname'])
            ->getMock();
        $fileA->method('getRelativePathname')->willReturn('a.txt');

        // Create a mock for a file with the relative path "folder/b.txt"
        $fileB = $this->getMockBuilder(SplFileInfo::class)
            ->disableOriginalConstructor()
            ->onlyMethods(['getRelativePathname'])
            ->getMock();
        $fileB->method('getRelativePathname')->willReturn('folder/b.txt');

        // Create a mock for a file with the relative path "folder/subfolder/c.txt"
        $fileC = $this->getMockBuilder(SplFileInfo::class)
            ->disableOriginalConstructor()
            ->onlyMethods(['getRelativePathname'])
            ->getMock();
        $fileC->method('getRelativePathname')->willReturn('folder/subfolder/c.txt');

        // Arrange the files as they should appear in the tree.
        $files = [$fileA, $fileB, $fileC];

        $renderer = new TreeRenderer;
        $output = $renderer->render($files);

        // Expected tree output using ASCII characters and proper indentation.
        $expected = "├── a.txt\n".
            "└── folder\n".
            "    ├── b.txt\n".
            "    └── subfolder\n".
            "        └── c.txt\n";

        $this->assertEquals($expected, $output);
    }
}
