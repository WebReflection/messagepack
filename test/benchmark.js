import { Encoder, Decoder } from '../src/index.js';
import { encode, decode } from '@msgpack/msgpack';
import * as cbor2 from 'cbor2';
import * as sc from '@ungap/structured-clone/json';

let data;
try {
  data = await (await fetch('./carts.json')).json();
}
catch (_) {
  data = (await import('./carts.json', { with: { type: 'json' } })).default;
}


// --------------------------------------------------------------------

const WAIT = 500;
const TIMES = 100;
const circular = true;
const hotcold = false;
const runAll = true;

// --------------------------------------------------------------------

const te = new TextEncoder;
const td = new TextDecoder;
const toView = value => te.encode(sc.stringify(value));
const fromView = value => sc.parse(td.decode(value));

const encoder = new Encoder({ circular, initialBufferSize: 0xFFFF });
const decoder = new Decoder({ circular });
const delay = ms => new Promise($ => setTimeout($, ms));

const bench = async (name, encode, decode) => {
  await delay(WAIT);

  let encoded, decoded;
  console.log(`🗃️ \x1b[1m${name}\x1b[0m encoding`);
  console.time('total');
  for (let i = 0; i < TIMES; i++) {
    const track = !i || i === (TIMES - 1);
    if (track && hotcold) console.time(i ? 'hot' : 'cold');
    encoded = encode(data);
    if (track && hotcold) console.timeEnd(i ? 'hot' : 'cold');
  }
  console.timeEnd('total');
  await delay(WAIT);
  console.log(`🔙 \x1b[1m${name}\x1b[0m decoding`);
  console.time('total');
  for (let i = 0; i < TIMES; i++) {
    const track = !i || i === (TIMES - 1);
    if (track && hotcold) console.time(i ? 'hot' : 'cold');
    decoded = decode(encoded);
    if (track && hotcold) console.timeEnd(i ? 'hot' : 'cold');
  }
  console.timeEnd('total');
  console.log(encoded.length);
  if (sc.stringify(decoded) !== sc.stringify(data))
    console.error(`\x1b[1m⚠️ ${name} failed\x1b[0m`);
  console.log('');
};

await bench('@webreflection/messagepack', encoder.encode, decoder.decode);
runAll && await bench('@ungap/structured-clone \x1b[4mstring\x1b[0m', sc.stringify, sc.parse);
runAll && await bench('@msgpack/msgpack', encode, decode);
runAll && await bench('cbor2', cbor2.encode, cbor2.decode);
runAll && await bench('@ungap/structured-clone \x1b[4mview\x1b[0m', toView, fromView);

if (circular) {
  console.log('⭕ \x1b[1mCIRCULAR DATA\x1b[0m');
  console.log('');
  data.recursive = data;
  data.carts.unshift(data);
  data.carts.push(data);
  await bench('@webreflection/messagepack', encoder.encode, decoder.decode);
  runAll && await bench('@ungap/structured-clone string', sc.stringify, sc.parse);
  try {
    runAll && await bench('@msgpack/msgpack', encode, decode);
  }
  catch (_) {
    console.timeEnd('total');
    console.warn('\x1b[2m⚠️ @msgpack/msgpack does not understand circular references\x1b[0m');
    console.log('');
  }
  try {
    runAll && await bench('cbor2', cbor2.encode, cbor2.decode);
  }
  catch (_) {
    console.timeEnd('total');
    console.warn('\x1b[2m⚠️ cbor2 does not understand circular references\x1b[0m');
    console.log('');
  }
  runAll && await bench('@ungap/structured-clone view', toView, fromView);
}
