const net = require('net')

function handleConnection (socket) {
  console.log('Connection made')
  socket.on('error', (err) => console.log(err))
  socket.setEncoding('utf8')
  socket.on('data', (data) => socket.write(data) && console.log(data))
}

const server = net.createServer(handleConnection).on('error', (err) => console.log(err))
server.listen(8000, () => console.log('Listening'))
