import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../public/demo-checkout.js', import.meta.url), 'utf8');
const catalog = [
  {id: 'pink', name: 'Pink tint', price: 8000, tags: ['pink']},
  {id: 'glasses', name: 'Glasses', price: 12000},
  {id: 'unknown', name: 'Unknown price'},
  {id: 'zero', name: 'Zero reference price', price: 0},
];
const plain = value => JSON.parse(JSON.stringify(value));
function setup(products = catalog) {
  const context = {window: {}};
  vm.createContext(context);
  vm.runInContext(source, context);
  return new context.window.CoupiCheckout(products);
}

test('trusted catalog determines quote and source records never mutate', () => {
  const products = plain(catalog), cart = [{id: 'pink', price: 1}, {id: 'glasses'}];
  const checkout = setup(products);
  const state = checkout.start(cart, {source: 'cart'});
  assert.equal(state.referenceTotal, 20000);
  assert.equal(state.items[0].unitPrice, 8000);
  assert.equal(state.items[0].product.name, 'Pink tint');
  checkout.setQuantity('pink', 2);
  checkout.toggle('glasses', false);
  assert.equal(checkout.current.referenceTotal, 16000);
  assert.equal(checkout.current.totalQuantity, 2);
  assert.equal(checkout.current.selectedCount, 1);
  assert.equal(checkout.current.shipping, null);
  assert.equal(checkout.current.tax, null);
  assert.equal(checkout.current.currency, 'KRW');
  assert.deepEqual(cart, [{id: 'pink', price: 1}, {id: 'glasses'}]);
  assert.deepEqual(products, catalog);
});

test('constructor, snapshots, and returned receipts isolate mutable caller data', () => {
  const products = plain(catalog), checkout = setup(products);
  products[0].price = 1;
  products[0].tags.push('changed');
  const state = checkout.start(['pink']);
  state.items[0].quantity = 9;
  state.items[0].product.price = 1;
  state.selectedItems[0].product.tags.push('also changed');
  assert.equal(checkout.current.referenceTotal, 8000);
  assert.deepEqual(plain(checkout.current.items[0].product.tags), ['pink']);
  checkout.next();
  const receipt = checkout.confirm();
  receipt.items[0].quantity = 9;
  receipt.item_ids.push('glasses');
  receipt.referenceTotal = 1;
  assert.equal(checkout.confirm().referenceTotal, 8000);
  assert.equal(checkout.confirm().items[0].quantity, 1);
  assert.deepEqual(plain(checkout.confirm().item_ids), ['pink']);
});

test('unknown products reject the whole new quote and retain an existing quote', () => {
  const checkout = setup();
  checkout.start(['pink']);
  for (const products of [['pink', 'invented'], [{name: 'No ID'}], [null]]) {
    assert.throws(() => checkout.start(products), /Unknown catalog product/);
    assert.equal(checkout.current.referenceTotal, 8000);
    assert.equal(checkout.current.items.length, 1);
  }
  assert.throws(() => checkout.start([]), /at least one product/);
  assert.throws(() => checkout.start(['pink'], {source: 'invented'}), /Unknown checkout source/);
});

test('distinct source limits reject excess and repeated IDs do not create extra units', () => {
  const products = Array.from({length: 101}, (_, i) => ({id: `p${i}`, price: i}));
  const checkout = setup(products);
  for (const [source, max] of [['selected', 1], ['comparison', 3], ['products', 10], ['cart', 100]]) {
    assert.equal(checkout.start(products.slice(0, max), {source}).items.length, max);
    assert.throws(() => checkout.start(products.slice(0, max + 1), {source}), /at most/);
    assert.equal(checkout.current.items.length, max);
  }
  const state = checkout.start(['p0', 'p0', {id: 'p0', price: 40000}], {source: 'selected'});
  assert.equal(state.items.length, 1);
  assert.equal(state.totalQuantity, 1);
});

test('unknown or invalid prices cannot be confirmed or converted into free products', () => {
  const products = [undefined, null, -1, 1.5, Infinity, NaN, '1000', Number.MAX_SAFE_INTEGER + 1]
    .map((price, i) => ({id: `bad${i}`, price}));
  const checkout = setup([...catalog, ...products]);
  for (const {id} of products) {
    checkout.start([id]);
    assert.equal(checkout.current.referenceTotal, null);
    assert.equal(checkout.current.canContinue, false);
    assert.throws(() => checkout.next(), /reference price is unavailable/);
    assert.equal(checkout.step, 'review');
  }
  checkout.start(['pink', 'unknown']);
  assert.equal(checkout.current.referenceTotal, null);
  checkout.toggle('unknown', false);
  assert.equal(checkout.current.referenceTotal, 8000);
  assert.equal(checkout.current.canContinue, true);
  checkout.start(['zero']);
  checkout.next();
  assert.equal(checkout.confirm().referenceTotal, 0);
});

