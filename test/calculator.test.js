import test from "node:test";
import assert from "node:assert/strict";
import { calculateGstQst } from "../src/calculator.js";

test("calculates GST and QST on the same subtotal", () => {
  assert.deepEqual(calculateGstQst(1000), {
    subtotal: 1000,
    gstRate: 5,
    gstAmount: 50,
    qstRate: 9.975,
    qstAmount: 99.75,
    totalTax: 149.75,
    total: 1149.75,
  });
});

test("rounds each tax to cents before totaling", () => {
  assert.deepEqual(calculateGstQst(19.99), {
    subtotal: 19.99,
    gstRate: 5,
    gstAmount: 1,
    qstRate: 9.975,
    qstAmount: 1.99,
    totalTax: 2.99,
    total: 22.98,
  });
});

test("rejects negative subtotals", () => {
  assert.throws(() => calculateGstQst(-1), /non-negative/);
});
