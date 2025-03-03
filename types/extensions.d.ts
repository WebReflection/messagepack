/** @typedef {object & { encode(value:any):Uint8Array, decode(view:Uint8Array, type:number):any }} Extension */
export class ExtData {
    /**
     * @param {number} type
     * @param {Uint8Array} data
     */
    constructor(type: number, data: Uint8Array);
    /** @type {number} */
    type: number;
    /** @type {Uint8Array} */
    data: Uint8Array;
}
export class Extensions extends Map<any, any> {
    constructor();
    constructor(entries?: readonly (readonly [any, any])[]);
    constructor();
    constructor(iterable?: Iterable<readonly [any, any]>);
    /**
     * @param {number} type
     * @param {Extension[]?} extension
     */
    set(type: number, extension: Extension[] | null): this;
    /**
     * @param {number} type
     * @param {Extension[]?} extension
     */
    register(type: number, extension: Extension[] | null): this;
}
export type Extension = object & {
    encode(value: any): Uint8Array;
    decode(view: Uint8Array, type: number): any;
};
