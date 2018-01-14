const PSK2 = require('ilp-protocol-psk2')
const BigNumber = require('bignumber.js')
const debug = require('debug')('superagent-ilp:psk2')

module.exports = async function handlePsk2Request ({
  res,
  payParams,
  maxPrice,
  plugin,
  token
}) {
  const [ destinationAccount, _sharedSecret, destinationAmount ] = payParams
  const id = token
  const sharedSecret = Buffer.from(_sharedSecret, 'base64')
  if (!destinationAmount) { // TODO: behavior in this case
    throw new Error('this endpoint has no fixed destination amount')
  }

  debug('quoting destination amount via psk2. amount=' + destinationAmount,
    'account=' + destinationAccount)
  const { sourceAmount } = await PSK2.quoteDestinationAmount(plugin, {
    id,
    sharedSecret,
    destinationAccount,
    destinationAmount,  
    sequence: 0
  })

  if (new BigNumber(sourceAmount).gt(maxPrice)) {
    throw new Error('quoted psk2 source amount exceeds max acceptable price.' +
      ' sourceAmount=' + sourceAmount +
      ' maxPrice=' + maxPrice)
  }

  debug('sending payment via psk2. sourceAmount=' + sourceAmount)
  const response = await PSK2.sendSingleChunk(plugin, {
    id,
    destinationAccount,
    sharedSecret,
    sourceAmount,
    minDestinationAmount: destinationAmount,
    sequence: 1
  })

  this.called = false
  debug('retrying request with funded token')
  return this._retry()
}
