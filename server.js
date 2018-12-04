const net = require('net')
const fs = require('fs')

const resProtocol = 'HTTP/1.1'
const methods = ['GET']
const contentTypes = {
  '.txt': 'text/plain',
  '.html': 'text/html',
  '.css': 'text/css',
  '.json': 'application/json',
  '.js': 'application/javascript',
  '.png': 'image/png',
  '.jpeg': 'image/jpeg'
}

function handleConnection (socket) {
  console.log('Connection made')
  socket.on('error', (err) => console.log(err))
  socket.setEncoding('utf8')
  socket.on('data', data => socket.write(handleRequest(data)))
}

function parseRequestLine (requestLine) {
  let info = requestLine[0].split(' ')
  if (info.length !== 3) {
    throw Error()
  } return { 'method': info[0], 'target': info[1], 'protocol': info[2] }
}

function parseHeader (request) {
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

function parseBody (body, type) {
  if (!type) {
    return body
  } if (type === 'text/plain') {
    return toString(body)
  } if (type === 'application/json') {
    return JSON.parse(body)
  }
}

function parseRequest (request) {
  let lines = request.split('\r\n')
  let reqLine = parseRequestLine(lines.splice(0, 1))
  let [header, body] = parseHeader(lines)
  body = parseBody(body[0], header['Content-Type'])
  return [reqLine, header, body]
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

function generateResponseBody (target) {
  try {
    return fs.readFileSync(target, 'utf8')
  } catch (err) {
    console.log('File not found', target)
    return null
  }
}

function generateResponse (req) {
  let target = req[0].target
  if (target === '/') {
    target = '/index.html'
  }
  target = `public${target}`

  let body = generateResponseBody(target)
  let ext = target.match(/[.](\w)+/)[0]
  let length = body ? body.length : 0 // change error handling method
  let header = generateResponseHeader(ext, length)
  return header.concat(body)
}

function handleRequest (req) {
  let statusLine
  try {
    req = parseRequest(req)
  } catch (err) {
    console.log('Error', err)
    return `${resProtocol} 400 BadRequest\r\n`
  }
  if (!methods.includes(req[0].method)) {
    return `${resProtocol} 501 NotImplemented\r\n`
  }
  statusLine = `${resProtocol} 200 OK\r\n`
  let res = statusLine.concat(generateResponse(req))
  console.log(res) // debug
  return res
}

const server = net.createServer(handleConnection).on('error', (err) => console.log(err))
server.listen(8000, () => console.log('Listening'))
