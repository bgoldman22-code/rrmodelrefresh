// src/server/meta.js
export async function getModelVersion(){
  return process.env.APP_VERSION || "v1-locks";
}
export async function getCodeSha(){
  return process.env.COMMIT_REF || "dev";
}
