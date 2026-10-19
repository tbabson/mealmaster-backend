import { test } from 'node:test';
import assert from 'node:assert/strict';
import { priceItems, calculateTotals, SHIPPING_PRICE } from '../utils/pricing.js';

const MEAL_ID = '64b000000000000000000001';

const catalogue = new Map([
  [
    MEAL_ID,
    {
      _id: MEAL_ID,
      name: 'Jollof Rice',
      image: 'https://res.cloudinary.com/x/jollof.jpg',
      ingredients: [
        { name: 'Rice', price: 500, unit: 'kg' },
        { name: 'Tomato', price: 200, unit: 'pcs' },
      ],
    },
  ],
]);

test('prices come from the catalogue, never the client', () => {
  const [item] = priceItems(
    [{ mealID: MEAL_ID, name: 'Free food', ingredients: [{ name: 'rice', quantity: 2, price: 0.01 }] }],
    catalogue
  );
  assert.equal(item.name, 'Jollof Rice');
  assert.deepEqual(item.ingredients, [{ name: 'Rice', quantity: 2, price: 500, unit: 'kg' }]);
});

test('strict mode rejects unknown meals and ingredients', () => {
  assert.throws(() => priceItems([{ mealID: 'nope', ingredients: [] }], catalogue), /not available/);
  assert.throws(
    () => priceItems([{ mealID: MEAL_ID, ingredients: [{ name: 'Gold leaf', quantity: 1 }] }], catalogue),
    /not an ingredient/
  );
});

test('lenient mode drops unknown entries instead of failing', () => {
  const items = priceItems(
    [
      { mealID: 'nope', ingredients: [{ name: 'Rice', quantity: 1 }] },
      { mealID: MEAL_ID, ingredients: [{ name: 'Gold leaf', quantity: 1 }, { name: 'Tomato', quantity: 3 }] },
    ],
    catalogue,
    { strict: false }
  );
  assert.equal(items.length, 1);
  assert.deepEqual(items[0].ingredients.map((i) => i.name), ['Tomato']);
});

test('non-positive or non-numeric quantities are rejected', () => {
  for (const quantity of [0, -1, 'abc', null, Infinity]) {
    assert.throws(
      () => priceItems([{ mealID: MEAL_ID, ingredients: [{ name: 'Rice', quantity }] }], catalogue),
      /Invalid quantity/,
      `quantity ${quantity}`
    );
  }
});

test('totals include 10% tax and flat shipping', () => {
  const items = priceItems(
    [{ mealID: MEAL_ID, ingredients: [{ name: 'Rice', quantity: 2 }, { name: 'Tomato', quantity: 3 }] }],
    catalogue
  );
  assert.deepEqual(calculateTotals(items), {
    subtotal: 1600,
    taxPrice: 160,
    shippingPrice: SHIPPING_PRICE,
    totalAmount: 1600 + 160 + SHIPPING_PRICE,
  });
});
