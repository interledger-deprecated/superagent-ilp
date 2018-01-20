'use strict'

const debug = require('debug')('superagent-ilp')
const crypto = require('crypto')

const PSK_IDENTIFIER = 'interledger-psk'
const handlePskRequest = require('./src/psk')

const PSK_2_IDENTIFIER = 'interledger-psk2'
const handlePsk2Request = require('./src/psk2')

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
      let firstAttempt = true

      return prevEnd.call(this, async (err, res) => {
        try {
          if (firstAttempt && err && err.status === 402) {
            firstAttempt = false
            debug('server responded 402 - Pay ' + res.get('Pay'))

            const payParams = res.get('Pay').split(' ')
            const paymentMethod = payParams[0].match(/[A-Za-z]/)
              ? payParams.shift()
              : PSK_IDENTIFIER

            let handler
            switch (paymentMethod) {
              case PSK_IDENTIFIER:
                handler = handlePskRequest
                break
              case PSK_2_IDENTIFIER:
                handler = handlePsk2Request
                break
              default:
                throw new Error('unsupported payment method in `Pay`. ' +
                  'header=' + res.get('Pay'))
            }

            return handler.call(this, { res, payParams, maxPrice, plugin, token })
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
