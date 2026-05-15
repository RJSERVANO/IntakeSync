<?php

namespace Database\Seeders;

use App\Models\HydrationEntry;
use App\Models\Medication;
use App\Models\MedicationHistory;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DemoAdviserDataSeeder extends Seeder
{
    private const EMAIL = 'demo.adviser@intakesync.test';
    private const PASSWORD = 'DemoPass123!';
    private const HYDRATION_GOAL = 3000;
    private const SEED_NOTE = 'Demo adviser seed data';

    public function run(): void
    {
        $user = User::updateOrCreate(
            ['email' => self::EMAIL],
            [
                'name' => 'IntakeSync Demo User',
                'password' => Hash::make(self::PASSWORD),
                'role' => 'user',
                'status' => 'active',
                'onboarding_completed' => true,
                'nickname' => 'Demo',
                'climate' => 'hot',
                'exercise_frequency' => 'regularly',
                'weight' => 70,
                'weight_unit' => 'kg',
                'notification_permissions_accepted' => true,
                'battery_optimization_set' => true,
                'hydration_goal' => self::HYDRATION_GOAL,
            ]
        );

        $start = Carbon::today()->subDays(29);
        MedicationHistory::where('user_id', $user->id)->delete();
        HydrationEntry::where('user_id', $user->id)->delete();
        Medication::withTrashed()
            ->where('user_id', $user->id)
            ->whereIn('client_uuid', [
                'demo-adviser-med-biogesic',
                'demo-adviser-med-vitamin-c',
                'demo-adviser-med-maintenance',
            ])
            ->forceDelete();

        $medications = $this->seedMedications($user, $start);

        foreach ($this->dateWindow($start) as [$dayIndex, $date]) {
            $this->seedHydrationDay($user, $dayIndex, $date);
            $this->seedMedicationHistoryDay($user, $medications, $dayIndex, $date);
        }
    }

    private function seedMedications(User $user, Carbon $start): array
    {
        $definitions = [
            [
                'client_uuid' => 'demo-adviser-med-biogesic',
                'name' => 'Biogesic',
                'dosage' => '500mg',
                'times' => ['06:00', '12:00', '18:00', '00:00'],
                'frequency' => 'daily',
                'color' => '#DC2626',
                'notes' => 'Demo medicine scheduled every 6 hours.',
            ],
            [
                'client_uuid' => 'demo-adviser-med-vitamin-c',
                'name' => 'Vitamin C',
                'dosage' => '500mg',
                'times' => ['08:00'],
                'frequency' => 'daily',
                'color' => '#F59E0B',
                'notes' => 'Daily wellness supplement for demo data.',
            ],
            [
                'client_uuid' => 'demo-adviser-med-maintenance',
                'name' => 'Maintenance Demo Med',
                'dosage' => '10mg',
                'times' => ['21:00'],
                'frequency' => 'daily',
                'color' => '#2563EB',
                'notes' => 'Evening maintenance medication for demo data.',
            ],
        ];

        $medications = [];

        foreach ($definitions as $definition) {
            $medication = new Medication([
                'user_id' => $user->id,
                'client_uuid' => $definition['client_uuid'],
            ]);
            $medication->created_at = $start->copy()->subDay()->startOfDay();

            $medication->fill([
                'name' => $definition['name'],
                'dosage' => $definition['dosage'],
                'times' => $definition['times'],
                'reminder' => true,
                'active' => true,
                'start_date' => $start->toDateString(),
                'end_date' => null,
                'frequency' => $definition['frequency'],
                'days_of_week' => null,
                'notes' => $definition['notes'],
                'color' => $definition['color'],
            ]);
            $medication->save();

            $medications[] = $medication->fresh();
        }

        return $medications;
    }

    private function seedHydrationDay(User $user, int $dayIndex, Carbon $date): void
    {
        $perfectDays = [0, 4, 8, 12, 16, 20, 24, 29];
        $lowDays = [2, 7, 14, 19, 25, 27];
        $mixedDays = [5, 11, 21, 28];

        if (in_array($dayIndex, $perfectDays, true)) {
            $entries = [
                ['07:30', 500, 'water', 'none', 'none', 'Water'],
                ['10:00', 500, 'water', 'none', 'none', 'Water'],
                ['12:30', 750, 'water', 'none', 'none', 'Water'],
                ['15:00', 500, 'water', 'none', 'none', 'Water'],
                ['18:00', 500, 'water', 'none', 'none', 'Water'],
                ['20:30', 250, 'other_non_alcoholic', 'none', 'low', 'Tea'],
            ];
        } elseif (in_array($dayIndex, $lowDays, true)) {
            $entries = [
                ['09:15', 350, 'water', 'none', 'none', 'Water'],
                ['13:20', 500, 'water', 'none', 'none', 'Water'],
                ['18:45', 450 + (($dayIndex % 2) * 250), 'other_non_alcoholic', 'medium', 'none', 'Juice'],
            ];
        } elseif (in_array($dayIndex, $mixedDays, true)) {
            $entries = [
                ['07:45', 350, 'caffeinated', 'low', 'medium', 'Coffee'],
                ['10:30', 500, 'water', 'none', 'none', 'Water'],
                ['12:45', 500, 'sugar_sweetened', 'high', 'none', 'Soda'],
                ['16:10', 450, 'sugar_sweetened', 'high', 'medium', 'Milk tea'],
                ['20:15', 500 + (($dayIndex % 3) * 100), 'water', 'none', 'none', 'Water'],
            ];
        } else {
            $entries = [
                ['07:40', 450, 'water', 'none', 'none', 'Water'],
                ['10:15', 300, 'caffeinated', $dayIndex % 3 === 0 ? 'medium' : 'low', 'medium', 'Coffee'],
                ['12:40', 600, 'water', 'none', 'none', 'Water'],
                ['15:30', 400 + (($dayIndex % 4) * 100), 'water', 'none', 'none', 'Water'],
                ['19:45', 500, 'other_non_alcoholic', $dayIndex % 2 === 0 ? 'low' : 'none', 'low', 'Tea'],
            ];
        }

        foreach ($entries as [$time, $amount, $beverageType, $sugarLevel, $caffeineLevel, $label]) {
            [$hour, $minute] = array_map('intval', explode(':', $time));
            HydrationEntry::create([
                'user_id' => $user->id,
                'amount_ml' => $amount,
                'source' => 'manual',
                'beverage_type' => $beverageType,
                'sugar_level' => $sugarLevel,
                'caffeine_level' => $caffeineLevel,
                'notes' => self::SEED_NOTE,
                'drink_label' => $label,
                'created_at' => $date->copy()->setTime($hour, $minute),
            ]);
        }
    }

    private function seedMedicationHistoryDay(User $user, array $medications, int $dayIndex, Carbon $date): void
    {
        $perfectDays = [0, 3, 6, 9, 12, 15, 18, 21, 24, 29];
        $mostlyGoodDays = [1, 4, 7, 10, 13, 16, 19, 22, 25, 27];
        $missedDays = [2, 5, 11, 17, 23, 26];
        $skippedDays = [8, 14, 20, 28];

        $doseNumber = 0;

        foreach ($medications as $medication) {
            foreach ($medication->times ?? [] as $time) {
                $status = 'completed';

                if (in_array($dayIndex, $mostlyGoodDays, true) && $doseNumber === ($dayIndex % 6)) {
                    $status = 'missed';
                } elseif (in_array($dayIndex, $missedDays, true) && in_array($doseNumber, [$dayIndex % 6, ($dayIndex + 2) % 6], true)) {
                    $status = 'missed';
                } elseif (in_array($dayIndex, $skippedDays, true) && in_array($doseNumber, [1, 3, 5], true)) {
                    $status = 'skipped';
                } elseif (!in_array($dayIndex, $perfectDays, true) && !in_array($dayIndex, $mostlyGoodDays, true) && !in_array($dayIndex, $missedDays, true) && !in_array($dayIndex, $skippedDays, true)) {
                    $status = $doseNumber === 4 ? 'missed' : 'completed';
                }

                [$hour, $minute] = array_map('intval', explode(':', $time));
                $scheduled = $date->copy()->setTime($hour, $minute);
                $takenAt = $status === 'completed'
                    ? $scheduled->copy()->addMinutes(($dayIndex * 3 + $doseNumber * 5) % 21)
                    : null;
                $clientUuid = sprintf(
                    'demo-adviser-history-%s-%s-%s',
                    $this->medicationKey($medication),
                    $scheduled->format('Ymd'),
                    $scheduled->format('Hi')
                );

                $history = MedicationHistory::create([
                    'user_id' => $user->id,
                    'client_uuid' => $clientUuid,
                    'medication_id' => $medication->id,
                    'status' => $status,
                    'time' => $scheduled,
                    'scheduled_time' => $scheduled,
                    'taken_time' => $takenAt,
                    'medication_name_snapshot' => $medication->name,
                    'dosage_snapshot' => $medication->dosage,
                ]);
                $history->created_at = match ($status) {
                    'completed' => $takenAt,
                    'skipped' => $scheduled->copy()->addMinutes(5),
                    default => $scheduled->copy()->addMinutes(35),
                };
                $history->updated_at = Carbon::now();
                $history->save();

                $doseNumber++;
            }
        }
    }

    private function medicationKey(Medication $medication): string
    {
        return match ($medication->client_uuid) {
            'demo-adviser-med-vitamin-c' => 'vitamin-c',
            'demo-adviser-med-maintenance' => 'maintenance',
            default => 'biogesic',
        };
    }

    private function dateWindow(Carbon $start): array
    {
        $days = [];

        for ($offset = 0; $offset < 30; $offset++) {
            $days[] = [$offset, $start->copy()->addDays($offset)];
        }

        return $days;
    }
}
