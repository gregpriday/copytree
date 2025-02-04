<?php

namespace App\Services;

use GuzzleHttp\Client;
use GuzzleHttp\HandlerStack;
use GuzzleHttp\Pool;
use GuzzleHttp\Psr7\Request;
use GuzzleRetry\GuzzleRetryMiddleware;
use RuntimeException;
use SplFileInfo;

class JinaCodeSearch
{
    /**
     * The HTTP client.
     *
     * @var Client|null
     */
    protected ?Client $client = null;

    /**
     * Jina API key.
     *
     * @var string
     */
    protected string $apiKey;

    /**
     * Model to use for reranking.
     *
     * @var string
     */
    protected string $model = 'jina-reranker-v2-base-multilingual';

    /**
     * Jina API endpoint.
     *
     * @var string
     */
    protected string $apiEndpoint = 'https://api.jina.ai/v1/rerank';

    /**
     * Maximum length for a file preview.
     *
     * @var int
     */
    protected int $previewLength;

    /**
     * Number of files to process per API call.
     *
     * @var int
     */
    protected int $chunkSize;

    /**
     * Minimum relevance score to consider a file acceptable.
     *
     * @var float
     */
    protected float $relevancyCutoff;

    /**
     * Create a new JinaCodeSearch instance.
     *
     * @param int   $previewLength   Maximum number of characters for a file preview (default: 1000).
     * @param int   $chunkSize       Number of files per API call (default: 20).
     * @param float $relevancyCutoff Minimum relevance score to pass (default: 0.8).
     *
     * @throws RuntimeException If configuration file or API key is missing.
     */
    public function __construct(
        int $previewLength = 1000,
        int $chunkSize = 20,
        float $relevancyCutoff = 0.8
    ) {
        $this->previewLength   = $previewLength;
        $this->chunkSize       = $chunkSize;
        $this->relevancyCutoff = $relevancyCutoff;

        $this->loadConfiguration();
        $this->initializeClientWithRetry();
    }

    /**
     * Load configuration from a custom .env file.
     *
     * Expects the Jina API key to be defined as "JINA_API_KEY" in ~/.copytree/.env.
     *
     * @throws RuntimeException If the configuration file or API key is missing.
     */
    protected function loadConfiguration(): void
    {
        $homeDir = PHP_OS_FAMILY === 'Windows' ? getenv('USERPROFILE') : getenv('HOME');
        $envPath = $homeDir . DIRECTORY_SEPARATOR . '.copytree' . DIRECTORY_SEPARATOR . '.env';

        if (!file_exists($envPath)) {
            throw new RuntimeException("Jina.ai configuration file not found at {$envPath}");
        }

        $env = parse_ini_file($envPath);

        if (!isset($env['JINA_API_KEY'])) {
            throw new RuntimeException('Jina.ai API key not found in configuration');
        }

        $this->apiKey = $env['JINA_API_KEY'];
    }

    /**
     * Initialize the HTTP client with retry middleware.
     */
    protected function initializeClientWithRetry(): void
    {
        $stack = HandlerStack::create();
        $stack->push(GuzzleRetryMiddleware::factory([
            'max_retry_attempts' => 3,
            'retry_on_status'      => [429, 503, 500],
            'default_retry_multiplier' => 2.0,
        ]));

        $this->client = new Client([
            'base_uri' => $this->apiEndpoint,
            'handler'  => $stack,
            'headers'  => [
                'Authorization' => 'Bearer ' . $this->apiKey,
                'Content-Type'  => 'application/json',
            ],
        ]);
    }

    /**
     * Set the model used for reranking.
     *
     * @param string $model The model identifier.
     */
    public function setModel(string $model): void
    {
        $this->model = $model;
    }

    /**
     * Set a custom API endpoint.
     *
     * @param string $endpoint The API endpoint URL.
     */
    public function setApiEndpoint(string $endpoint): void
    {
        $this->apiEndpoint = $endpoint;
        $this->initializeClientWithRetry();
    }

    /**
     * Search through files based on a natural language query.
     *
     * @param array  $files Array of files to search through. Each element should be an
     *                      associative array with keys:
     *                      - 'path': The relative file path.
     *                      - 'file': An instance of SplFileInfo.
     * @param string $query Natural language search query.
     *
     * @return array{files: array, total_tokens: int} Ranked files and token usage info.
     *
     * @throws RuntimeException If no files are provided.
     */
    public function searchFiles(array $files, string $query): array
    {
        if (empty($files)) {
            throw new RuntimeException('No files provided for searching');
        }

        // Prepare documents for reranking.
        $documents = array_map(function ($file) {
            return [
                'original' => $file,
                'content'  => $this->getFileContent($file['file'], $file['path']),
            ];
        }, $files);

        // Split documents into chunks to avoid exceeding token limits.
        $chunks = array_chunk($documents, $this->chunkSize);
        $results = [];
        $totalTokens = 0;

        // Create requests for each chunk.
        $requests = function () use ($chunks, $query) {
            foreach ($chunks as $chunk) {
                yield new Request(
                    'POST',
                    '',
                    ['Content-Type' => 'application/json'],
                    json_encode([
                        'model'     => $this->model,
                        'query'     => $query,
                        'documents' => array_column($chunk, 'content'),
                        'top_n'     => count($chunk),
                    ])
                );
            }
        };

        // Process the requests in parallel.
        $pool = new Pool($this->client, $requests(), [
            'concurrency' => 5,
            'fulfilled'   => function ($response, $index) use (&$results, &$totalTokens, $chunks) {
                $data = json_decode($response->getBody()->getContents(), true);
                $totalTokens += $data['usage']['total_tokens'] ?? 0;

                // Map the results back to original files.
                foreach ($data['results'] as $result) {
                    $chunkIndex = $result['index'];
                    $originalFile = $chunks[$index][$chunkIndex]['original'];
                    $results[] = [
                        'file'            => $originalFile,
                        'relevance_score' => $result['relevance_score'],
                    ];
                }
            },
            'rejected'    => function ($reason) {
                throw new RuntimeException('Jina.ai API request failed: ' . $reason->getMessage());
            },
        ]);

        $pool->promise()->wait();

        // Sort results by relevance score (highest first).
        usort($results, fn($a, $b) => $b['relevance_score'] <=> $a['relevance_score']);

        // Prepare final output by mapping results.
        $formattedResults = array_map(function ($result) {
            return [
                'file'            => $result['file']['path'],
                'relevance_score' => $result['relevance_score'],
                'above_threshold' => $result['relevance_score'] >= $this->relevancyCutoff,
            ];
        }, $results);

        return [
            'files'        => $formattedResults,
            'total_tokens' => $totalTokens,
        ];
    }

    /**
     * Get file content with the file path as context.
     *
     * Reads the file content, truncates it to the preview length, and
     * prefixes it with the file’s relative path.
     *
     * @param SplFileInfo $file The file to read.
     * @param string      $path The relative file path.
     *
     * @return string The formatted file content.
     *
     * @throws RuntimeException If the file cannot be read.
     */
    private function getFileContent(SplFileInfo $file, string $path): string
    {
        try {
            $content = file_get_contents($file->getPathname());
            $preview = mb_substr($content, 0, $this->previewLength);
            return "File Path: {$path}\n\nContent:\n{$preview}";
        } catch (\Exception $e) {
            throw new RuntimeException("Failed to read file {$path}: " . $e->getMessage());
        }
    }
}
