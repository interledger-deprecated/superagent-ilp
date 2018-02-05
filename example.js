const superagent = require('superagent')
const plugin = require('ilp-plugin')()
const superagentIlp = require('.')(superagent, plugin)

async function run () {
  await plugin.connect()
  const res = await superagentIlp
    .post('http://localhost:8080/hello')
    .pay(2000) // pays _up to_ 2000 base units of your ledger, as configured for ilp-plugin

  console.log(res.body)
  // -> { message: 'Hello World!' }
}

run()
