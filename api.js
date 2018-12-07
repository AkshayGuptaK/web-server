const net = require('net')
const fs = require('fs')
const util = require('util')

const config = require('./config')
const readFile = util.promisify(fs.readFile)
var routes = { 'GET': {}, 'POST': {}, 'PUT': {}, 'DELETE': {} }

exports.createServer = function () {
  return net.createServer(handleConnection).on('error', (err) => console.log(err))
}

exports.listen = function (server, port) {
  server.listen(port, () => console.log('Listening'))
}

exports.addRoute = function (method, route, controller) {
  routes[method][route] = controller
}

function handleConnection (socket) {
  console.log('Connection made')
  let request = { 'reqLine': '', 'header': {}, 'body': '' }
  socket.on('error', (err) => console.log(err))
  socket.setEncoding('utf8')
  socket.on('data', data => processData(data, request, socket))
}

function processData (data, request, socket) {
  let needed = request.header['content-length']
  if (needed !== undefined) {
    if (request.header.done) {
      request.body = request.body.concat(data)
      checkContentLength(needed, request, socket)
    } else {
      let lines = data.split('\r\n')
      let body = setHeader(lines, request)
      checkBody(needed, body, request, socket)
    }
  } else {
    let lines = data.split('\r\n')
    if (request.reqLine !== '') {
      if (request.header.done) {
        clearRequest(request)
        socket.write(generateResponse('', '', 'badreq'))
      } else {
        let body = setHeader(lines, request)
        needed = request.header['content-length']
        if (request.header.done) {
          checkBody(needed, body, request, socket)
        }
      }
    } else { // executed if no req line i.e. fresh request
      request['reqLine'] = parseRequestLine(lines.splice(0, 1))
      let body = setHeader(lines, request)
      needed = request.header['content-length']
      if (request.header.done) {
        checkBody(needed, body, request, socket)
      }
    }
  }
}

function checkContentLength (needed, request, socket) {
  let length = Buffer.byteLength(request.body)
  needed = (needed === undefined) ? 0 : Number(needed)
  if (needed === length) {
    submitRequest(request, socket)
  } else if (needed < length) {
    clearRequest(request)
    socket.write(generateResponse('', '', 'badreq'))
  }
}

function checkBody (needed, body, request, socket) {
  body = body.join('\r\n')
  if (body) {
    request.body = request.body.concat(body)
    checkContentLength(needed, request, socket)
  } else if (request.header.done) {
    submitRequest(request, socket)
  }
}

function setHeader (lines, request) {
  let [header, body] = parseRequestHeader(lines)
  Object.assign(request.header, header)
  return body
}

function submitRequest (request, socket) {
  request.body = parseRequestBody(request.body, request.header['content-type'])
  let req = {}
  Object.assign(req, request)
  processRequest(req, socket)
  clearRequest(request)
}

function clearRequest (request) {
  request.reqLine = ''
  request.header = {}
  request.body = ''
}

// function parseRequest (request) {
//   console.log('Request is\n', request)// debug
//   let lines = request.split('\r\n')
//   let reqLine = parseRequestLine(lines.splice(0, 1))
//   let [header, body] = parseRequestHeader(lines)
//   body = parseRequestBody(body, header['content-type'])
//   return { 'reqLine': reqLine, 'header': header, 'body': body }
// }

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
      header.done = true
      return [header, request.splice(i + 1)]
    }
    headerField = request[i].split(/:(.+)/)
    header[headerField[0].toLowerCase()] = headerField[1].trim()
  } return [header, '']
}

function parseRequestBody (body, type) {
  try {
    let typeData = type.split('; ')
    type = typeData.splice(0, 1)
    return config.contentTypes[type[0]].decode(body, ...typeData)
  } catch (err) {
    return body
  }
}

function utcDate () {
  let d = new Date()
  return d.toUTCString()
}

function generateStatusLine (status) {
  status = config.statusTypes[status]
  return Buffer.from(`${config.protocol} ${status}\r\n`)
}

function generateResponseHeader (type, length) {
  let header = []
  header.push(`date: ${utcDate()}`)
  header.push('connection: keep-alive')
  header.push(`content-length: ${length}`)
  if (length > 0) {
    header.push(`content-type: ${type}`)
  }
  header.push('\n')
  return Buffer.from(header.join('\n'))
}

function encodeBody (body, type) {
  if (body.length === 0) {
    return ''
  }
  try {
    return config.contentTypes[type].encode(body)
  } catch (err) {
    return body
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
    let type = config.fileTypes[target.match(/[.](\w)+/)[0]]
    return generateResponse(body, type, 'ok')
  } catch (err) {
    return handlers.next().value(request, handlers)
  }
}

async function routeHandler (request, handlers) {
  try {
    let body = await routes[request.reqLine.method][request.reqLine.target](request)
    let type = request.header['content-type']
    let typeData = type.split('; ')
    type = typeData.splice(0, 1)
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
  if (!Object.keys(routes).includes(request.reqLine.method)) { // method not implemented error
    return generateResponse('', '', 'notimp')
  }
  let handlers = genHandlers()
  return handlers.next().value(request, handlers)
}

async function processRequest (request, socket) {
  let response = await requestHandler(request)
  socket.write(response)
}
