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
        Schema::disableForeignKeyConstraints();

        if (!Schema::hasTable('subscription_plans')) {
            Schema::create('subscription_plans', function (Blueprint $table) {
                $table->id();
                $table->string('name');
                $table->string('slug')->unique();
                $table->text('description')->nullable();
                $table->decimal('price', 10, 2)->default(0);
                $table->string('billing_period')->default('month');
                $table->json('features')->nullable();
                $table->integer('max_medications')->nullable();
                $table->integer('max_hydration_entries')->nullable();
                $table->integer('history_days')->default(7);
                $table->boolean('unlimited_reminders')->default(false);
                $table->boolean('advanced_scheduling')->default(false);
                $table->boolean('data_export')->default(false);
                $table->boolean('priority_support')->default(false);
                $table->boolean('smart_insights')->default(false);
                $table->boolean('offline_reminders')->default(false);
                $table->boolean('personalized_notifications')->default(false);
                $table->boolean('health_stats')->default(false);
                $table->boolean('is_active')->default(true);
                $table->integer('sort_order')->default(0);
                $table->timestamps();
            });
        }

        if (Schema::hasTable('users')) {
            Schema::table('users', function (Blueprint $table) {
                if (!Schema::hasColumn('users', 'current_subscription_plan_id')) {
                    $table->foreignId('current_subscription_plan_id')
                        ->nullable()
                        ->after('role')
                        ->constrained('subscription_plans')
                        ->nullOnDelete();
                }

                if (!Schema::hasColumn('users', 'subscription_expires_at')) {
                    $table->timestamp('subscription_expires_at')
                        ->nullable()
                        ->after('current_subscription_plan_id');
                }
            });
        }

        if (!Schema::hasTable('subscriptions')) {
            Schema::create('subscriptions', function (Blueprint $table) {
                $table->id();
                $table->foreignId('user_id')->constrained()->cascadeOnDelete();
                $table->foreignId('subscription_plan_id')->constrained()->cascadeOnDelete();
                $table->enum('status', ['active', 'cancelled', 'expired', 'pending'])->default('pending');
                $table->timestamp('starts_at')->nullable();
                $table->timestamp('ends_at')->nullable();
                $table->timestamp('cancelled_at')->nullable();
                $table->string('payment_method')->nullable();
                $table->string('payment_reference')->nullable();
                $table->timestamps();
            });
        }

        if (!Schema::hasTable('subscription_transactions')) {
            Schema::create('subscription_transactions', function (Blueprint $table) {
                $table->id();
                $table->foreignId('user_id')->constrained()->cascadeOnDelete();
                $table->foreignId('subscription_id')->nullable()->constrained()->nullOnDelete();
                $table->decimal('amount', 10, 2);
                $table->string('currency')->default('PHP');
                $table->string('payment_method');
                $table->string('transaction_id')->unique();
                $table->string('status');
                $table->boolean('auto_renewal')->default(false);
                $table->text('notes')->nullable();
                $table->timestamps();

                $table->index('user_id');
                $table->index('created_at');
            });
        }

        Schema::enableForeignKeyConstraints();
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
