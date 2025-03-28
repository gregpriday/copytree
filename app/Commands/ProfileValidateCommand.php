<?php

namespace App\Commands;

use App\Profiles\ProfileLoader;
use App\Transforms\FileTransformerInterface;
use Illuminate\Support\Facades\File;
use LaravelZero\Framework\Commands\Command;
use Symfony\Component\Yaml\Exception\ParseException;
use Symfony\Component\Yaml\Yaml;
use RuntimeException;

class ProfileValidateCommand extends Command
{
    /**
     * The signature of the command.
     *
     * @var string
     */
    protected $signature = 'profile:validate
        {name? : The name of the profile to validate (e.g., "laravel", "default"). If omitted, validates all profiles.}';

    /**
     * The description of the command.
     *
     * @var string
     */
    protected $description = 'Validates the syntax and structure of one or all CopyTree profiles.';

    /**
     * Execute the console command.
     *
     * @return int
     */
    public function handle(): int
    {
        $projectPath = getcwd();
        
        $profileName = $this->argument('name');
        $profilesToValidate = [];
        $validationResults = [];
        $overallStatus = self::SUCCESS;

        if ($profileName) {
            // Validate a single profile
            $profilePath = $this->findProfilePath($profileName);
            if (!$profilePath) {
                $this->error("Profile '{$profileName}' not found.");
                return self::FAILURE;
            }
            $profilesToValidate[$profileName] = $profilePath;
            $this->info("Validating profile: {$profileName} ({$this->getRelativePath($profilePath)})");
        } else {
            // Validate all profiles
            $this->info("Validating all available profiles...");
            $profilesToValidate = $this->findAllProfiles();
            if (empty($profilesToValidate)) {
                $this->info('No profiles found to validate.');
                return self::SUCCESS;
            }
        }

        foreach ($profilesToValidate as $name => $path) {
            $errors = $this->validateProfile($path);
            $status = empty($errors) ? '<fg=green>Valid</>' : '<fg=red>Invalid</>';
            $errorText = empty($errors) ? '' : implode("\n", $errors);
            
            $validationResults[] = [
                'Name' => $name,
                'Path' => $this->getRelativePath($path),
                'Status' => $status,
                'Errors' => $errorText,
            ];
            
            if (!empty($errors)) {
                $overallStatus = self::FAILURE;
            }
        }

        // Display results in a table
        $this->table(
            ['Name', 'Path', 'Status', 'Errors'],
            $validationResults
        );

        if ($overallStatus === self::SUCCESS) {
            $this->info('All validated profiles are valid.');
        } else {
            $this->error('One or more profiles contain errors.');
        }

        return $overallStatus;
    }

    /**
     * Finds the path for a single profile name.
     * Uses logic similar to ProfileGuesser.
     */
    protected function findProfilePath(string $profileName): ?string
    {
        $projectPath = getcwd();
        $possibleExtensions = ['yaml', 'yml'];

        // 1. Check project's .ctree directory
        $projectCtreeDir = $projectPath . DIRECTORY_SEPARATOR . '.ctree';
        foreach ($possibleExtensions as $ext) {
            $path = $projectCtreeDir . DIRECTORY_SEPARATOR . $profileName . '.' . $ext;
            if (File::exists($path)) {
                return realpath($path);
            }
        }

        // 2. Check built-in profiles directory
        $builtinProfilesDir = base_path('profiles');
        foreach ($possibleExtensions as $ext) {
            $path = $builtinProfilesDir . DIRECTORY_SEPARATOR . $profileName . '.' . $ext;
            if (File::exists($path)) {
                return realpath($path);
            }
        }

        // 3. Check test profiles directory
        $testProfilesDir = base_path('tests/Fixtures/profiles');
        foreach ($possibleExtensions as $ext) {
            $path = $testProfilesDir . DIRECTORY_SEPARATOR . $profileName . '.' . $ext;
            if (File::exists($path)) {
                return realpath($path);
            }
        }

        return null;
    }

