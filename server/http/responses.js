export const sendJsonResponse = (response, statusCode, payload) => {
  response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(payload))
}

export const sendTextResponse = (response, statusCode, body) => {
  response.writeHead(statusCode, { 'content-type': 'text/plain; charset=utf-8' })
  response.end(body)
}
