const ILP = require('ilp')
const compat = require('ilp-compat-plugin')

module.exports = function handlePskRequest ({ res, payParams }) {
  const [ destinationAmount, destinationAccount, sharedSecret ] = payParams
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
}
