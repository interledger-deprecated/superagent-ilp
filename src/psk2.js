const PSK2 = require('ilp-protocol-psk2')
const BigNumber = require('bignumber.js')
const debug = require('debug')('superagent-ilp:psk2')
const CHUNK_AMOUNT = 250 // TODO

async function streamPayment ({
  res,
  payParams,
  maxPrice,
  plugin,
  token
}) {
  const [ destinationAccount, _sharedSecret ] = payParams
  debug('streaming via psk2. destination=' + destinationAccount)

  const id = token
  const sharedSecret = Buffer.from(_sharedSecret, 'base64')
  let sequence = 0
  let total = 0

  this.set('Stream-Payment', true)

  debug('opening request while streaming payment.')
  let resolved = false
  this.called = false
  const promise = this._retry()
    .then((res) => {
      debug('streaming request success.')
      resolved = true
      return res
    })
    .catch((e) => {
      debug('streaming request failed. error=', e)
      resolved = true
      throw e
    })

  while (!resolved) {
    debug('streaming chunk via psk2. amount=' + CHUNK_AMOUNT,
      'total=' + total)
    if (new BigNumber(total).gt(maxPrice)) {
      throw new Error('streaming payment exceeds max price. total=' + total +
        'maxPrice=' + maxPrice)
    }

    try {
      await PSK2.sendSingleChunk(plugin, {
        id,
        destinationAccount,
        sharedSecret,
        sourceAmount: CHUNK_AMOUNT,
        lastChunk: false,
        sequence
      })
      total += CHUNK_AMOUNT
    } catch (e) {
      debug('error on payment chunk. message=' + e.message)
      resolved = true
    }
  }

  return promise
}

module.exports = async function handlePsk2Request (params) {
  const {
    payParams,
    maxPrice,
    plugin,
    token
  } = params
  const [ destinationAccount, _sharedSecret, destinationAmount ] = payParams
  const id = token
  const sharedSecret = Buffer.from(_sharedSecret, 'base64')

  if (!destinationAmount) {
    return streamPayment.call(this, params)
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
  await PSK2.sendSingleChunk(plugin, {
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
