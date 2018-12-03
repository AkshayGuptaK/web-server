const net = require('net')
const resProtocol = 'HTTP/1.1'

function handleConnection (socket) {
  console.log('Connection made')
  socket.on('error', (err) => console.log(err))
  socket.setEncoding('utf8')
  socket.on('data', handleRequest) // socket.write for echo server
}

function parseReqLine (requestLine) {
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

function parseBody (body) {
  return body
}

function parseRequest (request) {
  let lines = request.split('\r\n')
  let reqLine = parseReqLine(lines.splice(0, 1))
  console.log('splice is', lines) // debug
  let [header, body] = parseHeader(lines)
  body = parseBody(body[0])
  return [reqLine, header, body]
}

function handleRequest (req) {
  try {
    req = parseRequest(req)
    console.log(req) // debug
    return `${resProtocol} 200 OK\n`
  } catch (err) {
    console.log('Error', err)
    return `${resProtocol} 400 Bad Request\n`
  }
}

const server = net.createServer(handleConnection).on('error', (err) => console.log(err))
server.listen(8000, () => console.log('Listening'))
