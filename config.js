module.exports = {
  'protocol': 'HTTP/1.1',
  'fileTypes': {
    '.txt': 'text/plain',
    '.html': 'text/html',
    '.css': 'text/css',
    '.json': 'application/json',
    '.js': 'application/javascript',
    '.png': 'image/png',
    '.jpeg': 'image/jpeg'
  },
  'contentTypes': {
    'text/plain': { 'decode': String, 'encode': String },
    'application/json': { 'decode': JSON.parse, 'encode': JSON.stringify },
    'application/x-www-form-urlencoded': { 'decode': decodeURI, 'encode': encodeURI }
  },
  'statusTypes': {
    'ok': '200 OK',
    'badreq': '400 Bad_Request',
    'notimp': '501 Not_Implemented',
    'errhand': '404 Not_Found'
  }
}
