<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * The database connection that should be used by the migration.
     *
     * @var string
     */
    protected $connection = 'copytree_state';

    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::connection($this->connection)->create('conversation_history', function (Blueprint $table) {
            $table->id(); // Equivalent to INTEGER PRIMARY KEY AUTOINCREMENT
            $table->string('state_key')->notNullable();
            $table->enum('role', ['user', 'model'])->notNullable();
            $table->text('content')->notNullable();
            $table->timestamp('timestamp')->useCurrent(); // DATETIME DEFAULT CURRENT_TIMESTAMP

            // Add indexes
            $table->index('state_key');
            $table->index('timestamp');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::connection($this->connection)->dropIfExists('conversation_history');
    }
};
