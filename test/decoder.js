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

const a = [1, 0, 1, 0, 1];
a[1] = a;
a[3] = a;
const da = decode(encode(a));
console.log(da);

const date = new Date;
let value = [1, date, 2];
const encoded = messagepack.encode(value);
console.log(messagepack.decode(encoded));
console.log(decode(encoded));

value = [1, new Uint8Array(0x100), 2, "test", 3];
console.log(decode(encode(value)));
