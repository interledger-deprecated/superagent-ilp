const PSK2 = require('ilp-protocol-psk2')
const BigNumber = require('bignumber.js')
const crypto = require('crypto')
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
      const result = await PSK2.sendRequest(plugin, {
        destinationAccount,
        sharedSecret,
        sourceAmount: CHUNK_AMOUNT,
        data: token
      })
      if (!result.fulfilled) {
        throw new Error(`payment rejected with code: ${result.code}${result.data.length ? ' ' + result.data.toString('utf8') : ''}`)
      }
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
  const sharedSecret = Buffer.from(_sharedSecret, 'base64')

  if (!destinationAmount) {
    return streamPayment.call(this, params)
  }

  debug('quoting destination amount via psk2. amount=' + destinationAmount,
    'account=' + destinationAccount)
  const testPaymentAmount = 1000
  const testPaymentResult = await PSK2.sendRequest(plugin, {
    sharedSecret,
    destinationAccount,
    sourceAmount: testPaymentAmount,
    unfulfillableCondition: crypto.randomBytes(32)
  })
  const sourceAmount = new BigNumber(destinationAmount)
    .dividedBy(testPaymentResult.destinationAmount)
    .times(testPaymentAmount)
    .round(0, BigNumber.ROUND_CEIL)

  if (new BigNumber(sourceAmount).gt(maxPrice)) {
    throw new Error('quoted psk2 source amount exceeds max acceptable price.' +
      ' sourceAmount=' + sourceAmount +
      ' maxPrice=' + maxPrice)
  }

  debug('sending payment via psk2. sourceAmount=' + sourceAmount)
  const result = await PSK2.sendRequest(plugin, {
    destinationAccount,
    sharedSecret,
    sourceAmount,
    minDestinationAmount: destinationAmount,
    data: token
  })
  if (!result.fulfilled) {
    throw new Error(`payment rejected with code: ${result.code}${result.data.length ? ' ' + result.data.toString('utf8') : ''}`)
  }

  this.called = false
  debug('retrying request with funded token')
  return this._retry()
}
