'use strict'
var assert = require('assert')
var BigNumber = require('bignumber.js')

/*
The quality, as stored in the last 64 bits of a directory index, is stored as
the quotient of TakerPays/TakerGets. It uses drops (1e-6 BRT) for BRT values.
*/

function adjustQualityForBRT(quality, takerGetsCurrency, takerPaysCurrency) {
  var numeratorShift = (takerPaysCurrency === 'BRT' ? -6 : 0)
  var denominatorShift = (takerGetsCurrency === 'BRT' ? -6 : 0)
  var shift = numeratorShift - denominatorShift
  return shift === 0 ? (new BigNumber(quality)).toString() :
    (new BigNumber(quality)).shiftedBy(shift).toString()
}

function parseQuality(qualityHex, takerGetsCurrency, takerPaysCurrency) {
  assert(qualityHex.length === 16)
  var mantissa = new BigNumber(qualityHex.substring(2), 16)
  var offset = parseInt(qualityHex.substring(0, 2), 16) - 100
  var quality = mantissa.toString() + 'e' + offset.toString()
  return adjustQualityForBRT(quality, takerGetsCurrency, takerPaysCurrency)
}

module.exports = parseQuality
