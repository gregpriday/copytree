<?php

namespace App\Commands;

use App\Services\ConfigValidator;
use InvalidArgumentException;
use LaravelZero\Framework\Commands\Command;

class ConfigValidateCommand extends Command
{
    /**
     * The signature of the command.
     *
     * @var string
     */
    protected $signature = 'config:validate {section? : Specific config section to validate (ai, logging, state)}';

    /**
     * The description of the command.
     *
     * @var string
     */
    protected $description = 'Validate the application configuration';

    /**
     * Execute the console command.
     */
    public function handle(ConfigValidator $validator): int
    {
        $section = $this->argument('section');

        try {
            if ($section) {
                $this->validateSection($validator, $section);
            } else {
                $this->info('Validating all configuration sections...');
                $validator->validateApplicationConfig();
                $this->info('✓ All configuration sections are valid.');
            }

            return self::SUCCESS;
        } catch (InvalidArgumentException $e) {
            $this->error('Configuration validation failed: '.$e->getMessage());

            return self::FAILURE;
        }
    }

    /**
     * Validate a specific configuration section.
     *
     * @throws InvalidArgumentException If section is invalid or validation fails
     */
    private function validateSection(ConfigValidator $validator, string $section): void
    {
        switch ($section) {
            case 'ai':
                $this->info('Validating AI configuration...');
                $validator->validateAiConfig(config('ai'));
                $this->info('✓ AI configuration is valid.');
                break;

            case 'logging':
                $this->info('Validating logging configuration...');
                $validator->validateLoggingConfig(config('logging'));
                $this->info('✓ Logging configuration is valid.');
                break;

            case 'state':
                $this->info('Validating state configuration...');
                $validator->validateStateConfig(config('state'));
                $this->info('✓ State configuration is valid.');
                break;

            default:
                throw new InvalidArgumentException("Unknown configuration section: {$section}");
        }
    }
}
