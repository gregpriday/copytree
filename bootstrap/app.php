<?php

use LaravelZero\Framework\Application;
use Dotenv\Dotenv;

$basePath = dirname(__DIR__);

// Determine the custom environment folder (expanding "~" using $_SERVER['HOME'])
$envPath = $_SERVER['HOME'] . '/.copytree';

// Manually load the .env file from the custom location if it exists
if (file_exists($envPath . '/.env')) {
    $dotenv = Dotenv::createImmutable($envPath, '.env');
    $dotenv->load();
}

return Application::configure(basePath: $basePath)->create();
