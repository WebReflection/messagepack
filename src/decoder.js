//@ts-check

import { BetterView } from '@webreflection/magic-view';

import { EXT_CIRCULAR, EXT_TIMESTAMP } from './builtins.js';

const textDecoder = new TextDecoder;

export default function ({
  recursion = true,
  littleEndian = false,
  extensions = new Map,
} = {}) {
  /** @type {Map<number,any>} */
  const cache = new Map;

  let i = 0, sub = true;

  /**
   * @param {BetterView} bv
   * @param {number} index
   * @param {number} length
   * @returns
   */
  const arr = (bv, index, length) => {
    const value = [];
    if (recursion) cache.set(index, value);
    while (length--) value.push(decode(bv));
    return value;
  };

  /**
   * @param {BetterView} bv
   * @param {Function} method
   * @returns {bigint}
   */
  const big = (bv, method) => read(method.call(bv, i, littleEndian), 8);

  /**
   * @param {BetterView} bv
   * @returns {any}
   */
  const decode = bv => {
    const index = i++;
    const type = bv.getUint8(index);
    if (type >= 0xe0) return type - 0x100;
    if (type < 0xc0) {
      if (type < 0x80) return type;
      if (type < 0x90) return obj(bv, index, type - 0x80);
      if (type < 0xa0) return arr(bv, index, type - 0x90);
      return str(bv, type - 0xa0);
    }
    switch (type) {
      case 0xc0: return null;
      case 0xc2: return false;
      case 0xc3: return true;

      // float
      case 0xca: return read(bv.getFloat32(i, littleEndian), 4);
      case 0xcb: return read(bv.getFloat64(i, littleEndian), 8);

      // unsigned
      case 0xcc: return bv.getUint8(i++);
      case 0xcd: return uint(bv, 2);
      case 0xce: return uint(bv, 4);
      case 0xcf: return big(bv, bv.getBigUint64);

      // signed
      case 0xd0: return bv.getInt8(i++);
      case 0xd1: return read(bv.getInt16(i, littleEndian), 2);
      case 0xd2: return read(bv.getInt32(i, littleEndian), 4);
      case 0xd3: return big(bv, bv.getBigInt64);

      // string
      case 0xd9: return str(bv, bv.getUint8(i++));
      case 0xda: return str(bv, uint(bv, 2));
      case 0xdb: return str(bv, uint(bv, 4));

      // array
      case 0xdc: return arr(bv, index, uint(bv, 2));
      case 0xdd: return arr(bv, index, uint(bv, 4));

      // object
      case 0xde: return obj(bv, index, uint(bv, 2));
      case 0xdf: return obj(bv, index, uint(bv, 4));

      // view
      case 0xc4: return view(bv, index, bv.getUint8(i++));
      case 0xc5: return view(bv, index, uint(bv, 2));
      case 0xc6: return view(bv, index, uint(bv, 4));

      // fixext
      case 0xd4: return ext(bv, 1, true);
      case 0xd5: return ext(bv, 2, true);
      case 0xd6: return ext(bv, 4, true);
      case 0xd7: return ext(bv, 8, true);
      // case 0xd8: return extension(bv, 16, true);
      // TODO: what are the use cases and why timestamp has 12?

      // ext
      case 0xc7: return ext(bv, bv.getUint8(i++), false);
      case 0xc8: return ext(bv, uint(bv, 2), false);
      case 0xc9: return ext(bv, uint(bv, 4), false);

      // unknown
      default: err(type);
    }
  };

  /** @param {number} type */
  const err = type => {
    const hex = type.toString(16).padStart(2, '0');
    throw new TypeError(`Unrecognized type: 0x${hex}}`);
  };

  /**
   * @template {boolean} F
   * @param {BetterView} bv
   * @param {number} size
   * @param {F} fixed
   * @returns
   */
  const ext = (bv, size, fixed) => {
    const type = bv.getInt8(i++);
    if (fixed) {
      switch (type) {
        case EXT_CIRCULAR: {
          const index = size < 2 ?
            bv.getUint8(i++) :
            uint(bv, /** @type {2 | 4} */(size))
          ;
          return cache.get(index);
        }
        case EXT_TIMESTAMP: {
          switch (size) {
            case 4:
              return new Date(uint(bv, size) * 1e3);
            case 8: {
              // (c) @msgpack/msgpack - https://github.com/msgpack/msgpack-javascript/blob/accf28769bce33507673723b10886783845ee430/src/timestamp.ts#L25-L34
              const nsec30AndSecHigh2 = uint(bv, 4);
              const secLow32 = uint(bv, 4);
              const sec = (nsec30AndSecHigh2 & 0x3) * 0x100000000 + secLow32;
              const nano = nsec30AndSecHigh2 >>> 2;
              return new Date(sec * 1e3 + nano / 1e6);
            }
            // case 16: {}
            // TODO: what are the use cases and why timestamp has 12?
          }
        }
      }
    }
    else {
      const data = read(bv.getTyped(i, size), size);
      // TODO
      return data;
    }
    err(type);
  };

  /**
   * @param {BetterView} bv
   * @param {number} index
   * @param {number} pairs
   * @returns
   */
  const obj = (bv, index, pairs) => {
    const value = {};
    if (recursion) cache.set(index, value);
    while (pairs--) value[decode(bv)] = decode(bv);
    return value;
  };

  /**
   * @template T
   * @param {T} value
   * @param {number} bytes
   * @returns
   */
  const read = (value, bytes) => {
    i += bytes;
    return value;
  };

  /**
   * @param {BetterView} bv
   * @param {number} length
   * @returns
   */
  const str = (bv, length) => textDecoder.decode(
    sub ?
      read(bv.getSub(i, length), length) :
      read(bv.getTyped(i, length), length)
  );

  /**
   * @param {BetterView} bv
   * @param {2 | 4} size
   * @returns
   */
  const uint = (bv, size) => read(
    size < 4 ?
      bv.getUint16(i, littleEndian) :
      bv.getUint32(i, littleEndian),
    size
  );

  /**
   * @param {BetterView} bv
   * @param {number} index
   * @param {number} length
   * @returns
   */
  const view = (bv, index, length) => {
    const value = read(bv.getTyped(i, length), length);
    if (recursion) cache.set(index, value);
    return value;
  };

  /**
   * @param {ArrayBufferView} value
   * @returns
   */
  return ({ buffer }) => {
    i = 0;
    //@ts-ignore - ⚠️ TextDecoder fails with subarray of a growable SharedArrayBuffer
    sub = (buffer instanceof ArrayBuffer) || !buffer.growable;
    const result = decode(new BetterView(buffer));
    cache.clear();
    return result;
  };
};
