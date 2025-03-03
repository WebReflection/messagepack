# @webreflection/messagepack

This is basically [messagepack](https://github.com/msgpack/msgpack-javascript) with *circular* / *recursion* type (as `-128`) embedded in as private extension.

Main difference is that *EXT_TIMESTAMP* supports 32 bit and 64 bits only (so far) and that anything bigger than a *uint32* is encoded, or decoded, as `bigint`.

The goal of this project is to have the fastest general *Web* purpose *MessagePack* implementation out there.
