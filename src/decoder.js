//@ts-check

import { BetterView } from '@webreflection/magic-view';
import Typed from './typed.js';

const textDecoder = new TextDecoder;

export default function ({
  recursion = true,
  littleEndian = false,
  extensions = new Map,
} = {}) {
  /** @type {Map<number,any>} */
  const cache = new Map;

  let i = 0;

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
   * @param {number} length
   * @param {number} bytes
   * @returns 
   */
  const view = (bv, index, length, bytes) => {
    i += bytes;
    const value = bv.getTyped(i, length, Uint8Array);
    i += length;
    if (recursion) cache.set(index, value);
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
    const str = textDecoder.decode(bv.getTyped(i, length, Uint8Array));
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
    const headByte = bv.getUint8(index);
    if (headByte >= 0xe0) return headByte - 0x100;
    if (headByte < 0xc0) {
      if (headByte < 0x80) return headByte;
      if (headByte < 0x90) return obj(bv, index, headByte - 0x80);
      if (headByte < 0xa0) return arr(bv, index, headByte - 0x90);
      return str(bv, headByte - 0xa0);
    }
    switch (headByte) {
      case 0xc0: return null;
      case 0xc2: return false;
      case 0xc3: return true;

      // float
      case 0xca: return number(bv.getFloat32(i), 4);
      case 0xcb: return number(bv.getFloat64(i), 8);

      // uint
      case 0xcc: return bv.getUint8(i++);
      case 0xcd: return number(bv.getUint16(i), 2);
      case 0xce: return number(bv.getUint32(i), 4);
      case 0xcf: return number(bv.getBigUint64(i), 8);

      // int
      case 0xd0: return bv.getInt8(i++);
      case 0xd1: return number(bv.getInt16(i), 2);
      case 0xd2: return number(bv.getInt32(i), 4);
      case 0xd3: return number(bv.getBigInt64(i), 8);

      // string
      case 0xd9: return string(bv, bv.getUint8(i), 1);
      case 0xda: return string(bv, bv.getUint16(i), 2);
      case 0xdb: return string(bv, bv.getUint32(i), 4);

      // array
      case 0xdc: return array(bv, index, bv.getUint16(i), 2);
      case 0xdd: return array(bv, index, bv.getUint32(i), 4);

      // object
      case 0xde: return object(bv, index, bv.getUint16(i), 2);
      case 0xdf: return object(bv, index, bv.getUint32(i), 4);

      // view
      case 0xc4: return view(bv, index, bv.getUint8(i), 1);
      case 0xc5: return view(bv, index, bv.getUint16(i), 2);
      case 0xc6: return view(bv, index, bv.getUint32(i), 4);
    }
  };

  /**
   * @param {ArrayBufferView} value
   * @returns
   */
  return ({ buffer }) => {
    i = 0;
    const result = decode(new BetterView(buffer));
    cache.clear();
    return result;
  };
};
