//@ts-check

// import { BetterView } from '@webreflection/magic-view';

import { EXT_CIRCULAR, EXT_TIMESTAMP } from './builtins.js';
import { ExtData, Extensions } from './extensions.js';

const textDecoder = new TextDecoder;

class BetterView extends DataView {
  /**
   * @param {number} byteOffset
   * @param {number} size
   * @returns {Uint8Array}
   */
  getTyped(byteOffset, size) {
    return new Uint8Array(this.buffer.slice(byteOffset, byteOffset + size));
  }
}

/** @typedef {{ circular?:boolean, littleEndian?:boolean, extensions?:Extensions }} DecoderOptions */

/** @param {DecoderOptions} options */
const decoder = ({ circular, littleEndian, extensions }) => {
  /** @type {Map<number,any>} */
  const cache = new Map;

  let i = 0;

  /** @type {Uint8Array?} */
  let sub = null;

  /**
   * @param {BetterView} bv
   * @param {number} index
   * @param {number} length
   * @returns
   */
  const arr = (bv, index, length) => {
    const value = [];
    if (circular) cache.set(index, value);
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
      case 0xcc: return uint(bv, 1);
      case 0xcd: return uint(bv, 2);
      case 0xce: return uint(bv, 4);
      case 0xcf: return big(bv, bv.getBigUint64);

      // signed
      case 0xd0: return bv.getInt8(i++);
      case 0xd1: return read(bv.getInt16(i, littleEndian), 2);
      case 0xd2: return read(bv.getInt32(i, littleEndian), 4);
      case 0xd3: return big(bv, bv.getBigInt64);

      // string
      case 0xd9: return str(bv, uint(bv, 1));
      case 0xda: return str(bv, uint(bv, 2));
      case 0xdb: return str(bv, uint(bv, 4));

      // array
      case 0xdc: return arr(bv, index, uint(bv, 2));
      case 0xdd: return arr(bv, index, uint(bv, 4));

      // object
      case 0xde: return obj(bv, index, uint(bv, 2));
      case 0xdf: return obj(bv, index, uint(bv, 4));

      // view
      case 0xc4: return view(bv, index, uint(bv, 1));
      case 0xc5: return view(bv, index, uint(bv, 2));
      case 0xc6: return view(bv, index, uint(bv, 4));

      // fixext
      case 0xd4: return ext(bv, index, 1);
      case 0xd5: return ext(bv, index, 2);
      case 0xd6: return ext(bv, index, 4);
      case 0xd7: return ext(bv, index, 8);
      // case 0xd8: return extension(bv, index, 16, true);
      // TODO: what are the use cases and why timestamp has 12?

      // ext
      case 0xc7: return ext(bv, index, uint(bv, 1));
      case 0xc8: return ext(bv, index, uint(bv, 2));
      case 0xc9: return ext(bv, index, uint(bv, 4));

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
   * @param {BetterView} bv
   * @param {number} index
   * @param {number} size
   * @returns
   */
  const ext = (bv, index, size) => {
    const type = bv.getInt8(i++);
    if (type === EXT_CIRCULAR)
      return cache.get(uint(bv, /** @type {1 | 2 | 4} */(size)));

    let value;
    if (type === EXT_TIMESTAMP) {
      switch (size) {
        case 4: {
          value = new Date(uint(bv, size) * 1e3);
          break;
        }
        case 8: {
          // (c) @msgpack/msgpack - https://github.com/msgpack/msgpack-javascript/blob/accf28769bce33507673723b10886783845ee430/src/timestamp.ts#L25-L34
          const nsec30AndSecHigh2 = uint(bv, 4);
          const secLow32 = uint(bv, 4);
          const sec = (nsec30AndSecHigh2 & 0x3) * 0x100000000 + secLow32;
          const nano = nsec30AndSecHigh2 >>> 2;
          value = new Date(sec * 1e3 + nano / 1e6);
          break;
        }
        case 16: err(type);
        // TODO: what are the use cases?
      }
    }
    else {
      const data = typed(bv, size);
      const extension = /** @type {Extensions} */(extensions).get(type);
      value = extension ? extension.decode(data, type) : new ExtData(type, data);
    }
    if (circular) cache.set(index, value);
    return value;
  };

  /**
   * @param {BetterView} bv
   * @param {number} index
   * @param {number} pairs
   * @returns
   */
  const obj = (bv, index, pairs) => {
    const value = {};
    if (circular) cache.set(index, value);
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
    read(subarray(bv, length), length)
  );

  /**
   * @param {BetterView} bv
   * @param {number} size
   * @returns
   */
  const subarray = (bv, size) => /** @type {Uint8Array} */(
    sub ? sub.subarray(i, i + size) : bv.getTyped(i, size)
  );

  /**
   * @param {BetterView} bv
   * @param {number} size
   * @returns
   */
  const typed = (bv, size) => read(subarray(bv, size), size);

  /**
   * @param {BetterView} bv
   * @param {1 | 2 | 4} size
   * @returns
   */
  const uint = (bv, size) => size < 2 ?
    bv.getUint8(i++) :
    read(
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
    if (circular) cache.set(index, value);
    return value;
  };

  /**
   * @param {ArrayBufferView} view
   * @returns
   */
  return view => {
    i = 0;
    // ⚠️ TextDecoder fails with SharedArrayBuffer
    sub = view.buffer instanceof ArrayBuffer ? /** @type {Uint8Array} */(view) : null;
    const result = decode(new BetterView(view.buffer));
    cache.clear();
    return result;
  };
};

export default class Decoder {
  /** @param {DecoderOptions} options */
  constructor({
    circular = true,
    littleEndian = false,
    extensions = new Extensions,
  } = {}) {
    this.decode = decoder({ circular, littleEndian, extensions });
  }
}
