function parseLine (line) {
  return /^\r\nContent-Disposition: form-data; name="(\w*)"\r\n\r\n(\w*)\r\n--/.exec(line)
}

exports.parseFormData = function (data, boundary) {
  boundary = boundary.slice(9)
  data = data.split(boundary)
  data = data.splice(1, data.length - 2)
  data = data.map(line => parseLine(line))

  let body = {}
  for (let line of data) {
    if (line !== null) {
      body[line[1]] = line[2]
    }
  }
  return body
}
