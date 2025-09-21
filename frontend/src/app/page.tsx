"use client";
import Image from "next/image";
import Uploader from "./Uploader";

export default function Home() {
  const testShots = async () => {
    const uri =
      "s3://sceneit-chriszou-001/uploads918c75ff-d0c2-4401-abd5-4e0fc586e357.mov";

    const resp = await fetch(process.env.NEXT_PUBLIC_API + "/shots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        video_path: uri,
        save_frames: true, // uploads chosen keyframes to S3
        threshold: 0.15, // optional tuning
        min_shot_len_sec: 0.2, // optional tuning
      }),
    });
    const data = await resp.json();
    console.log(data);
  };

  return (
    <div className="font-sans flex flex-col items-center justify-items-center min-h-screen p-24">
      <main className="flex flex-col gap-20 row-start-2 items-center sm:items-start ">
        <h1 className="text-2xl font-bold">SceneIt</h1>
        <div className="flex flex-col gap-4 items-centersm:flex-row">
          <Uploader />
          <button
            className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-full"
            onClick={testShots}
          >
            Button
          </button>
        </div>
      </main>
    </div>
  );
}
