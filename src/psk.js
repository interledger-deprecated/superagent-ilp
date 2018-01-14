const ILP = require('ilp')
const BigNumber = require('bignumber.js')
const compat = require('ilp-compat-plugin')
const debug = require('debug')('superagent-ilp:psk')

module.exports = async function handlePskRequest ({ res, payParams, maxPrice, plugin }) {
  const [ destinationAmount, destinationAccount, sharedSecret ] = payParams
  const { packet, condition } = ILP.PSK.createPacketAndCondition({
    sharedSecret,
    destinationAccount,
    destinationAmount,
    data: token
  })

  debug('created packet and condition via PSK')

  const quote = await ILP.ILQP.quoteByPacket(plugin, packet)
  if (new BigNumber(quote.sourceAmount).gt(maxPrice)) {
    throw new Error('quoted psk source amount exceeds max acceptable price.' +
      ' sourceAmount=' + quote.sourceAmount +
      ' maxPrice=' + maxPrice)
  }

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
}
