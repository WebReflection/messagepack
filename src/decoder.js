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
   * @param {number} index
   * @param {number} length
   * @param {number} bytes
   * @returns
   */
  const array = (bv, index, length, bytes) => {
    i += bytes;
    return arr(bv, index, length);
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
   * @param {BetterView} bv
   * @param {number} index
   * @param {number} pairs
   * @param {number} bytes
   * @returns
   */
  const object = (bv, index, pairs, bytes) => {
    i += bytes;
    return obj(bv, index, pairs);
  };

  /**
   * @param {BetterView} bv
   * @param {number} length
   * @returns
   */
  const str = (bv, length) => {
    const str = textDecoder.decode(
      sub ? bv.getSub(i, length) : bv.getTyped(i, length)
    );
    i += length;
    return str;
  };

  /**
   * @param {BetterView} bv
   * @param {number} length
   * @param {number} bytes
   * @returns
   */
  const string = (bv, length, bytes) => {
    i += bytes;
    return str(bv, length);
  };

  /**
   * @param {number|bigint} value
   * @param {number} bytes
   * @returns
   */
  const number = (value, bytes) => {
    i += bytes;
    return value;
  };

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
      case 0xca: return number(bv.getFloat32(i, littleEndian), 4);
      case 0xcb: return number(bv.getFloat64(i, littleEndian), 8);

      // uint
      case 0xcc: return bv.getUint8(i++);
      case 0xcd: return number(bv.getUint16(i, littleEndian), 2);
      case 0xce: return number(bv.getUint32(i, littleEndian), 4);
      case 0xcf: return number(bv.getBigUint64(i, littleEndian), 8);

      // int
      case 0xd0: return bv.getInt8(i++);
      case 0xd1: return number(bv.getInt16(i, littleEndian), 2);
      case 0xd2: return number(bv.getInt32(i, littleEndian), 4);
      case 0xd3: return number(bv.getBigInt64(i, littleEndian), 8);

      // string
      case 0xd9: return string(bv, bv.getUint8(i), 1);
      case 0xda: return string(bv, bv.getUint16(i, littleEndian), 2);
      case 0xdb: return string(bv, bv.getUint32(i, littleEndian), 4);

      // array
      case 0xdc: return array(bv, index, bv.getUint16(i, littleEndian), 2);
      case 0xdd: return array(bv, index, bv.getUint32(i, littleEndian), 4);

      // object
      case 0xde: return object(bv, index, bv.getUint16(i, littleEndian), 2);
      case 0xdf: return object(bv, index, bv.getUint32(i, littleEndian), 4);

      // view
      case 0xc4: return view(bv, index, bv.getUint8(i), 1);
      case 0xc5: return view(bv, index, bv.getUint16(i, littleEndian), 2);
      case 0xc6: return view(bv, index, bv.getUint32(i, littleEndian), 4);

      // fixext
      case 0xd4: return ext(bv, 1, true);
      case 0xd5: return ext(bv, 2, true);
      case 0xd6: return ext(bv, 4, true);
      // TODO: what are the use cases?
      // case 0xd7: return extension(bv, 8, true);
      // case 0xd8: return extension(bv, 16, true);

      // ext
      case 0xc7: return ext(bv, len(bv, 1), false);
      case 0xc8: return ext(bv, len(bv, 2), false);
      case 0xc9: return ext(bv, len(bv, 4), false);

      default: error(type);
    }
  };

  /**
   * @param {BetterView} bv
   * @param {number} size
   * @returns
   */
  const len = (bv, size) => {
    if (size === 1) size = bv.getUint8(i);
    else if (size === 2) bv.getUint16(i, littleEndian);
    else if (size === 4) size = bv.getUint32(i, littleEndian);
    i += size;
    return size;
  };

  /**
   * @param {BetterView} bv
   * @param {number} size
   * @param {boolean} fixed
   * @returns
   */
  const ext = (bv, size, fixed) => {
    const type = bv.getInt8(i++);
    if (fixed) {
      const data = len(bv, size);
      switch (type) {
        case EXT_CIRCULAR:
          return cache.get(data);
        case EXT_TIMESTAMP: {
          // TODO;
          console.warn(type);
          return data;
        }
      }
    }
    else {
      const data = bv.getTyped(i, size);
      i += size;
      // TODO
      return data;
    }
    error(type);
  };

  /** @param {number} type */
  const error = type => {
    const hex = type.toString(16).padStart(2, '0');
    throw new TypeError(`Unrecognized type: 0x${hex}}`);
  };

  /**
   * @param {BetterView} bv
   * @param {number} index
   * @param {number} length
   * @param {number} bytes
   * @returns
   */
  const view = (bv, index, length, bytes) => {
    i += bytes;
    const value = bv.getTyped(i, length);
    i += length;
    if (recursion) cache.set(index, value);
    return value;
  };

  /**
   * @param {ArrayBufferView} value
   * @returns
   */
  return ({ buffer }) => {
    i = 0;
    sub = buffer instanceof ArrayBuffer;
    const result = decode(new BetterView(buffer));
    cache.clear();
    return result;
  };
};
