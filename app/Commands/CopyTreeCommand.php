<?php

namespace App\Commands;

use App\Profiles\ProfileGuesser;
use App\Profiles\ProfileLoader;
use App\Pipeline\FileLoader;
use App\Pipeline\Stages\GitFilterStage;
use App\Pipeline\Stages\JinaSearchStage;
use App\Pipeline\Stages\OpenAIFilterStage;
use App\Pipeline\Stages\ExternalSourceStage;
use App\Pipeline\Stages\RulesetFilterStage;
use App\Pipeline\Stages\SortFilesStage;
use App\Services\JinaCodeSearch;
use App\Services\AIFilenameGeneratorService;
use App\Renderer\TreeRenderer;
use App\Renderer\FileOutputRenderer;
use App\Utilities\Clipboard;
use App\Utilities\TempFileManager;
use Illuminate\Pipeline\Pipeline;
use LaravelZero\Framework\Commands\Command;
use Symfony\Component\Finder\SplFileInfo;

class CopyTreeCommand extends Command
{
    /**
     * The signature of the command.
     *
     * @var string
     */
    protected $signature = 'copy
        {path? : The directory path or GitHub URL (default: current working directory)}
        {--d|depth=10 : Maximum depth of the tree.}
        {--l|max-lines=0 : Maximum number of lines to show per file. Use 0 for unlimited.}
        {--t|only-tree : Include only the directory tree in the output, not the file contents.}
        {--p|profile=auto : Profile to apply. Available options: auto, none, etc.}
        {--f|filter=* : Filter files using glob patterns. Can be specified multiple times.}
        {--a|ai-filter=false : Filter files using AI based on a natural language description.}
        {--s|search=false : Search for files using a search query string.}
        {--m|modified : Only include files that have been modified since the last commit.}
        {--c|changes= : Filter for files changed between two commits in format "commit1:commit2".}
        {--o|output? : Outputs to a file. If no filename is provided, creates file in ~/.copytree/files/.}
        {--i|display : Display the output in the console.}
        {--S|stream : Stream output directly (useful for piping).}
        {--r|as-reference : Copy a reference to a temporary file instead of copying the content directly.}
        {--no-cache : Do not use or keep cached GitHub repositories.}
        {--x|profile-docs : Copy the profile documentation from the docs/profiles directory.}';

    /**
     * The description of the command.
     *
     * @var string
     */
    protected $description = 'Copies the structure and optionally the contents of a local directory or GitHub repository to your clipboard or a file. Leverage customizable profiles, glob filters, AI-based file selection, and Git integration to tailor the output for code analysis and sharing with AI assistants.';

    /**
     * Execute the console command.
     */
    public function handle(): int
    {
        // Use the current working directory as the project path.
        $projectPath = $this->argument('path') ?: getcwd();

        // Load the profile configuration.
        $profileGuesser = new ProfileGuesser($projectPath);
        $guessedProfile = $profileGuesser->guess();
        $profilePath = $profileGuesser->getProfilePath($guessedProfile);
        $profileLoader = new ProfileLoader();
        $profileLoader->load($profilePath, [
            'profile'    => $this->option('profile'),
            'filter'     => (array)$this->option('filter'),
            'ai_filter'  => $this->option('ai-filter') !== false ? $this->option('ai-filter') : null,
            'search'     => $this->option('search'),
            'modified'   => $this->option('modified'),
            'changes'    => $this->option('changes'),
            'depth'      => (int)$this->option('depth'),
            'max_lines'  => (int)$this->option('max-lines'),
        ]);

        $this->info('Profile loaded successfully.');

        // Load the initial file set.
        $depth = (int)$this->option('depth');
        $fileLoader = new FileLoader($projectPath);
        $files = $fileLoader->loadFiles($depth);

        // Build the pipeline using Laravel's Pipeline.
        $pipeline = app(Pipeline::class)->send($files);

        // Add Git filtering if requested.
        if ($this->option('modified') || $this->option('changes')) {
            $pipeline->through([
                new GitFilterStage($projectPath, (bool)$this->option('modified'), $this->option('changes'))
            ]);
        }

        // Add AI filtering if requested.
        if ($this->option('ai-filter') !== false) {
            $pipeline->through([
                new OpenAIFilterStage($this->option('ai-filter'))
            ]);
        } elseif ($this->option('search') !== false) {
            // Use Jina search for search queries.
            $jinaService = app(JinaCodeSearch::class);
            $pipeline->through([
                new JinaSearchStage($jinaService, $this->option('search'))
            ]);
        }

        // Add external sources if configured in the profile.
        if (config('profile.external')) {
            $pipeline->through([
                new ExternalSourceStage(config('profile.external'))
            ]);
        }

        // Apply ruleset filtering if configured.
        if (config('profile.rules')) {
            $pipeline->through([
                new RulesetFilterStage(
                    new \App\Pipeline\RulesetFilter(
                        config('profile.rules'),
                        config('profile.global_exclude_rules', []),
                        config('profile.always', [])
                    )
                )
            ]);
        }

        // Always add a sorting stage.
        $pipeline->through([
            new SortFilesStage()
        ]);

        // Execute the pipeline.
        $finalFiles = $pipeline->then(function ($files) {
            return $files;
        });

        // Render the tree view.
        $treeRenderer = new TreeRenderer();
        $treeOutput = $treeRenderer->render($finalFiles);

        // Render file contents output if not in only-tree mode.
        $fileOutput = '';
        if (! $this->option('only-tree')) {
            // Resolve the FileOutputRenderer via the container so that its dependency (FileTransformer) is injected.
            $fileRenderer = app(FileOutputRenderer::class);
            $maxLines = (int)$this->option('max-lines');
            $fileOutput = $fileRenderer->render($finalFiles, $maxLines);
        }

        // Combine the outputs into the final XML.
        $combinedOutput = "<ct:project>\n";
        $combinedOutput .= "<ct:tree>\n{$treeOutput}\n</ct:tree>\n";
        if (! $this->option('only-tree')) {
            $combinedOutput .= "<ct:project_files>\n{$fileOutput}\n</ct:project_files>\n";
        }
        $combinedOutput .= "</ct:project><!-- END OF PROJECT -->\n";

        // Handle output options.
        $outputOption = $this->option('output');
        if ($outputOption !== null) {
            // Determine the desired filename.
            $filename = is_array($outputOption) ? reset($outputOption) : $outputOption;
            if (empty($filename)) {
                // Generate a filename using the AI Filename Generation service.
                $filename = app(AIFilenameGeneratorService::class)->generateFilename(
                    array_map(fn(SplFileInfo $file) => ['path' => $file->getRelativePathname()], $finalFiles),
                    storage_path('app/files')
                );
            }
            // Write output to the file.
            $fullPath = storage_path('app/files') . DIRECTORY_SEPARATOR . $filename;
            file_put_contents($fullPath, $combinedOutput);
            $this->info("Saved output to file: {$fullPath}");
        } elseif ($this->option('display')) {
            // Display the output in the console.
            $this->line($combinedOutput);
        } elseif ($this->option('as-reference')) {
            // Create a temporary file and copy its reference to the clipboard.
            $tempFile = TempFileManager::createTempFile($combinedOutput);
            (new Clipboard())->copy($tempFile, true);
            $this->info("Copied reference to temporary file: {$tempFile}");
        } else {
            // Copy the output directly to the clipboard.
            (new Clipboard())->copy($combinedOutput);
            $this->info("Copied " . count($finalFiles) . " files to clipboard.");
        }

        return self::SUCCESS;
    }
}
