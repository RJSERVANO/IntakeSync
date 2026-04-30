<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::disableForeignKeyConstraints();

        $this->dropForeignIfExists('subscription_transactions', 'subscription_transactions_subscription_id_foreign');
        $this->dropForeignIfExists('subscription_transactions', 'subscription_transactions_user_id_foreign');
        $this->dropForeignIfExists('subscriptions', 'subscriptions_subscription_plan_id_foreign');
        $this->dropForeignIfExists('subscriptions', 'subscriptions_user_id_foreign');
        $this->dropForeignIfExists('users', 'users_current_subscription_plan_id_foreign');

        if (Schema::hasTable('users')) {
            Schema::table('users', function (Blueprint $table) {
                $columns = [];

                if (Schema::hasColumn('users', 'current_subscription_plan_id')) {
                    $columns[] = 'current_subscription_plan_id';
                }

                if (Schema::hasColumn('users', 'subscription_expires_at')) {
                    $columns[] = 'subscription_expires_at';
                }

                if (!empty($columns)) {
                    $table->dropColumn($columns);
                }
            });
        }

        Schema::dropIfExists('subscription_transactions');
        Schema::dropIfExists('subscriptions');
        Schema::dropIfExists('subscription_plans');

        Schema::enableForeignKeyConstraints();
    }

    public function down(): void
    {
        // Subscription features were removed; rollback should not recreate retired tables.
    }

    private function dropForeignIfExists(string $table, string $foreignKey): void
    {
        if (!Schema::hasTable($table) || !$this->foreignKeyExists($table, $foreignKey)) {
            return;
        }

        try {
            Schema::table($table, function (Blueprint $table) use ($foreignKey) {
                $table->dropForeign($foreignKey);
            });
        } catch (Throwable $exception) {
            // The table/column cleanup below is still safe when the FK was already absent.
        }
    }

    private function foreignKeyExists(string $table, string $foreignKey): bool
    {
        $connection = Schema::getConnection();

        if ($connection->getDriverName() !== 'mysql') {
            return true;
        }

        return !empty(DB::selectOne(
            'select constraint_name from information_schema.table_constraints
             where constraint_schema = database()
               and table_name = ?
               and constraint_name = ?
               and constraint_type = ?',
            [$table, $foreignKey, 'FOREIGN KEY']
        ));
    }
};
