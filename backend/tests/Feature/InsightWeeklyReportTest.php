<?php

use App\Models\HydrationEntry;
use App\Models\Medication;
use App\Models\MedicationHistory;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

function insightAuthUser(array $attributes = []): array
{
    $token = 'test-token-' . bin2hex(random_bytes(4));
    $user = User::factory()->create(array_merge([
        'api_token' => hash('sha256', $token),
        'hydration_goal' => 100,
    ], $attributes));

    return [$user, ['Authorization' => 'Bearer ' . $token]];
}

function createDailyMedication(User $user): Medication
{
    $medication = Medication::create([
        'user_id' => $user->id,
        'name' => 'Daily med',
        'dosage' => '1 tablet',
        'times' => ['09:00:00'],
        'reminder' => true,
        'active' => true,
        'start_date' => '2026-05-24',
        'frequency' => 'daily',
        'created_at' => Carbon::parse('2026-05-20 00:00:00'),
        'updated_at' => Carbon::parse('2026-05-20 00:00:00'),
    ]);

    $medication->forceFill([
        'created_at' => Carbon::parse('2026-05-20 00:00:00'),
        'updated_at' => Carbon::parse('2026-05-20 00:00:00'),
    ])->save();

    return $medication->fresh();
}

function addHydration(User $user, int $amount, string $createdAt, ?string $clientUuid = null): void
{
    HydrationEntry::create([
        'user_id' => $user->id,
        'client_uuid' => $clientUuid,
        'amount_ml' => $amount,
        'source' => 'manual',
        'beverage_type' => 'water',
        'sugar_level' => 'none',
        'caffeine_level' => 'none',
        'created_at' => Carbon::parse($createdAt),
    ]);
}

function completeDose(User $user, Medication $medication, string $scheduledAt, ?string $clientUuid = null): void
{
    MedicationHistory::create([
        'user_id' => $user->id,
        'medication_id' => $medication->id,
        'client_uuid' => $clientUuid,
        'status' => 'completed',
        'time' => Carbon::parse($scheduledAt),
        'scheduled_time' => Carbon::parse($scheduledAt),
        'taken_time' => Carbon::parse($scheduledAt)->addMinutes(5),
        'created_at' => Carbon::parse($scheduledAt)->addMinutes(5),
        'updated_at' => Carbon::parse($scheduledAt)->addMinutes(5),
    ]);
}

beforeEach(function () {
    Carbon::setTestNow(Carbon::parse('2026-05-30 12:00:00'));
});

afterEach(function () {
    Carbon::setTestNow();
});

test('weekly report returns zero with no activity', function () {
    [, $headers] = insightAuthUser();

    $this->getJson('/api/insights/weekly-report', $headers)
        ->assertOk()
        ->assertJsonPath('has_data', false)
        ->assertJsonPath('overall_score', 0);
});

test('partial hydration only stays below one hundred', function () {
    [$user, $headers] = insightAuthUser();
    addHydration($user, 350, '2026-05-26 10:00:00');

    $this->getJson('/api/insights/weekly-report', $headers)
        ->assertOk()
        ->assertJsonPath('hydration.percentage', 50)
        ->assertJsonPath('overall_score', 50);
});

test('partial medication only stays below one hundred', function () {
    [$user, $headers] = insightAuthUser();
    $medication = createDailyMedication($user);

    completeDose($user, $medication, '2026-05-24 09:00:00');
    completeDose($user, $medication, '2026-05-25 09:00:00');
    completeDose($user, $medication, '2026-05-26 09:00:00');

    $this->getJson('/api/insights/weekly-report', $headers)
        ->assertOk()
        ->assertJsonPath('medications.adherence_rate', 43)
        ->assertJsonPath('overall_score', 43);
});

test('perfect hydration and medication week returns one hundred', function () {
    [$user, $headers] = insightAuthUser();
    $medication = createDailyMedication($user);

    foreach (range(24, 30) as $day) {
        addHydration($user, 100, "2026-05-{$day} 10:00:00");
        completeDose($user, $medication, "2026-05-{$day} 09:00:00");
    }

    $this->getJson('/api/insights/weekly-report', $headers)
        ->assertOk()
        ->assertJsonPath('hydration.percentage', 100)
        ->assertJsonPath('medications.adherence_rate', 100)
        ->assertJsonPath('overall_score', 100);
});

test('duplicate medication records cannot push score above one hundred', function () {
    [$user, $headers] = insightAuthUser();
    $medication = createDailyMedication($user);

    completeDose($user, $medication, '2026-05-24 09:00:00');
    completeDose($user, $medication, '2026-05-24 09:00:00');

    $response = $this->getJson('/api/insights/weekly-report', $headers)
        ->assertOk()
        ->assertJsonPath('medications.completed', 1);

    expect($response->json('overall_score'))->toBeLessThanOrEqual(100);
});

test('duplicate hydration records cannot push score above one hundred', function () {
    [$user, $headers] = insightAuthUser();

    addHydration($user, 1000, '2026-05-26 10:00:00');
    addHydration($user, 1000, '2026-05-26 10:00:00');

    $this->getJson('/api/insights/weekly-report', $headers)
        ->assertOk()
        ->assertJsonPath('hydration.percentage', 100)
        ->assertJsonPath('overall_score', 100);
});

test('offline sync duplicate client uuids are reconciled by the database and score stays capped', function () {
    [$user, $headers] = insightAuthUser();

    addHydration($user, 1000, '2026-05-26 10:00:00', 'offline-hydration-1');
    addHydration($user, 1000, '2026-05-27 10:00:00', 'offline-hydration-2');

    $response = $this->getJson('/api/insights/weekly-report', $headers)
        ->assertOk();

    expect($response->json('overall_score'))->toBe(100);
});

test('timezone boundary dates include only the current configured week', function () {
    [$user, $headers] = insightAuthUser();

    addHydration($user, 100, '2026-05-23 23:59:59');
    addHydration($user, 100, '2026-05-24 00:00:00');
    addHydration($user, 100, '2026-05-30 23:59:59');
    addHydration($user, 100, '2026-05-31 00:00:00');

    $this->getJson('/api/insights/weekly-report', $headers)
        ->assertOk()
        ->assertJsonPath('hydration.total_ml', 200)
        ->assertJsonPath('overall_score', 29);
});

test('overhydration cannot mask missed scheduled medication doses', function () {
    [$user, $headers] = insightAuthUser();
    createDailyMedication($user);
    addHydration($user, 1400, '2026-05-26 10:00:00');

    $this->getJson('/api/insights/weekly-report', $headers)
        ->assertOk()
        ->assertJsonPath('hydration.percentage', 100)
        ->assertJsonPath('medications.adherence_rate', 0)
        ->assertJsonPath('overall_score', 50);
});