test('empty selections cannot continue; remove and reselect update totals', () => {
  const checkout = setup();
  checkout.start(['pink', 'glasses']);
  checkout.toggle('pink', false);
  checkout.toggle('glasses', false);
  assert.equal(checkout.current.canContinue, false);
  assert.equal(checkout.current.referenceTotal, 0);
  assert.throws(() => checkout.next(), /at least one product/);
  checkout.toggle('pink', true);
  checkout.remove('glasses');
  assert.equal(checkout.current.items.length, 1);
  assert.equal(checkout.current.referenceTotal, 8000);
  checkout.remove('pink');
  assert.throws(() => checkout.next(), /at least one product/);
});

test('invalid quantities and unknown editing targets reject without corrupting quote', () => {
  const checkout = setup();
  checkout.start(['pink']);
  for (const qty of [0, -1, 10, 1.2, NaN, Infinity, '2', null]) {
    assert.throws(() => checkout.setQuantity('pink', qty), /whole number from 1 to 9/);
    assert.equal(checkout.current.referenceTotal, 8000);
  }
  assert.throws(() => checkout.setQuantity('missing', 2), /Unknown checkout product/);
  assert.throws(() => checkout.toggle('missing', true), /Unknown checkout product/);
  assert.throws(() => checkout.remove('missing'), /Unknown checkout product/);
  assert.throws(() => checkout.toggle('pink', 'yes'), /true or false/);
  checkout.setQuantity('pink', 9);
  assert.equal(checkout.current.referenceTotal, 72000);
});

test('unsafe line totals and subtotal overflow cannot be confirmed', () => {
  const checkout = setup([{id: 'large', price: Number.MAX_SAFE_INTEGER}, {id: 'one', price: 1}]);
  checkout.start(['large']);
  checkout.setQuantity('large', 2);
  assert.equal(checkout.current.referenceTotal, null);
  assert.throws(() => checkout.next(), /reference price is unavailable/);
  checkout.start(['large', 'one']);
  assert.equal(checkout.current.referenceTotal, null);
  assert.throws(() => checkout.next(), /reference price is unavailable/);
});

test('payment review/back preserve selection; payment does not allow quote mutation', () => {
  const checkout = setup();
  checkout.start(['pink', 'glasses']);
  checkout.setQuantity('pink', 3);
  checkout.toggle('glasses', false);
  assert.throws(() => checkout.confirm(), /must be in payment/);
  checkout.next();
  assert.equal(checkout.step, 'payment');
  checkout.selectPayment('demo-wallet');
  assert.throws(() => checkout.selectPayment('real-card'), /supported demo payment/);
  assert.throws(() => checkout.setQuantity('pink', 2), /must be in review/);
  checkout.back();
  assert.equal(checkout.current.paymentMethod, 'demo-wallet');
  assert.equal(checkout.current.referenceTotal, 24000);
  checkout.setQuantity('pink', 2);
  checkout.next();
  const receipt = checkout.confirm();
  assert.equal(receipt.referenceTotal, 16000);
  assert.equal(receipt.paymentMethod, 'demo-wallet');
  assert.deepEqual(plain(receipt.item_ids), ['pink']);
  assert.equal(receipt.items[0].quantity, 2);
  assert.equal(receipt.items[0].unitPrice, 8000);
});

test('confirm is idempotent and explicit about no actual payment or order', () => {
  const checkout = setup();
  checkout.start(['pink'], {source: 'selected'});
  checkout.next();
  const first = checkout.confirm(), second = checkout.confirm();
  assert.deepEqual(plain(first), plain(second));
  assert.notEqual(first, second);
  assert.match(first.id, /^DEMO-/);
  assert.equal(first.demo, true);
  assert.equal(first.payment_processed, false);
  assert.equal(first.order_placed, false);
  assert.equal(first.shipping, null);
  assert.equal(first.tax, null);
  assert.equal(checkout.current.step, 'complete');
  assert.throws(() => checkout.back(), /must be in payment/);
  checkout.start(['pink']);
  checkout.next();
  assert.notEqual(checkout.confirm().id, first.id);
});

test('cancel from review or payment resets all state without external cart mutation', () => {
  const cart = [{...catalog[0]}, {...catalog[1]}], checkout = setup();
  const expected = plain(cart);
  for (const advance of [false, true]) {
    checkout.start(cart, {source: 'cart'});
    checkout.setQuantity('pink', 2);
    if (advance) checkout.next();
    const state = checkout.cancel();
    assert.equal(state.step, 'idle');
    assert.equal(state.items.length, 0);
    assert.equal(state.source, null);
    assert.equal(state.receipt, null);
    assert.equal(state.canContinue, false);
    assert.deepEqual(cart, expected);
    assert.throws(() => checkout.confirm(), /must be in payment/);
  }
});
