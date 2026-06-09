import { validateHouseholdName } from '@/app/dashboard/members/[memberId]/_lib/household-validation'

test('valid name → null', () => expect(validateHouseholdName('Smith Family')).toBeNull())
test('empty → error', () => expect(validateHouseholdName('   ')).toMatch(/required/i))
test('over 60 chars → error', () => expect(validateHouseholdName('x'.repeat(61))).toMatch(/too long/i))
