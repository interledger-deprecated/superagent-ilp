# Superagent-ILP
> Extension of Superagent to pay for HTTP-ILP

To use Superagent ILP, combine the superagent module with an plugin (as
returned from [`ilp-plugin`](https://github.com/interledgerjs/ilp-plugin) in
this example).

```js
const superagent = require('superagent')
const plugin = require('ilp-plugin')()
const superagentIlp = require('superagent-ilp')(superagent, plugin)

async function run () {
  await plugin.connect()
  const res = await superagentIlp
    .post('http://localhost:8080/')
    .pay(2000) // pays _up to_ 2000 base units of your ledger, as configured for ilp-plugin

  console.log(res.body)
  // -> { message: 'Hello World!' }
}

run()
```

Below is an example of an application that can be paid for with `superagent-ilp`.
It's written using [`koa-ilp`](https://github.com/interledgerjs/koa-ilp). 

```js
const Koa = require('koa')
const router = require('koa-router')()
const parser = require('koa-bodyparser')()
const app = new Koa()

const Ilp = require('koa-ilp')
const plugin = require('ilp-plugin')()
const ilp = new Ilp({ plugin })

router.post('/', ilp.paid({ price: 1000 }), async ctx => {
  ctx.body = { message: 'Hello World!' }
})

app
  .use(parser)
  .use(router.routes())
  .use(router.allowedMethods())
  .listen(8080)
```

