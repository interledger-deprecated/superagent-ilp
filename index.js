'use strict'

const debug = require('debug')('superagent-ilp')
const ILP = require('ilp')
const uuid = require('uuid')
const moment = require('moment')
const crypto = require('crypto')

const base64url = buffer => buffer.toString('base64')
  .replace(/=/g, '')
  .replace(/\+/g, '-')
  .replace(/\//g, '_')

module.exports = (superagent, plugin) => {
  const Request = superagent.Request
  Request.prototype.pay = pay

  const token = crypto.randomBytes(16)

  function pay (maxPrice) {
    const prevEnd = this.end

    if (!maxPrice) {
      throw new Error('A maximum price must be provided')
    }

    this.set('Pay-Token', base64url(token))

    this.end = (fn) => {
      const timeout = this._timeout
      let firstAttempt = true

      return prevEnd.call(this, (err, res) => {
        if (firstAttempt && err && err.status === 402) {
          firstAttempt = false
          debug('server responded 402 - Pay ' + res.get('Pay'))

          const payParams = res.get('Pay').split(' ')
          if (payParams.length > 3) {
            throw new Error('This version of superagent ILP cannot parse ' +
              'this version of the "Pay" header: ' + res.get('Pay'))
          }

          const [ destinationAmount, destinationAccount, sharedSecret ] = payParams

          const { packet, condition } = ILP.PSK.createPacketAndCondition({
            sharedSecret,
            destinationAccount,
            destinationAmount,
            data: token
          })

          debug('created packet and condition via PSK')

          ILP.ILQP.quoteByPacket(plugin, packet)
            .then((quote) => {
              debug('sending transfer')
              return plugin.sendTransfer({
                id: uuid(),
                to: quote.connectorAccount,
                amount: quote.sourceAmount,
                expiresAt: moment()
                  .add(quote.sourceExpiryDuration, 'seconds')
                  .toISOString(),
                executionCondition: condition,
                ilp: packet
              })
            })
            .then(() => {
              return new Promise(resolve => {
                plugin.on('outgoing_fulfill', resolve)
              })
            })
            .then((transfer, fulfillment) => {
              this.called = false
              debug('retrying request with funded token')
              return this._retry()
            })
            .catch(err => fn && fn(err))
        } else {
          fn && fn(err, res)
        }
      })
    }

    return this
  }

  return superagent
}
