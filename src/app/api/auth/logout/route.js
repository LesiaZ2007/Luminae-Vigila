import { deleteSession } from '@/lib/session'

export async function POST() {
  await deleteSession()
  return Response.redirect(new URL('/login', process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'))
}
