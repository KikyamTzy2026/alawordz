import RoomClient from "@/components/RoomClient";

export default function Page({ params }: { params: { code: string } }) {
  return <RoomClient code={params.code.toUpperCase().replace(/[^A-Z0-9]/g, "")} />;
}
