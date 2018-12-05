const net = require('net')
const fs = require('fs')
const util = require('util')

const readFile = util.promisify(fs.readFile)
const resProtocol = 'HTTP/1.1'
const contentTypes = {
  '.txt': 'text/plain',
  '.html': 'text/html',
  '.css': 'text/css',
  '.json': 'application/json',
  '.js': 'application/javascript',
  '.png': 'image/png',
  '.jpeg': 'image/jpeg'
}
var routes = { 'GET': {}, 'POST': {} }

function createServer () {
  return net.createServer(handleConnection).on('error', (err) => console.log(err))
}

function listen (server, port) {
  server.listen(port, () => console.log('Listening'))
}

function addRoute (method, route, controller) {
  routes[method][route] = controller
}

function handleConnection (socket) {
  console.log('Connection made')
  socket.on('error', (err) => console.log(err))
  socket.setEncoding('utf8')
  socket.on('data', data => requestHandler(data, socket))
}

function parseRequestLine (requestLine) {
  let info = requestLine[0].split(' ')
  if (info.length !== 3) {
    throw Error()
  } return { 'method': info[0], 'target': info[1], 'protocol': info[2] }
}

function parseReqHeader (request) {
  let header = { }
  let headerField

  for (let i = 0; i < request.length; i++) {
    if (!request[i]) {
      return [header, request.splice(i + 1)]
    }
    headerField = request[i].split(/:(.+)/)
    header[headerField[0]] = headerField[1].trim()
  }
}

function parseReqBody (body, type) {
  if (!type) {
    return body
  } if (type === 'text/plain') {
    return toString(body)
  } if (type === 'application/json') {
    return JSON.parse(body)
  } if (type === 'text/uri-list') { // needs testing
    return decodeURI(body)
  }
}

function parseRequest (request) {
  let lines = request.split('\r\n')
  let reqLine = parseRequestLine(lines.splice(0, 1))
  let [header, body] = parseReqHeader(lines)
  body = parseReqBody(body[0], header['Content-Type'])
  return { 'reqLine': reqLine, 'header': header, 'body': body }
}

function utcDate () {
  let d = new Date()
  return d.toUTCString()
}

function generateResponseHeader (extension, length) {
  let header = []
  header.push(`date: ${utcDate()}`)
  header.push(`content-type: ${contentTypes[extension]}`)
  header.push(`content-length: ${length}`)
  header.push('connection: keep-alive')
  header.push('\n')
  return header.join('\n')
}

async function staticFileHandler (request, handlers) {
  if (request.reqLine.method !== 'GET') {
    return handlers.next().value(request, handlers)
  }
  let target = request.reqLine.target
  if (target === '/') {
    target = '/index.html'
  }
  target = `public${target}`
  try {
    let body = await readFile(target)
    let ext = target.match(/[.](\w)+/)[0]
    let header = Buffer.from(generateResponseHeader(ext, body.length))
    return [header, body]
  } catch (err) {
    console.log('Error is', err) // debug
    return handlers.next().value(request, handlers)
  }
}

async function routeHandler (request, handlers) {
  try {
    return routes[request.reqLine.method][request.reqLine.target](request)
  } catch (err) {
    console.log('Error is', err) // debug
    return handlers.next().value(request, handlers)
  }
}

async function errHandler (request, handlers) {
  return null// send a 404 error
}

function * genHandlers () {
  yield staticFileHandler
  yield routeHandler
  yield errHandler
}

async function requestHandler (request, socket) {
  let req
  try {
    req = parseRequest(request)
  } catch (err) {
    console.log('Error', err)
    return `${resProtocol} 400 BadRequest\r\n`
  }
  if (!Object.keys(routes).includes(req.reqLine.method)) {
    return `${resProtocol} 501 NotImplemented\r\n`
  }
  let handlers = genHandlers()
  let res = await handlers.next().value(req, handlers)
  let statusLine = `${resProtocol} 200 OK\r\n`
  statusLine = Buffer.from(statusLine)
  res = Buffer.concat([statusLine, ...res])
  socket.write(res)
}

const server = createServer()
listen(server, 8000)
