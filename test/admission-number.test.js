const { test } = require('node:test');
const assert = require('node:assert/strict');
const Counter = require('../src/models/AdmissionCounter');
const nextNumber = require('../src/lib/admission-number');

test('admission numbering uses an atomic increment and retries a concurrent counter creation', async () => {
  const original = Counter.findOneAndUpdate;
  let calls = 0;
  try {
    Counter.findOneAndUpdate = async (filter, update, options) => {
      assert.match(filter._id, /^admission-\d{4}$/);
      assert.deepEqual(update, { $inc: { sequence: 1 } });
      assert.equal(options.new, true);
      if (++calls === 1) {
        assert.equal(options.upsert, true);
        throw Object.assign(new Error('Concurrent creation'), { code: 11000 });
      }
      assert.equal(options.upsert, undefined);
      return { sequence: 2 };
    };
    assert.match(await nextNumber(), /^JPS-\d{4}-00002$/);
    assert.equal(calls, 2);
  } finally { Counter.findOneAndUpdate = original; }
});
