import type http from 'node:http'

export const sendJsonResponse = (
  response: http.ServerResponse,
  statusCode: number,
  payload: unknown,
) => {
  response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(payload))
}

export const sendTextResponse = (
  response: http.ServerResponse,
  statusCode: number,
  body: string,
) => {
  response.writeHead(statusCode, { 'content-type': 'text/plain; charset=utf-8' })
  response.end(body)
}
