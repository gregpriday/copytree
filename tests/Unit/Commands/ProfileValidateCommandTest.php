<?php

namespace Tests\Unit\Commands;

use Tests\TestCase;

class ProfileValidateCommandTest extends TestCase
{
    /**
     * Test command functionality integration style.
     */
    public function test_command_integration()
    {
        // This is a basic integration test that verifies the command executes successfully
        $this->artisan('profile:validate')
            ->assertSuccessful();
    }
}
