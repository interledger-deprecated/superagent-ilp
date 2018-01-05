'use strict'

const compat = require('ilp-compat-plugin')
const debug = require('debug')('superagent-ilp')
const ILP = require('ilp')
const uuid = require('uuid')
const moment = require('moment')
const crypto = require('crypto')
const PAYMENT_METHOD_IDENTIFIER = 'interledger-psk'

const base64url = buffer => buffer.toString('base64')
  .replace(/=/g, '')
  .replace(/\+/g, '-')
  .replace(/\//g, '_')

module.exports = (superagent, boundPlugin) => {
  const Request = superagent.Request
  Request.prototype.pay = pay

  const token = crypto.randomBytes(16)

  function pay (maxPrice, oneTimePlugin) {
    const plugin = oneTimePlugin || boundPlugin
    const prevEnd = this.end

    if (!maxPrice) {
      throw new Error('A maximum price must be provided')
    }

    this.set('Pay-Token', base64url(token))

    this.end = (fn) => {
      const timeout = this._timeout
      let firstAttempt = true

      return prevEnd.call(this, async (err, res) => {
        try {
          if (firstAttempt && err && err.status === 402) {
            firstAttempt = false
            debug('server responded 402 - Pay ' + res.get('Pay'))

            const payParams = res.get('Pay').split(' ')
            const paymentMethod = payParams[0].match(/[A-Za-z]/)
              ? payParams.shift()
              : PAYMENT_METHOD_IDENTIFIER
            const [ destinationAmount, destinationAccount, sharedSecret ] = payParams
            if (paymentMethod !== PAYMENT_METHOD_IDENTIFIER) {
              throw new Error('Unsupported payment method in "Pay" ' +
                'header: ' + res.get('Pay'))
            }

            const { packet, condition } = ILP.PSK.createPacketAndCondition({
              sharedSecret,
              destinationAccount,
              destinationAmount,
              data: token
            })

            debug('created packet and condition via PSK')

            const quote = await ILP.ILQP.quoteByPacket(plugin, packet)

            debug('sending transfer')
            const response = await compat(plugin).sendData(IlpPacket.serializeIlpPrepare({
              amount: quote.sourceAmount,
              executionCondition: condition,
              destination: destinationAccount,
              data: packet,
              expiresAt: new Date(Date.now() + 1000 * quote.sourceExpiryDuration)
            }))

            if (response[0] === IlpPacket.Type.TYPE_ILP_REJECT) {
              throw new Error('transfer was rejected. response=' + response.toString('hex')) 
            }

            this.called = false
            debug('retrying request with funded token')
            return this._retry()
          } else {
            fn && fn(err, res)
          }
        } catch (e) {
          fn && fn(e)
        }
      })
    }

    return this
  }

  return superagent
}
