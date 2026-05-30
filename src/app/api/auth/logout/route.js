import { deleteSession } from '@/lib/session'

export async function POST(request) {
  await deleteSession()
  return Response.redirect(new URL('/login', request.url))
}
