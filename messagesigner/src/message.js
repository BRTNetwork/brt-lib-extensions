/* eslint-disable valid-jsdoc */
'use strict';

var async = require('async');

/*
Factory function
*/
module.exports = function (ripplelib, sjcl) {

var Remote = ripplelib.Remote;
var Seed = ripplelib.Seed;
var Account = ripplelib.Account;
var UInt160 = ripplelib.UInt160;

// Message class (static)
var Message = {};

Message.hashFunction = sjcl.hash.sha512.hash;
Message.MAGIC_BYTES = 'Ripple Signed Message:\n';

var REGEX_HEX = /^[0-9a-fA-F]+$/;
var REGEX_BASE64 =
  /^([A-Za-z0-9\+]{4})*([A-Za-z0-9\+]{2}==)|([A-Za-z0-9\+]{3}=)?$/;

/**
 *  Produce a Base64-encoded signature on the given message with
 *  the string 'Ripple Signed Message:\n' prepended.
 *
 *  Note that this signature uses the signing function that includes
 *  a recovery_factor to be able to extract the public key from the signature
 *  without having to pass the public key along with the signature.
 *
 *  @static
 *
 *  @param {String} message
 *  @param {sjcl.ecc.ecdsa.secretKey|Any format accepted by Seed.from_json}
 *         secret_key
 *  @param {RippleAddress} [The first key] account Field to specify the signing
 *      account. If this is omitted the first account produced by the secret
 *      generator will be used.
 *  @return {Base64-encoded String} signature
 */
Message.signMessage = function(message, secret_key, account) {
  return Message.signHash(Message.hashFunction(Message.MAGIC_BYTES + message),
    secret_key, account);
};

/**
 *  Produce a Base64-encoded signature on the given hex-encoded hash.
 *
 *  Note that this signature uses the signing function that includes
 *  a recovery_factor to be able to extract the public key from the signature
 *  without having to pass the public key along with the signature.
 *
 *  @static
 *
 *  @param {bitArray|Hex-encoded String} hash
 *  @param {sjcl.ecc.ecdsa.secretKey|Any format accepted by Seed.from_json}
 *          secret_key
 *  @param {RippleAddress} [The first key] account Field to specify the
 *          signing account. If this is omitted the first account produced by
 *          the secret generator will be used.
 *  @returns {Base64-encoded String} signature
 */
Message.signHash = function(_hash, secret_key_, account) {

  var hash = typeof _hash === 'string' && /^[0-9a-fA-F]+$/.test(_hash) ?
              sjcl.codec.hex.toBits(_hash) : _hash;

  if (typeof hash !== 'object' ||
      typeof hash[0] !== 'number' ||
      hash.length <= 0) {
    throw new Error('Hash must be a bitArray or hex-encoded string');
  }

  var secret_key = !(secret_key_ instanceof sjcl.ecc.ecdsa.secretKey) ?
        Seed.from_json(secret_key_).get_key(account)._secret : secret_key_;

  var PARANOIA_256_BITS = 6; // sjcl constant for ensuring 256 bits of entropy
  var signature_bits = secret_key.signWithRecoverablePublicKey(hash,
    PARANOIA_256_BITS);
  var signature_base64 = sjcl.codec.base64.fromBits(signature_bits);

  return signature_base64;

};


/**
 *  Verify the signature on a given message.
 *
 *  Note that this function is asynchronous.
 *  The brt-lib remote is used to check that the public
 *  key extracted from the signature corresponds to one that is currently
 *  active for the given account.
 *
 *  @static
 *
 *  @param {String} data.message
 *  @param {RippleAddress} data.account
 *  @param {Base64-encoded String} data.signature
 *  @param {brt-lib Remote} remote
 *  @param {Function} callback
 *
 *  @callback callback
 *  @param {Error} error
 *  @param {boolean} is_valid true if the signature is valid, false otherwise
 */
Message.verifyMessageSignature = function(data, remote, callback) {

  if (typeof data.message === 'string') {
    data.hash = Message.hashFunction(Message.MAGIC_BYTES + data.message);
  } else {
    return callback(new Error(
      'Data object must contain message field to verify signature'));
  }

  return Message.verifyHashSignature(data, remote, callback);

};


/**
 *  Verify the signature on a given hash.
 *
 *  Note that this function is asynchronous.
 *  The brt-lib remote is used to check that the public
 *  key extracted from the signature corresponds to one that is currently
 *  active for the given account.
 *
 *  @static
 *
 *  @param {bitArray|Hex-encoded String} data.hash
 *  @param {RippleAddress} data.account
 *  @param {Base64-encoded String} data.signature
 *  @param {brt-lib Remote} remote
 *  @param {Function} callback
 *
 *  @callback callback
 *  @param {Error} error
 *  @param {boolean} is_valid true if the signature is valid, false otherwise
 */
Message.verifyHashSignature = function(data, remote, callback) {

  if (typeof callback !== 'function') {
    throw new Error('Must supply callback function');
  }

  var hash = REGEX_HEX.test(data.hash) ?
                sjcl.codec.hex.toBits(data.hash) :
                            data.hash;

  if (typeof hash !== 'object' || hash.length <= 0
      || typeof hash[0] !== 'number') {
    return callback(new Error('Hash must be a bitArray or hex-encoded string'));
  }

  var account = data.account || data.address;
  if (!account || !UInt160.from_json(account).is_valid()) {
    return callback(new Error('Account must be a valid ripple address'));
  }

  var signature = data.signature;
  if (typeof signature !== 'string' || !REGEX_BASE64.test(signature)) {
    return callback(new Error('Signature must be a Base64-encoded string'));
  }

  var signature_bits = sjcl.codec.base64.toBits(signature);

  if (!(remote instanceof Remote) || remote.state !== 'online') {
    return callback(new Error(
      'Must supply connected Remote to verify signature'));
  }

  function recoverPublicKey(async_callback) {
    var public_key;
    try {
      public_key =
        sjcl.ecc.ecdsa.publicKey.recoverFromSignature(hash, signature_bits);
    } catch (err) {
      return async_callback(err);
    }

    if (public_key) {
      async_callback(null, public_key);
    } else {
      async_callback(new Error('Could not recover public key from signature'));
    }

  }

  function checkPublicKeyIsValid(public_key, async_callback) {
    // Get hex-encoded public key
    var bits = sjcl.codec.bytes.toBits(public_key._point.toBytesCompressed());
    var public_key_hex = sjcl.codec.hex.fromBits(bits);

    var account_class_instance = new Account(remote, account);
    account_class_instance.publicKeyIsActive(public_key_hex, async_callback);
  }

  var steps = [
    recoverPublicKey,
    checkPublicKeyIsValid
  ];

  async.waterfall(steps, callback);

};

return Message;
};