    /**
     * Finds all available profiles (project-specific and built-in).
     * Adapts logic from ProfileListCommand.
     * Returns an associative array [name => path].
     */
    protected function findAllProfiles(): array
    {
        $profiles = [];
        $projectPath = getcwd();

        // --- Find Project-Specific Profiles (.ctree) ---
        $projectCtreeDir = $projectPath . DIRECTORY_SEPARATOR . '.ctree';
        if (File::isDirectory($projectCtreeDir)) {
            $projectProfileFiles = array_merge(
                glob($projectCtreeDir . DIRECTORY_SEPARATOR . '*.yaml'),
                glob($projectCtreeDir . DIRECTORY_SEPARATOR . '*.yml')
            );
            foreach ($projectProfileFiles as $filePath) {
                $profileName = pathinfo($filePath, PATHINFO_FILENAME);
                $profiles[$profileName] = realpath($filePath);
            }
        }

        // --- Find Built-in Profiles (profiles directory) ---
        $builtinProfilesDir = base_path('profiles');
        if (File::isDirectory($builtinProfilesDir)) {
            $builtinProfileFiles = array_merge(
                glob($builtinProfilesDir . DIRECTORY_SEPARATOR . '*.yaml'),
                glob($builtinProfilesDir . DIRECTORY_SEPARATOR . '*.yml')
            );
            foreach ($builtinProfileFiles as $filePath) {
                $profileName = pathinfo($filePath, PATHINFO_FILENAME);
                if (!isset($profiles[$profileName])) { // Project profiles override built-in
                    $profiles[$profileName] = realpath($filePath);
                }
            }
        }

         // --- Find Test Profiles ---
        $testProfilesDir = base_path('tests/Fixtures/profiles');
        if (File::isDirectory($testProfilesDir)) {
            $testProfileFiles = array_merge(
                glob($testProfilesDir . DIRECTORY_SEPARATOR . '*.yaml'),
                glob($testProfilesDir . DIRECTORY_SEPARATOR . '*.yml')
            );
            foreach ($testProfileFiles as $filePath) {
                $profileName = pathinfo($filePath, PATHINFO_FILENAME);
                if (!isset($profiles[$profileName])) {
                    $profiles[$profileName] = realpath($filePath);
                }
            }
        }

        ksort($profiles);
        return $profiles;
    }

    /**
     * Validates a single profile file.
     * Returns an array of error messages, empty if valid.
     */
    protected function validateProfile(string $profilePath): array
    {
        $errors = [];
        $profileData = null;

        // 1. YAML Syntax and Basic Loading (including 'extends')
        try {
            // Load profile data recursively to validate the full merged profile
            $profileData = $this->loadProfileDataRecursive($profilePath);
        } catch (ParseException $e) {
            $errors[] = "Invalid YAML syntax: " . $e->getMessage();
            return $errors; // Stop validation if YAML is broken
        } catch (RuntimeException $e) {
            // Catches circular extends or missing extends files
            $errors[] = "Loading error: " . $e->getMessage();
            return $errors; // Stop validation on loading errors
        } catch (\Exception $e) {
            $errors[] = "Unexpected error loading profile: " . $e->getMessage();
            return $errors;
        }

        // 2. Schema Validation (Manual Checks)
        $validKeys = ['include', 'exclude', 'always', 'transforms', 'external', 'extends', 'name', 'description'];
        foreach (array_keys($profileData) as $key) {
            if (!in_array($key, $validKeys)) {
                $errors[] = "Unknown top-level key found: '{$key}'. Valid keys are: " . implode(', ', $validKeys);
            }
        }

        foreach (['include', 'exclude', 'always'] as $key) {
            if (isset($profileData[$key]) && !is_array($profileData[$key])) {
                $errors[] = "Key '{$key}' must be a list (array) of strings.";
            } elseif (isset($profileData[$key])) {
                foreach ($profileData[$key] as $index => $item) {
                    if (!is_string($item)) {
                        $errors[] = "Item #{$index} in '{$key}' list must be a string (glob pattern or path).";
                    }
                }
            }
        }

        // 3. Transforms Validation
        if (isset($profileData['transforms'])) {
            if (!is_array($profileData['transforms'])) {
                $errors[] = "Key 'transforms' must be a list of transform configurations.";
            } else {
                foreach ($profileData['transforms'] as $index => $transformConfig) {
                    if (!is_array($transformConfig)) {
                        $errors[] = "Transform configuration #{$index} must be a map (key-value pairs).";
                        continue;
                    }
                    if (!isset($transformConfig['files'])) {
                        $errors[] = "Transform configuration #{$index} is missing the required 'files' key.";
                    } elseif (!is_string($transformConfig['files']) && !is_array($transformConfig['files'])) {
                        $errors[] = "Transform configuration #{$index}: 'files' key must be a string or a list of strings.";
                    } elseif (is_array($transformConfig['files'])) {
                        foreach($transformConfig['files'] as $fIndex => $filePattern) {
                            if (!is_string($filePattern)) {
                                $errors[] = "Transform configuration #{$index}: Item #{$fIndex} in 'files' list must be a string.";
                            }
                        }
                    }

                    if (!isset($transformConfig['type'])) {
                        $errors[] = "Transform configuration #{$index} is missing the required 'type' key.";
                    } elseif (!is_string($transformConfig['type'])) {
                        $errors[] = "Transform configuration #{$index}: 'type' key must be a string.";
                    } else {
                        // Validate transformer type
                        $transformerClass = $transformConfig['type'];
                        if (strpos($transformerClass, '\\') === false && strpos($transformerClass, '.') !== false) {
                            $transformerClass = 'App\\Transforms\\Transformers\\' . str_replace('.', '\\', $transformerClass);
                        }

                        if (!class_exists($transformerClass)) {
                            $errors[] = "Transform configuration #{$index}: Transformer class '{$transformerClass}' not found.";
                        } elseif (!is_subclass_of($transformerClass, FileTransformerInterface::class)) {
                            $errors[] = "Transform configuration #{$index}: Transformer class '{$transformerClass}' must implement FileTransformerInterface.";
                        }
                    }
                }
            }
        }

        // 4. External Sources Validation
        if (isset($profileData['external'])) {
            if (!is_array($profileData['external'])) {
                $errors[] = "Key 'external' must be a list of external source configurations.";
            } else {
                foreach ($profileData['external'] as $index => $externalConfig) {
                    if (!is_array($externalConfig)) {
                        $errors[] = "External source configuration #{$index} must be a map.";
                        continue;
                    }
                    if (!isset($externalConfig['source'])) {
                        $errors[] = "External source #{$index} is missing the required 'source' key.";
                    } elseif (!is_string($externalConfig['source'])) {
                        $errors[] = "External source #{$index}: 'source' key must be a string (URL or path).";
                    }
                    if (!isset($externalConfig['destination'])) {
                        $errors[] = "External source #{$index} is missing the required 'destination' key.";
                    } elseif (!is_string($externalConfig['destination'])) {
                        $errors[] = "External source #{$index}: 'destination' key must be a string.";
                    }
                    if (isset($externalConfig['include']) && !is_array($externalConfig['include'])) {
                        $errors[] = "External source #{$index}: 'include' key must be a list of strings.";
                    } elseif (isset($externalConfig['include'])) {
                        foreach ($externalConfig['include'] as $incIndex => $includePattern) {
                            if (!is_string($includePattern)) {
                                $errors[] = "External source #{$index}: Item #{$incIndex} in 'include' list must be a string.";
                            }
                        }
                    }
                }
            }
        }

        return $errors;
    }

