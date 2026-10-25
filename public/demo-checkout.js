(function () {
  'use strict';

  const SOURCE_LIMITS = Object.freeze({ selected: 1, comparison: 3, products: 10, cart: 100 });
  const PAYMENT_METHODS = new Set(['demo-card', 'demo-wallet']);
  let receiptSequence = 0;
  const clone = value => JSON.parse(JSON.stringify(value));
  const validPrice = value => Number.isSafeInteger(value) && value >= 0;

  // This model only previews a reference quote. It never places an order, charges,
  // saves billing information, or mutates the caller's catalog/cart.
  class CoupiCheckout {
    constructor(catalog = []) {
      this.updateCatalog(catalog);
      this.reset();
    }

    // Refresh trusted listings without changing an order already under review.
    updateCatalog(catalog) {
      this._catalog = new Map();
      for (const product of catalog) {
        if (product && typeof product.id === 'string' && product.id) {
          this._catalog.set(product.id, clone(product));
        }
      }
    }

    get current() { return this.snapshot(); }
    get step() { return this._step; }

    _requireStep(step) {
      if (this._step !== step) throw new Error(`Checkout must be in ${step} before this action.`);
    }

    _find(id) {
      const item = this._items.find(entry => entry.id === id);
      if (!item) throw new Error(`Unknown checkout product: ${String(id)}.`);
      return item;
    }

    start(products, { source = 'products' } = {}) {
      if (!Object.hasOwn(SOURCE_LIMITS, source)) throw new Error('Unknown checkout source.');
      if (!Array.isArray(products) || !products.length) throw new Error('Choose at least one product to review.');
      // Validate every ID before replacing an existing quote; malformed requests
      // must not quietly turn into a different purchase selection.
      const ids = [...new Set(products.map(product => {
        const id = typeof product === 'string' ? product : product?.id;
        if (typeof id !== 'string' || !this._catalog.has(id)) {
          throw new Error(`Unknown catalog product: ${String(id)}.`);
        }
        return id;
      }))];
      if (ids.length > SOURCE_LIMITS[source]) {
        throw new Error(`Choose at most ${SOURCE_LIMITS[source]} products for ${source} checkout.`);
      }
      const items = ids.map(id => {
        const product = clone(this._catalog.get(id));
        return { id, product, quantity: 1, included: true, unitPrice: validPrice(product.price) ? product.price : null };
      });
      this._items = items;
      this._source = source;
      this._step = 'review';
      this._paymentMethod = 'demo-card';
      this._receipt = null;
      return this.snapshot();
    }

    toggle(id, included) {
      this._requireStep('review');
      if (typeof included !== 'boolean') throw new Error('Product inclusion must be true or false.');
      this._find(id).included = included;
      return this.snapshot();
    }

    setQuantity(id, quantity) {
      this._requireStep('review');
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 9) {
        throw new Error('Quantity must be a whole number from 1 to 9.');
      }
      this._find(id).quantity = quantity;
      return this.snapshot();
    }

    remove(id) {
      this._requireStep('review');
      this._find(id);
      this._items = this._items.filter(item => item.id !== id);
      return this.snapshot();
    }

    _quote() {
      const items = this._items.map(item => ({
        ...item,
        lineTotal: item.unitPrice === null ? null : item.unitPrice * item.quantity,
      }));
      const selectedItems = items.filter(item => item.included);
      const subtotal = selectedItems.reduce((sum, item) => sum + (item.lineTotal ?? 0), 0);
      const knownTotal = selectedItems.every(item => validPrice(item.unitPrice) && validPrice(item.lineTotal)) && validPrice(subtotal);
      return {
        items,
        selectedItems,
        selectedCount: selectedItems.length,
        totalQuantity: selectedItems.reduce((sum, item) => sum + item.quantity, 0),
        referenceTotal: knownTotal ? subtotal : null,
        valid: selectedItems.length > 0 && knownTotal,
      };
    }

    snapshot() {
      const { valid, ...quote } = this._quote();
      return clone({
        step: this._step,
        source: this._source,
        ...quote,
        shipping: null,
        tax: null,
        currency: 'KRW',
        paymentMethod: this._paymentMethod,
        canContinue: this._step === 'review' && valid,
        receipt: this._receipt,
        demo: true,
      });
    }

    _requireValidQuote() {
      const quote = this._quote();
      if (!quote.selectedItems.length) throw new Error('Choose at least one product to continue.');
      if (!quote.valid) throw new Error('A valid reference price is unavailable for the selected products. Remove or deselect them to continue.');
      return quote;
    }

    next() {
      this._requireStep('review');
      this._requireValidQuote();
      this._step = 'payment';
      return this.snapshot();
    }

    back() {
      this._requireStep('payment');
      this._step = 'review';
      return this.snapshot();
    }

    selectPayment(method) {
      this._requireStep('payment');
      if (!PAYMENT_METHODS.has(method)) throw new Error('Choose a supported demo payment method.');
      this._paymentMethod = method;
      return this.snapshot();
    }

    confirm() {
      if (this._step === 'complete') return clone(this._receipt);
      this._requireStep('payment');
      const quote = this._requireValidQuote();
      this._receipt = {
        id: `DEMO-${Date.now().toString(36).toUpperCase()}-${(++receiptSequence).toString(36).toUpperCase()}`,
        source: this._source,
        item_ids: quote.selectedItems.map(item => item.id),
        items: clone(quote.selectedItems),
        referenceTotal: quote.referenceTotal,
        shipping: null,
        tax: null,
        currency: 'KRW',
        paymentMethod: this._paymentMethod,
        demo: true,
        payment_processed: false,
        order_placed: false,
      };
      this._step = 'complete';
      return clone(this._receipt);
    }

    cancel() { return this.reset(); }

    reset() {
      this._items = [];
      this._source = null;
      this._step = 'idle';
      this._paymentMethod = 'demo-card';
      this._receipt = null;
      return this.snapshot();
    }
  }

  window.CoupiCheckout = CoupiCheckout;
})();
