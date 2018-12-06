const net = require('net')
const fs = require('fs')
const util = require('util')

const readFile = util.promisify(fs.readFile)
const protocol = 'HTTP/1.1'
const fileTypes = {
  '.txt': 'text/plain',
  '.html': 'text/html',
  '.css': 'text/css',
  '.json': 'application/json',
  '.js': 'application/javascript',
  '.png': 'image/png',
  '.jpeg': 'image/jpeg'
}
const contentTypes = {
  'text/plain': { 'decode': String, 'encode': String },
  'application/json': { 'decode': JSON.parse, 'encode': JSON.stringify },
  'application/x-www-form-urlencoded': { 'decode': decodeURI, 'encode': encodeURI }
}
const statusTypes = {
  'ok': '200 OK',
  'badreq': '400 Bad_Request',
  'notimp': '501 Not_Implemented',
  'errhand': '404 Not_Found'
}

var routes = { 'GET': {}, 'POST': {}, 'PUT': {}, 'DELETE': {} }

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
  socket.on('data', data => processRequest(data, socket))
}

function parseRequestLine (requestLine) {
  let info = requestLine[0].split(' ')
  if (info.length !== 3) {
    throw Error(requestLine, info)
  } return { 'method': info[0], 'target': info[1], 'protocol': info[2] }
}

function parseRequestHeader (request) {
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

function parseRequestBody (body, type) {
  try {
    return contentTypes[type].decode(body)
  } catch (err) {
    return body
  }
}

function parseRequest (request) {
  let lines = request.split('\r\n')
  let reqLine = parseRequestLine(lines.splice(0, 1))
  let [header, body] = parseRequestHeader(lines)
  body = parseRequestBody(body[0], header['Content-Type'])
  return { 'reqLine': reqLine, 'header': header, 'body': body }
}

function utcDate () {
  let d = new Date()
  return d.toUTCString()
}

function generateStatusLine (status) {
  status = statusTypes[status]
  return Buffer.from(`${protocol} ${status}\r\n`)
}

function generateResponseHeader (type, length) {
  let header = []
  header.push(`date: ${utcDate()}`)
  header.push('connection: keep-alive')
  if (length > 0) {
    header.push(`content-type: ${type}`)
    header.push(`content-length: ${length}`)
  }
  header.push('\n')
  return Buffer.from(header.join('\n'))
}

function encodeBody (body, type) {
  if (body.length === 0) {
    return ''
  }
  try {
    return contentTypes[type].encode(body)
  } catch (err) {
    return body // or return ''
  }
}

function generateResponse (body, type, status) {
  let header = generateResponseHeader(type, body.length)
  let statusLine = generateStatusLine(status)
  if (body.length > 0) {
    return Buffer.concat([statusLine, header, body])
  } return Buffer.concat([statusLine, header])
}

async function staticFileHandler (request, handlers) {
  if (request.reqLine.method !== 'GET') {
    return handlers.next().value(request, handlers)
  }
  let target = request.reqLine.target
  if (target === '/') {
    target = '/index.html'
  }
  target = `public${target}` // make variable
  try {
    let body = await readFile(target)
    let type = fileTypes[target.match(/[.](\w)+/)[0]]
    return generateResponse(body, type, 'ok')
  } catch (err) {
    return handlers.next().value(request, handlers)
  }
}

async function routeHandler (request, handlers) {
  try {
    let body = await routes[request.reqLine.method][request.reqLine.target](request)
    let type = request.header['Content-Type']
    body = Buffer.from(encodeBody(body, type))
    return generateResponse(body, type, 'ok')
  } catch (err) {
    return handlers.next().value(request, handlers)
  }
}

async function errHandler (request, handlers) {
  return generateResponse('', '', 'errhand')
}

function * genHandlers () {
  yield staticFileHandler
  yield routeHandler
  yield errHandler
}

async function requestHandler (request) {
  try {
    request = parseRequest(request)
  } catch (err) {
    console.log('Request is\n', request) // debug
    return generateResponse('', '', 'badreq') // bad request error
  }
  if (!Object.keys(routes).includes(request.reqLine.method)) { // not implemented error
    return generateResponse('', '', 'notimp')
  }
  let handlers = genHandlers()
  return handlers.next().value(request, handlers)
}

async function processRequest (request, socket) {
  let response = await requestHandler(request)
  // console.log(String(response)) // debug
  socket.write(response)
}
//
const server = createServer()
listen(server, 8000)
// addRoute('GET', '/tgt', req => 'random text')
addRoute('POST', '/echo', req => req.body)
