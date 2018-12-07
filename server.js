const api = require('./api')

const server = api.createServer()
api.listen(server, 8000)
api.addRoute('GET', '/tgt', req => 'random text')
api.addRoute('POST', '/echo', req => req.body)
