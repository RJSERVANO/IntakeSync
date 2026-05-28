<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private string $indexName = 'hydration_entries_user_client_uuid_unique';

    public function up(): void
    {
        Schema::table('hydration_entries', function (Blueprint $table) {
            if (!Schema::hasColumn('hydration_entries', 'client_uuid')) {
                $table->string('client_uuid')->nullable()->after('id');
            }
        });

        if (!$this->hasIndex()) {
            Schema::table('hydration_entries', function (Blueprint $table) {
                $table->unique(['user_id', 'client_uuid'], $this->indexName);
            });
        }
    }

    public function down(): void
    {
        Schema::table('hydration_entries', function (Blueprint $table) {
            if ($this->hasIndex()) {
                $table->dropUnique($this->indexName);
            }

            if (Schema::hasColumn('hydration_entries', 'client_uuid')) {
                $table->dropColumn('client_uuid');
            }
        });
    }

    private function hasIndex(): bool
    {
        $result = DB::selectOne(
            'SELECT COUNT(*) AS aggregate
             FROM INFORMATION_SCHEMA.STATISTICS
             WHERE TABLE_SCHEMA = DATABASE()
               AND TABLE_NAME = ?
               AND INDEX_NAME = ?',
            ['hydration_entries', $this->indexName]
        );

        return (int) ($result->aggregate ?? 0) > 0;
    }
};
