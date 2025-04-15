// app/routes/room.tsx
import { redirect } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';

// export async function loader({ request }: { request: Request }) {
//   const session = await getSession(request.headers.get('Cookie'));
//   const roomInfo = session.get('roomInfo');

//   if (!roomInfo) return redirect('/');

//   return roomInfo; // No need for `json()` anymore!
// }

export default function RoomPage() {
  //const roomInfo = useLoaderData<typeof loader>();

  return (
    // <div>
    //   <h1>Welcome to Room: {roomInfo.roomName}</h1>
    //   <p>Room Code: {roomInfo.roomCode}</p>
    //   <p>Max Players: {roomInfo.maxPlayers}</p>
    // </div>
    <div>Hello</div>
  );
}
