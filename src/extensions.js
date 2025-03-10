//@ts-check

/** @typedef {object & { encode(value:any):Uint8Array, decode(view:Uint8Array, type:number):any }} Extension */

export class ExtData {
  /**
   * @param {number} type
   * @param {Uint8Array} data
   */
  constructor(type, data) {
    /** @type {number} */
    this.type = type;
    /** @type {Uint8Array} */
    this.data = data;
  }
}

export class Extensions extends Map {
  /**
   * @param {number} type
   * @param {Extension[]?} extension
   */
  set(type, extension) {
    if (type < 0 || type > 127)
      throw new TypeError(`Invalid extension value ${type}`);
    return super.set(type, extension);
  }

  /**
   * @param {number} type
   * @param {Extension[]?} extension
   */
  register(type, extension) {
    return this.set(type, extension);
  }
}
