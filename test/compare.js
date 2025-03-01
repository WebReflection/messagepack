import encoder from '../src/encoder.js';
import { encode, decode } from '@msgpack/msgpack';

const assert = (ok, message) => {
    if (!ok) throw new TypeError(message);
};

const is = (a, b) => (
  a.length === b.length && a.every((v, i) => v === b[i])
);

const same = value => {
  const a = local(value);
  const b = encode(value, { useBigInt64: true });
  const result = is(a, b);
  if (!result) {
    console.log(a);
    console.log(b);
  }
  return result;
};

const local = encoder();

assert(same(null), 'null');
assert(same(true), 'true');
assert(same(false), 'false');
assert(same(1n), 'big uint');
assert(same(-1n), 'big int');
assert(same('hello world'), '32 string');
assert(same('?'.repeat(0xff)), '0xff string');
assert(same('?'.repeat(0xffff)), '0xffff string');
assert(same('?'.repeat(0xfffff)), '0xffffffff string');


assert(same(1), 'number 1');
assert(same(0x80), 'number 0x80');
assert(same(0x100), 'number 0x100');
assert(same(0x10000), 'number 0x10000');
assert(same(0x100000000), 'number 0x100000000');

assert(same(-1), 'number -1');
assert(same(-0x20), 'number -0x20');
assert(same(-0x80), 'number -0x80');
assert(same(-0x8000), 'number -0x8000');
assert(same(-0x80000000), 'number -0x80000000');
assert(same(-0x80000001), 'number -0x80000001');

assert(same(1.2), 'number 1.2');

assert(same([1, 2, 3]), 'number[]');
assert(same({ a: 1, b: 2, c: 3 }), 'object');

assert(same(new Uint8Array([1, 2, 3])), 'view<ui8>');
assert(same(new Uint16Array([1, 2, 3])), 'view<ui16>');
assert(same(new Uint32Array([1, 2, 3])), 'view<ui32>');

let a = [1, 2, 3];
a.unshift(a);
a.push(a);
console.log({ a: local(a) });

let o = { test: 123 };
console.log({ o: local(o) });

a.push(o);
o.a = a;
console.log({ a: local(a) });
