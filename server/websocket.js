import WebSocket, { WebSocketServer } from 'ws'

const sendJson = (socket, payload) => {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload))
  }
}

export const createMemeDropWebSocketServer = ({ server, serverKey }) => {
  const clients = new Set()
  const wss = new WebSocketServer({ server, path: '/ws' })

  wss.on('connection', (socket, request) => {
    const requestUrl = new URL(request.url ?? '/ws', `http://${request.headers.host}`)
    const requestKey = requestUrl.searchParams.get('key') ?? ''

    if (serverKey && requestKey !== serverKey) {
      console.warn('Client MemeDrop refusé: clé invalide.')
      socket.close(1008, 'Invalid MemeDrop key')
      return
    }

    clients.add(socket)
    console.log(`Client MemeDrop connecté (${clients.size} client(s)).`)
    sendJson(socket, { type: 'hello' })

    socket.on('close', () => {
      clients.delete(socket)
      console.log(`Client MemeDrop déconnecté (${clients.size} client(s)).`)
    })
  })

  const broadcastDrop = (drop) => {
    const payload = JSON.stringify({
      type: 'drop',
      drop,
    })
    let sentCount = 0

    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload)
        sentCount += 1
      }
    }

    return sentCount
  }

  return {
    clients,
    broadcastDrop,
    wss,
  }
}
