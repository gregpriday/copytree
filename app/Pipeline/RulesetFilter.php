<?php

namespace App\Pipeline;

use Symfony\Component\Finder\SplFileInfo;

class RulesetFilter
{
    /**
     * @var array[]  Each element is a rule set (an array of rule triples) for inclusion.
     */
    protected array $rules = [];

    /**
     * @var array[]  Each element is a rule set (an array of rule triples) that if matched will force exclusion.
     */
    protected array $globalExcludeRules = [];

    /**
     * The "always" block with two keys:
     *   - include: an array of glob patterns that, if matched, always include the file.
     *   - exclude: an array of glob patterns that, if matched, always exclude the file.
     */
    protected array $always = [
        'include' => [],
        'exclude' => [],
    ];

    /**
     * Create a new RulesetFilter instance.
     *
     * @param array $rules              The include rule sets (from the "rules" property).
     * @param array $globalExcludeRules The global exclude rule sets.
     * @param array $always             An array with keys "include" and "exclude" (each an array of glob patterns).
     */
    public function __construct(array $rules = [], array $globalExcludeRules = [], array $always = [])
    {
        $this->rules = $rules;
        $this->globalExcludeRules = $globalExcludeRules;
        if (isset($always['include']) && is_array($always['include'])) {
            $this->always['include'] = $always['include'];
        }
        if (isset($always['exclude']) && is_array($always['exclude'])) {
            $this->always['exclude'] = $always['exclude'];
        }
    }

    /**
     * Determine whether a given file should be accepted.
     *
     * The algorithm is as follows:
     * 1. If the file’s relative path (via Finder) matches any always‑exclude pattern, reject.
     * 2. If it matches any always‑include pattern, accept immediately.
     * 3. Then, if any global exclude rule set evaluates true for the file, reject.
     * 4. Finally, if include rules exist, the file must match at least one include rule set; if not, reject.
     *    (If no include rules exist, the file is accepted.)
     *
     * @param SplFileInfo $file
     * @return bool
     */
    public function accept(SplFileInfo $file): bool
    {
        $relativePath = $file->getRelativePathname();

        // 1. Always‑exclude: if the file matches any pattern, immediately reject.
        foreach ($this->always['exclude'] as $pattern) {
            if ($this->matchesPattern($relativePath, $pattern)) {
                return false;
            }
        }

        // 2. Always‑include: if the file matches any pattern, accept immediately.
        foreach ($this->always['include'] as $pattern) {
            if ($this->matchesPattern($relativePath, $pattern)) {
                return true;
            }
        }

        // 3. Global exclude rules: if any rule set matches, reject the file.
        foreach ($this->globalExcludeRules as $ruleSet) {
            if ($this->evaluateRuleSet($file, $ruleSet)) {
                return false;
            }
        }

        // 4. Include rules: if there are no include rules, accept the file.
        if (empty($this->rules)) {
            return true;
        }

        // Otherwise, accept if the file satisfies at least one include rule set.
        foreach ($this->rules as $ruleSet) {
            if ($this->evaluateRuleSet($file, $ruleSet)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Evaluate a rule set (an array of rule triples) against the file.
     * Every rule in the rule set must evaluate true for the set to match.
     *
     * @param SplFileInfo $file
     * @param array       $ruleSet An array of rule triples, e.g. [ [field, operator, value], ... ]
     * @return bool
     */
    protected function evaluateRuleSet(SplFileInfo $file, array $ruleSet): bool
    {
        foreach ($ruleSet as $rule) {
            if (!$this->evaluateRule($file, $rule)) {
                return false;
            }
        }
        return true;
    }

    /**
     * Evaluate a single rule against the file.
     *
     * A rule is defined as a triple: [field, operator, value].
     * Supported fields: folder, path, dirname, basename, extension, filename, contents, contents_slice, size, mtime, mimeType.
     * Supported operators include: "=", "!=", ">", ">=", "<", "<=", "oneOf", "regex", "glob", "fnmatch", "contains", "startsWith", "endsWith".
     *
     * @param SplFileInfo $file
     * @param array       $rule
     * @return bool
     */
    protected function evaluateRule(SplFileInfo $file, array $rule): bool
    {
        list($field, $operator, $value) = $rule;
        $fieldValue = $this->getFieldValue($file, $field);

        switch ($operator) {
            case '=':
                return $fieldValue == $value;
            case '!=':
                return $fieldValue != $value;
            case '>':
                return $fieldValue > $value;
            case '>=':
                return $fieldValue >= $value;
            case '<':
                return $fieldValue < $value;
            case '<=':
                return $fieldValue <= $value;
            case 'oneOf':
                return is_array($value) && in_array($fieldValue, $value);
            case 'regex':
                return is_string($value) && preg_match($value, $fieldValue) === 1;
            case 'glob':
            case 'fnmatch':
                return fnmatch($value, $fieldValue);
            case 'contains':
                return is_string($fieldValue) && strpos($fieldValue, $value) !== false;
            case 'startsWith':
                return is_string($fieldValue) && strpos($fieldValue, $value) === 0;
            case 'endsWith':
                return is_string($fieldValue) && substr($fieldValue, -strlen($value)) === $value;
            default:
                // Unsupported operator
                return false;
        }
    }

    /**
     * Retrieve the value for a given field from the file.
     *
     * Uses the Finder SplFileInfo methods where possible.
     *
     * @param SplFileInfo $file
     * @param string      $field
     * @return mixed
     */
    protected function getFieldValue(SplFileInfo $file, string $field)
    {
        switch ($field) {
            case 'folder':
                return $file->getRelativePath();
            case 'path':
                return $file->getRelativePathname();
            case 'dirname':
                return dirname($file->getRelativePathname());
            case 'basename':
                return $file->getBasename();
            case 'extension':
                return $file->getExtension();
            case 'filename':
                return $file->getFilename();
            case 'contents':
                return file_get_contents($file->getRealPath());
            case 'contents_slice':
                return substr(file_get_contents($file->getRealPath()), 0, 256);
            case 'size':
                return $file->getSize();
            case 'mtime':
                return $file->getMTime();
            case 'mimeType':
                return mime_content_type($file->getRealPath());
            default:
                return null;
        }
    }

    /**
     * Check if a given file path matches a glob pattern.
     *
     * @param string $path    The relative file path.
     * @param string $pattern The glob pattern.
     * @return bool
     */
    protected function matchesPattern(string $path, string $pattern): bool
    {
        return fnmatch($pattern, $path);
    }
}
