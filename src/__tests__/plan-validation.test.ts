import { validatePlan } from '@/app/dashboard/payments/_lib/plan-validation'

test('valid plan → null', () => expect(validatePlan('Unlimited', 300, 'price_123')).toBeNull())
test('null price is allowed', () => expect(validatePlan('Drop-in adjacent', null, null)).toBeNull())
test('empty name → error', () => expect(validatePlan('  ', 300, null)).toMatch(/name/i))
test('over-long name → error', () => expect(validatePlan('x'.repeat(81), 300, null)).toMatch(/name/i))
test('negative price → error', () => expect(validatePlan('P', -5, null)).toMatch(/price/i))
test('NaN price → error', () => expect(validatePlan('P', Number.NaN, null)).toMatch(/price/i))
test('over-long Stripe ref → error', () => expect(validatePlan('P', 300, 'x'.repeat(121))).toMatch(/stripe/i))
