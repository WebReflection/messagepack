import encoder from '../src/encoder.js';
import decoder from '../src/decoder.js';

import * as messagepack from '@msgpack/msgpack';

const encode = encoder();
const decode = decoder();

console.log(decode(encode(null)));
console.log(decode(encode(true)));
console.log(decode(encode(false)));
console.log(decode(encode(123n)));
console.log(decode(encode(1.23)));
console.log(decode(encode("hello")));
console.log(decode(encode({})));
console.log(decode(encode({ a: 1, b: 2, c: 3 })));

console.log(decode(encode([])));
console.log(decode(encode([1, 2, 3, 4])));
console.log(decode(encode(Array.from({ length: 0x10000 }, (v, i) => i))).length === 0x10000);

console.log(decode(encode(new Uint32Array([1, 2, 3]))));

const a = [];
a.push(a);
console.log(decode(encode(a)));
