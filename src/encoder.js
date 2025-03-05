//@ts-check

import { MagicView } from './magic-view.js';
import { stringBytes } from '@webreflection/magic-view';

import { EXT_CIRCULAR } from './builtins.js';
import { Extensions } from './extensions.js';

const { isArray } = Array;
const { isView } = ArrayBuffer;
const { floor } = Math;
const { isSafeInteger } = Number;
const { entries } = Object;

const minimumBufferSize = 0xFFFF;

const cache = /** @type {Map<any,Uint8Array>} */(new Map);

const bv = new DataView(new ArrayBuffer(6));
const circle = (mv, value, littleEndian) => {
  let size = 0;
  const index = mv.byteLength;
  bv.setInt8(1, EXT_CIRCULAR);
  if (index < 0x100) {
    bv.setUint8(0, 0xd4);
    bv.setUint8(2, index);
    size = 3;
  }
  else if (index < 0x10000) {
    bv.setUint8(0, 0xd5);
    bv.setUint16(2, index, littleEndian);
    size = 4;
  }
  else {
    bv.setUint8(0, 0xd6);
    bv.setUint32(2, index, littleEndian);
    size = 6;
  }

  cache.set(value, new Uint8Array(bv.buffer.slice(0, size)));
};

const ext = (mv, type, data) => {
  const length = data.length;
  switch (length) {
    case 1: mv.setU8(0xd4); break;
    case 2: mv.setU8(0xd5); break;
    case 4: mv.setU8(0xd6); break;
    case 8: mv.setU8(0xd7); break;
    case 16: mv.setU8(0xd8); break;
    default: {
      if (length < 0x100)
        mv.setManyU8(0xc7, length);
      else if (length < 0x10000) {
        mv.setU8(0xc8);
        mv.setUint16(length);
      } else if (length < 0x100000000) {
        mv.setU8(0xc9);
        mv.setUint32(length);
      }
    }
  }
  mv.setInt8(type);
  mv.setTypedU8(data);
};

const date = value => {
  // (c) @msgpack/msgpack - https://github.com/msgpack/msgpack-javascript/blob/accf28769bce33507673723b10886783845ee430/src/timestamp.ts
  const msec = value.getTime();
  let sec = floor(msec / 1e3);
  let nsec = (msec - sec * 1e3) * 1e6;
  let time;

  // Normalizes { sec, nsec } to ensure nsec is unsigned.
  const nsecInSec = floor(nsec / 1e9);
  sec += nsecInSec;
  nsec -= nsecInSec * 1e9;
  if (nsec === 0 && sec < 0x100000000) {
    // timestamp 32 = { sec32 (unsigned) }
    time = new Uint8Array(4);
    const view = new DataView(time.buffer);
    view.setUint32(0, sec);
  } else {
    // timestamp 64 = { nsec30 (unsigned), sec34 (unsigned) }
    const secHigh = sec / 0x100000000;
    const secLow = sec & 0xffffffff;
    time = new Uint8Array(8);
    const view = new DataView(time.buffer);
    // nsec30 | secHigh2
    view.setUint32(0, (nsec << 2) | (secHigh & 0x3));
    // secLow32
    view.setUint32(4, secLow);
  }
  return time;
};

const num = (mv, value, littleEndian) => {
  if (isSafeInteger(value)) {
    if (value >= 0) {
      if (value < 0x80)
        mv.setU8(value);
      else if (value < 0x100)
        mv.setManyU8(0xcc, value);
      else if (value < 0x10000) {
        mv.setU8(0xcd);
        mv.setUint16(value, littleEndian);
      }
      else if (value < 0x100000000) {
        mv.setU8(0xce);
        mv.setUint32(value, littleEndian);
      }
      else {
        mv.setU8(0xcb);
        mv.setFloat64(value, littleEndian);
      }
    }
    else {
      if (value >= -0x20)
        mv.setU8(0xe0 | (value + 0x20));
      else if (value >= -0x80) {
        mv.setU8(0xd0);
        mv.setInt8(value);
      }
      else if (value >= -0x8000) {
        mv.setU8(0xd1);
        mv.setInt16(value, littleEndian);
      }
      else if (value >= -0x80000000) {
        mv.setU8(0xd2);
        mv.setInt32(value, littleEndian);
      }
      else {
        mv.setU8(0xcb);
        mv.setFloat64(value, littleEndian);
      }
    }
  }
  else {
    mv.setU8(0xcb);
    mv.setFloat64(value, littleEndian);
  }
};

