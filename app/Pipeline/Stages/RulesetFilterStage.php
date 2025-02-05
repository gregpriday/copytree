<?php

namespace App\Pipeline\Stages;

use App\Pipeline\FilePipelineStageInterface;
use App\Pipeline\RulesetFilter;
use Symfony\Component\Finder\SplFileInfo;

/**
 * Pipeline stage to filter files based on a unified ruleset.
 *
 * This stage uses a RulesetFilter instance—which consolidates include rule sets,
 * global exclude rules, and always rules—to decide whether each file (a SplFileInfo)
 * should be accepted. Files that pass the filter are forwarded to the next stage.
 */
class RulesetFilterStage implements FilePipelineStageInterface
{
    protected RulesetFilter $rulesetFilter;

    /**
     * Create a new RulesetFilterStage.
     *
     * @param  RulesetFilter  $rulesetFilter  The ruleset filter instance to use.
     */
    public function __construct(RulesetFilter $rulesetFilter)
    {
        $this->rulesetFilter = $rulesetFilter;
    }

    /**
     * Process the file collection by filtering each file according to the ruleset.
     *
     * The process is as follows:
     * 1. For each file (a Symfony Finder SplFileInfo), call the ruleset filter’s accept() method.
     * 2. Only include files that are accepted.
     * 3. Pass the filtered array to the next stage in the pipeline.
     *
     * @param  array  $files  An array of Symfony Finder SplFileInfo objects.
     * @param  \Closure  $next  The next stage in the pipeline.
     * @return array The filtered array of files.
     */
    public function handle(array $files, \Closure $next): array
    {
        $filteredFiles = array_filter($files, function (SplFileInfo $file) {
            return $this->rulesetFilter->accept($file);
        });

        return $next($filteredFiles);
    }
}
