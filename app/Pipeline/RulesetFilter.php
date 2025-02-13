<?php

namespace App\Pipeline;

use Illuminate\Support\Arr;
use Illuminate\Support\Str;
use Symfony\Component\Finder\SplFileInfo;

class RulesetFilter
{
    /**
     * @var array[] Each element is a rule set (an array of rule triples) for inclusion.
     */
    protected array $rules = [];

    /**
     * @var array[] Each element is a rule set (an array of rule triples) that if matched will force exclusion.
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
     * @param  array  $rules  The include rule sets (from the "rules" property).
     * @param  array  $globalExcludeRules  The global exclude rule sets.
     * @param  array  $always  An array with keys "include" and "exclude" (each an array of glob patterns).
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
     * @param  array  $ruleSet  An array of rule triples, e.g. [ [field, operator, value], ... ]
     */
    protected function evaluateRuleSet(SplFileInfo $file, array $ruleSet): bool
    {
        foreach ($ruleSet as $rule) {
            if (! $this->evaluateRule($file, $rule)) {
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
     * Supported operators include basic comparisons ("=", "!=", ">", ">=", "<", "<="),
     * string operations ("oneOf", "regex", "glob", "fnmatch", "contains", "startsWith", "endsWith"),
     * and now also any of the above with suffixes "Any" or "All". Additionally, if the operator starts with "not"
     * (followed by a capital letter), the result is negated.
     */
    protected function evaluateRule(SplFileInfo $file, array $rule): bool
    {
        [$field, $operator, $value] = $rule;
        $fieldValue = $this->getFieldValue($file, $field);

        return $this->evaluateOperator($fieldValue, $operator, $value);
    }

    /**
     * Evaluate an operator against a field value.
     *
     * This method supports modifiers encoded in the operator string:
     * - If the operator starts with "not" (followed by a capital letter), the result is negated.
     * - If the operator ends with "Any", then if $value is an array, it returns true if any element
     *   of $value satisfies the base operator.
     * - If the operator ends with "All", then it returns true only if all elements satisfy the base operator.
     *
     * @param  mixed  $fieldValue  The value from the file.
     * @param  string  $operator  The operator string.
     * @param  mixed  $value  The value to compare against.
     * @return bool The result of the evaluation.
     */
    protected function evaluateOperator($fieldValue, string $operator, $value): bool
    {
        $negate = false;
        // Check for "not" prefix if followed by a capital letter.
        if (str_starts_with($operator, 'not') && isset($operator[3]) && ctype_upper($operator[3])) {
            $negate = true;
            $operator = substr($operator, 3);
            $operator = lcfirst($operator);
        }

        // Check for "Any" or "All" suffix.
        $suffix = null;
        if (str_ends_with($operator, 'Any')) {
            $suffix = 'Any';
            $operator = substr($operator, 0, -3);
            $operator = lcfirst($operator);
        } elseif (str_ends_with($operator, 'All')) {
            $suffix = 'All';
            $operator = substr($operator, 0, -3);
            $operator = lcfirst($operator);
        }

        // If $value is an array and a suffix was detected, apply the base operator to each element.
        if (is_array($value) && $suffix !== null) {
            if ($suffix === 'Any') {
                $result = false;
                foreach (Arr::wrap($value) as $item) {
                    if ($this->evaluateOperator($fieldValue, $operator, $item)) {
                        $result = true;
                        break;
                    }
                }
            } elseif ($suffix === 'All') {
                $result = true;
                foreach (Arr::wrap($value) as $item) {
                    if (! $this->evaluateOperator($fieldValue, $operator, $item)) {
                        $result = false;
                        break;
                    }
                }
            }
        } else {
            $result = $this->evaluateSimpleOperator($fieldValue, $operator, $value);
        }

        return $negate ? ! $result : $result;
    }

    /**
     * Evaluate a basic operator (without any "not", "Any", or "All" modifiers).
     *
     * @param  mixed  $fieldValue
     * @param  mixed  $value
     */
    protected function evaluateSimpleOperator($fieldValue, string $operator, $value): bool
    {
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
                return in_array($fieldValue, Arr::wrap($value));
            case 'regex':
                return is_string($value) && preg_match($value, $fieldValue) === 1;
            case 'glob':
            case 'fnmatch':
                return fnmatch($value, $fieldValue);
            case 'contains':
                return strpos($fieldValue, $value) !== false;
            case 'startsWith':
                return Str::startsWith($fieldValue, $value);
            case 'endsWith':
                return Str::endsWith($fieldValue, $value);
            default:
                // Fallback to using the Str facade method.
                return Str::{$operator}($fieldValue, $value);
        }
    }

    /**
     * Retrieve the value for a given field from the file.
     *
     * Uses the Finder SplFileInfo methods where possible.
     *
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
     * @param  string  $path  The relative file path.
     * @param  string  $pattern  The glob pattern.
     */
    protected function matchesPattern(string $path, string $pattern): bool
    {
        return fnmatch($pattern, $path);
    }
}