const str = (mv, value, littleEndian) => {
  // TODO: see if pre-allocating via https://stackoverflow.com/a/23329386
  //       or via https://github.com/msgpack/msgpack-javascript/blob/accf28769bce33507673723b10886783845ee430/src/utils/utf8.ts#L1
  //       helps encoding of strings directly into the resized buffer (it should)
  //       ⚠️ right now this duplicates the amount of RAM while encoding each string,
  //       adding pressure to the GC too: not ideal at all and yet ...
  //       https://es.discourse.group/t/string-bytelength-count/2315
  //       we have no way to just count or get the internal string size as buffer,
  //       for whatever reason that might be explained in the future in that TC39 topic.
  const bytes = stringBytes(value);
  const i = mv.i;
  if (bytes < 32)
    mv.setU8(0xa0 + bytes);
  else if (bytes < 0x100)
    mv.setManyU8(0xd9, bytes);
  else if (bytes < 0x10000) {
    mv.setU8(0xda);
    mv.setUint16(bytes, littleEndian);
  }
  else {
    mv.setU8(0xdb);
    mv.setUint32(bytes, littleEndian);
  }
  mv.setString(value, bytes);
  return mv.v.subarray(i, mv.i);
};

const notCached = (mv, typed) => {
  if (typed) {
    mv.setTypedU8(typed);
    return false;
  }
  return true;
};

/**
 * @param {object} options
 * @returns
 */
const encoder = ({ circular, littleEndian, extensions, initialBufferSize }) => {
  const mv = MagicView(initialBufferSize);
  const types = [];
  const encoders = [];
  for (const [type, { encoder }] of extensions) {
    if (encoder) {
      types.push(type);
      encoders.push(encoder);
    }
  }

  /** @param {any[]} value */
  const arr = value => {
    if (circular) circle(mv, value, littleEndian);
    const length = value.length;
    if (length < 16)
      mv.setU8(0x90 + length);
    else if (length < 0x10000) {
      mv.setU8(0xdc);
      mv.setUint16(length, littleEndian);
    }
    else {
      mv.setU8(0xdd);
      mv.setUint32(length, littleEndian);
    }
    for (let i = 0; i < length; i++) encode(value[i], true);
  };

  const encode = (value, nullify) => {
    switch (typeof value) {
      case 'boolean': {
        mv.setU8(value ? 0xc3 : 0xc2);
        break;
      }
      case 'number': {
        num(mv, value, littleEndian);
        break;
      }
      case 'string': {
        str(mv, value, littleEndian);
        break;
      }
      case 'bigint': {
        if (value >= 0n) {
          mv.setU8(0xcf);
          mv.setBigUint64(value, littleEndian);
        }
        else {
          mv.setU8(0xd3);
          mv.setBigInt64(value, littleEndian);
        }
        break;
      }
      case 'object': {
        if (value === null) mv.setU8(0xc0);
        else if (!circular || notCached(mv, cache.get(value))) {
          for (let i = 0; i < encoders.length; i++) {
            const data = encoders[i](value);
            if (data != null) {
              ext(mv, types[i], data);
              return;
            }
          }
          if (isArray(value)) arr(value);
          else if (isView(value)) view(value);
          else if (value instanceof Date) {
            ext(mv, -1, date(value));
            return;
          }
          else obj(value);
        }
        break;
      }
      default: {
        if (nullify) mv.setU8(0xc0);
        break;
      }
    }
  };

  /** @param {object} value */
  const obj = value => {
    if (circular) circle(mv, value, littleEndian);
    const pairs = entries(value);
    const encoded = [];
    for (let i = 0; i < pairs.length; i++) {
      const pair = pairs[i];
      switch (typeof pair[1]) {
        case 'function':
        case 'symbol':
        case 'undefined':
          break;
        default:
          encoded.push(pair);
          break;
      }
    }
    const length = encoded.length;
    if (length < 16)
      mv.setU8(0x80 + length);
    else if (length < 0x10000) {
      mv.setU8(0xde);
      mv.setUint16(length, littleEndian);
    } else {
      mv.setU8(0xdf);
      mv.setUint32(length, littleEndian);
    }
    for (let i = 0; i < length; i++) {
      const pair = encoded[i];
      const typed = cache.get(pair[0]);
      if (typed) mv.setTypedU8(typed);
      else cache.set(pair[0], str(mv, pair[0], littleEndian));
      encode(pair[1], false);
    }
  };

  const view = value => {
    const byteLength = value.byteLength;
    if (circular) circle(mv, value, littleEndian);
    if (byteLength < 0x100)
      mv.setManyU8(0xc4, byteLength);
    else if (byteLength < 0x10000) {
      mv.setU8(0xc5);
      mv.setUint16(byteLength, littleEndian);
    }
    else {
      mv.setU8(0xc6);
      mv.setUint32(byteLength, littleEndian);
    }
    mv.setTyped(value);
  };

  /**
   * @param {any} value
   * @returns
   */
  return value => {
    encode(value, false);
    if (circular) cache.clear();
    return mv.view;
  };
};

export default class Encoder {
  constructor({
    circular = true,
    littleEndian = false,
    extensions = new Extensions,
    initialBufferSize = minimumBufferSize,
  } = { initialBufferSize: minimumBufferSize }) {
    this.encode = encoder({ circular, littleEndian, extensions, initialBufferSize });
  }
}
