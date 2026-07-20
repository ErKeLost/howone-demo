export async function handleRealtimeSession() {
  return new Response(JSON.stringify({ error: '此实时会话路径已停用，请从“沟通”页启动豆包实时语音。' }), { status: 410, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
}
