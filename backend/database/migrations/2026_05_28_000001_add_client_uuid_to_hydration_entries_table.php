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
                $column = $table->string('client_uuid')->nullable();
                if (DB::connection()->getDriverName() !== 'sqlite') {
                    $column->after('id');
                }
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
        $driver = DB::connection()->getDriverName();

        if ($driver === 'sqlite') {
            return collect(DB::select("PRAGMA index_list('hydration_entries')"))
                ->contains(fn ($index) => ($index->name ?? null) === $this->indexName);
        }

        if ($driver === 'pgsql') {
            $result = DB::selectOne(
                'SELECT COUNT(*) AS aggregate
                 FROM pg_indexes
                 WHERE schemaname = ?
                   AND tablename = ?
                   AND indexname = ?',
                ['public', 'hydration_entries', $this->indexName]
            );

            return (int) ($result->aggregate ?? 0) > 0;
        }

        if (in_array($driver, ['mysql', 'mariadb'], true)) {
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

        return false;
    }
};
