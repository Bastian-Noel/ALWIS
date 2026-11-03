const database = new Promise((resolve, reject) => {
  const request = indexedDB.open("pbl-studio-state", 1);
  request.onupgradeneeded = () => request.result.createObjectStore("state");
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});
export async function readState(key) {
  const db = await database;
  return new Promise((resolve, reject) => {
    const request = db.transaction("state").objectStore("state").get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function writeState(key, value) {
  const db = await database;
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("state", "readwrite");
    transaction.objectStore("state").put(value, key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}
export async function deleteState(keys) {
  const db = await database;
  return new Promise((resolve, reject) => {
    const tx = db.transaction("state", "readwrite");
    for (const key of keys) tx.objectStore("state").delete(key);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
