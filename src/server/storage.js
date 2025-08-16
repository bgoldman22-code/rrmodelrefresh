// src/server/storage.js
import { put } from "@netlify/blobs";

export async function storagePutJson(path, obj){
  const body = JSON.stringify(obj, null, 2);
  await put(path, body, {
    contentType: "application/json",
    addRandomSuffix: false
  });
}
