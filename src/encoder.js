//@ts-check

import { MagicView } from '@webreflection/magic-view';

import { EXT_CIRCULAR } from './builtins.js';
import { Extensions } from './extensions.js';

const { isArray } = Array;
const { isView } = ArrayBuffer;
const { floor } = Math;
const { isSafeInteger } = Number;
const { entries } = Object;

const minimumBufferSize = 0xFFFF;
const textEncoder = new TextEncoder;

/**
 * @param {object} options
 * @returns
 */
const encoder = ({ circular, littleEndian, extensions, initialBufferSize }) => {
  const cache = /** @type {Map<any,Uint8Array>} */(new Map);
  const mv = new MagicView(initialBufferSize);
  const bv = new DataView(new ArrayBuffer(6));
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
    const size = mv.size;
    const length = value.length;
    if (length < 16)
      mv.setU8(size, 0x90 + length);
    else if (length < 0x10000) {
      mv.setU8(size, 0xdc);
      mv.setUint16(size + 1, length, littleEndian);
    }
    else {
      mv.setU8(size, 0xdd);
      mv.setUint32(size + 1, length, littleEndian);
    }
    if (circular) circle(value, size);
    for (let i = 0; i < length; i++) encode(value[i], true);
  };

  /**
   * @param {any} value
   * @param {number} index
   * @returns
   */
  const circle = (value, index) => {
    let size = 0;
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

  /**
   * @param {Date} value
   */
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
    ext(-1, time);
  };

  /** @param {any} value */
  const encode = (value, nullify = false) => {
    switch (typeof value) {
      case 'boolean': {
        mv.setU8(mv.size, value ? 0xc3 : 0xc2);
        break;
      }
      case 'number': {
        num(value);
        break;
      }
      case 'string': {
        str(value);
        break;
      }
      case 'bigint': {
        if (value >= 0n) {
          mv.setU8(mv.size, 0xcf);
          mv.setBigUint64(mv.size, value, littleEndian);
        }
        else {
          mv.setU8(mv.size, 0xd3);
          mv.setBigInt64(mv.size, value, littleEndian);
        }
        break;
      }
      case 'object': {
        if (value === null) nil();
        else if (notCached(value)) {
          for (let i = 0; i < encoders.length; i++) {
            const data = encoders[i](value);
            if (data != null) {
              ext(types[i], data);
              return;
            }
          }
          if (isArray(value)) arr(value);
          else if (isView(value)) view(value);
          else if (value instanceof Date) {
            date(value);
            return;
          }
          else obj(value);
        }
        break;
      }
      default: {
        if (nullify) nil();
        break;
      }
    }
  };

  /**
   * @param {number} type
   * @param {Uint8Array} data
   */
  const ext = (type, data) => {
    const length = data.length;
    if (length === 1)
      mv.setU8(mv.size, 0xd4);
    else if (length === 2)
      mv.setU8(mv.size, 0xd5);
    else if (length === 4)
      mv.setU8(mv.size, 0xd6);
    else if (length === 8)
      mv.setU8(mv.size, 0xd7);
    else if (length === 16)
      mv.setU8(mv.size, 0xd8);
    else if (length < 0x100)
      mv.setArray(mv.size, [0xc7, length]);
    else if (length < 0x10000) {
      mv.setU8(mv.size, 0xc8);
      mv.setUint16(mv.size, length);
    } else if (length < 0x100000000) {
      mv.setU8(mv.size, 0xc9);
      mv.setUint32(mv.size, length);
    }
    mv.setInt8(mv.size, type);
    mv.setTypedU8(mv.size, data);
  };

  const nil = () => {
    mv.setU8(mv.size, 0xc0);
  };

  /** @param {any} value */
  const notCached = value => {
    const typed = cache.get(value);
    if (typed) {
      mv.setTypedU8(mv.size, typed);
      return false;
    }
    return true;
  };

  /** @param {number} value */
  const num = value => {
    const size = mv.size;
    if (isSafeInteger(value)) {
      if (value >= 0) {
        if (value < 0x80)
          mv.setU8(size, value);
        else if (value < 0x100)
          mv.setArray(size, [0xcc, value]);
        else if (value < 0x10000) {
          mv.setU8(size, 0xcd);
          mv.setUint16(size + 1, value, littleEndian);
        }
        else if (value < 0x100000000) {
          mv.setU8(size, 0xce);
          mv.setUint32(size + 1, value, littleEndian);
        }
        else {
          mv.setU8(size, 0xcb);
          mv.setFloat64(size + 1, value, littleEndian);
        }
      }
      else {
        if (value >= -0x20)
          mv.setU8(size, 0xe0 | (value + 0x20));
        else if (value >= -0x80) {
          mv.setU8(size, 0xd0);
          mv.setInt8(size + 1, value);
        }
        else if (value >= -0x8000) {
          mv.setU8(size, 0xd1);
          mv.setInt16(size + 1, value, littleEndian);
        }
        else if (value >= -0x80000000) {
          mv.setU8(size, 0xd2);
          mv.setInt32(size + 1, value, littleEndian);
        }
        else {
          mv.setU8(size, 0xcb);
          mv.setFloat64(size + 1, value, littleEndian);
        }
      }
    }
    else {
      mv.setU8(size, 0xcb);
      mv.setFloat64(size + 1, value, littleEndian);
    }
  };

  const undesired = pair => {
    switch (typeof pair[1]) {
      case 'function':
      case 'symbol':
      case 'undefined':
        return false;
      default:
        return true;
    }
  };

  /** @param {object} value */
  const obj = value => {
    const size = mv.size;
    const encoded = entries(value).filter(undesired);
    const length = encoded.length;
    if (length < 16)
      mv.setU8(size, 0x80 + length);
    else if (length < 0x10000) {
      mv.setU8(size, 0xde);
      mv.setUint16(size + 1, length, littleEndian);
    } else {
      mv.setU8(size, 0xdf);
      mv.setUint32(size + 1, length, littleEndian);
    }
    if (circular) circle(value, size);
    for (let i = 0; i < length; i++) {
      const pair = encoded[i];
      str(pair[0]);
      encode(pair[1]);
    }
  };

  /** @param {string} value */
  const str = value => {
    // TODO: see if pre-allocating via https://stackoverflow.com/a/23329386
    //       or via https://github.com/msgpack/msgpack-javascript/blob/accf28769bce33507673723b10886783845ee430/src/utils/utf8.ts#L1
    //       helps encoding of strings directly into the resized buffer (it should)
    //       ⚠️ right now this duplicates the amount of RAM while encoding each string,
    //       adding pressure to the GC too: not ideal at all and yet ...
    //       https://es.discourse.group/t/string-bytelength-count/2315
    //       we have no way to just count or get the internal string size as buffer,
    //       for whatever reason that might be explained in the future in that TC39 topic.
    const ui8a = textEncoder.encode(value);
    const length = ui8a.length;
    let size = mv.size;
    if (length < 32)
      mv.setU8(size++, 0xa0 + length);
    else if (length < 0x100) {
      mv.setArray(size, [0xd9, length]);
      size += 2;
    }
    else if (length < 0x10000) {
      mv.setU8(size, 0xda);
      mv.setUint16(size + 1, length, littleEndian);
      size += 3;
    }
    else {
      mv.setU8(size, 0xdb);
      mv.setUint32(size + 1, length, littleEndian);
      size += 5;
    }
    mv.setTypedU8(size, ui8a);
  };

  /** @param {ArrayBufferView} value */
  const view = value => {
    let size = mv.size, rsize = size;
    const byteLength = value.byteLength;
    if (circular) circle(value, size);
    if (byteLength < 0x100) {
      mv.setArray(size, [0xc4, byteLength]);
      size += 2;
    }
    else if (byteLength < 0x10000) {
      mv.setU8(size, 0xc5);
      mv.setUint16(size + 1, byteLength, littleEndian);
      size += 3;
    }
    else {
      mv.setU8(size, 0xc6);
      mv.setUint32(size + 1, byteLength, littleEndian);
      size += 5;
    }
    mv.setTyped(size, value);
  };

  /**
   * @param {any} value
   * @returns
   */
  return value => {
    encode(value);
    cache.clear();
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