    /**
     * Recursively load profile data, handling extensions.
     * Simplified version of ProfileLoader's logic for validation purposes.
     *
     * @throws RuntimeException If a file is missing, YAML is invalid, or circular dependency.
     */
    private function loadProfileDataRecursive(string $profilePath, array &$loadedPaths = []): array
    {
        $realPath = realpath($profilePath);
        if ($realPath === false || !File::exists($realPath)) {
            throw new RuntimeException("Profile file not found: {$profilePath}");
        }

        if (in_array($realPath, $loadedPaths)) {
            throw new RuntimeException('Circular profile extension detected: ' . implode(' -> ', $loadedPaths) . " -> {$realPath}");
        }
        $loadedPaths[] = $realPath; // Track path to detect circular dependencies

        $yamlContent = File::get($realPath);
        try {
            $data = Yaml::parse($yamlContent);
        } catch (ParseException $e) {
            throw new ParseException("Invalid YAML in profile '{$profilePath}': " . $e->getMessage(), $e->getParsedLine(), $e->getSnippet(), $e->getParsedFile(), $e);
        }

        if (!is_array($data)) {
            throw new RuntimeException("Profile '{$profilePath}' content must be a YAML map (associative array).");
        }

        // Handle 'extends'
        if (isset($data['extends'])) {
            $baseProfileName = $data['extends'];
            // Find the base profile path
            $baseProfilePath = $this->findProfilePath($baseProfileName);
            if (!$baseProfilePath) {
                throw new RuntimeException("Base profile '{$baseProfileName}' extended by '{$profilePath}' not found.");
            }

            // Recursively load base profile data
            $baseData = $this->loadProfileDataRecursive($baseProfilePath, $loadedPaths);

            // Simple merge for validation purposes
            $mergedData = array_merge($baseData, $data);

            // Special handling for list keys
            foreach(['include', 'exclude', 'always', 'transforms', 'external'] as $listKey) {
                if (isset($baseData[$listKey]) || isset($data[$listKey])) {
                    $mergedData[$listKey] = array_merge($baseData[$listKey] ?? [], $data[$listKey] ?? []);
                }
            }

            unset($mergedData['extends']); // Remove extends key after processing
            $data = $mergedData;
        }

        // Pop the current path when returning up the recursion stack
        array_pop($loadedPaths);

        return $data;
    }

    /**
     * Get a relative path for display purposes.
     */
    protected function getRelativePath(string $fullPath): string
    {
        $projectPath = getcwd();
        $basePath = base_path();

        if (str_starts_with($fullPath, $projectPath)) {
            return str_replace($projectPath . DIRECTORY_SEPARATOR, '', $fullPath);
        }
        if (str_starts_with($fullPath, $basePath)) {
            return str_replace($basePath . DIRECTORY_SEPARATOR, '', $fullPath);
        }
        return $fullPath; // Fallback to full path if not relative to project or base
    }
}
