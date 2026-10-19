import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeRegex } from '../utils/escapeRegex.js';
import { getPagination } from '../utils/pagination.js';
import { summariseProfile, filterAddressesToGaps } from '../utils/nutritionProfile.js';
import { nextOccurrenceAfter } from '../controllers/ScheduleReminders.js';
import { slugify } from '../models/BlogModel.js';

test('escapeRegex neutralises regex metacharacters', () => {
  const evil = '(a+)+$.*[x]';
  assert.ok(new RegExp(escapeRegex(evil)).test(evil));
  assert.ok(!new RegExp(escapeRegex('a.c')).test('abc'));
});

test('getPagination clamps page and limit', () => {
  assert.deepEqual(getPagination({}), { page: 1, limit: 10, skip: 0 });
  assert.deepEqual(getPagination({ page: '3', limit: '20' }), { page: 3, limit: 20, skip: 40 });
  assert.equal(getPagination({ limit: '100000' }).limit, 100);
  assert.equal(getPagination({ page: '-5' }).page, 1);
});

test('nextOccurrenceAfter skips every missed occurrence', () => {
  const start = new Date('2026-01-01T08:00:00Z');
  const now = new Date('2026-01-10T12:00:00Z');
  assert.equal(nextOccurrenceAfter(start, 'daily', now).toISOString(), '2026-01-11T08:00:00.000Z');
  assert.equal(nextOccurrenceAfter(start, 'weekly', now).toISOString(), '2026-01-15T08:00:00.000Z');
  assert.equal(nextOccurrenceAfter(start, 'never', now), null);
});

test('slugify produces URL-safe slugs', () => {
  assert.equal(slugify('  Jollof Rice: The Ultimate Guide! '), 'jollof-rice-the-ultimate-guide');
  assert.equal(slugify('Crème brûlée'), 'creme-brulee');
});

test('summariseProfile averages by order frequency and flags gaps', () => {
  const frequency = new Map([['a', 2], ['b', 1]]);
  const meals = [
    { _id: 'a', name: 'A', nutrition: { calories: 600, protein: 5, fiber: 1, sodium: 2000, sugar: 0, fat: 10, carbohydrates: 50 } },
    { _id: 'b', name: 'B', nutrition: null },
  ];
  const profile = summariseProfile({ frequency, meals, ordersAnalysed: 3 });

  assert.equal(profile.mealsWithNutrition, 1);
  assert.equal(profile.averagePerMeal.calories, 600);
  assert.deepEqual(profile.mostOrdered[0], { _id: 'a', name: 'A', timesOrdered: 2 });
  const flagged = profile.gaps.map((g) => g.label).sort();
  assert.deepEqual(flagged, ['high sodium', 'low fiber', 'low protein']);
});

test('filterAddressesToGaps drops nutrients that were never flagged', () => {
  const gaps = [{ nutrient: 'protein' }];
  assert.deepEqual(filterAddressesToGaps(['Low Protein', 'high sugar'], gaps), ['Low Protein']);
});
