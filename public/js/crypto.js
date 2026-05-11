// Client-side E2E encryption module using Web Crypto API
const CryptoModule = (() => {
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  // Cache derived key in memory during session
  let cachedKey = null;
  let cachedPassword = null;

  async function getDerivedKey(password, salt) {
    if (cachedKey && cachedPassword === password) return cachedKey;

    const keyMaterial = await window.crypto.subtle.importKey(
      "raw",
      enc.encode(password),
      "PBKDF2",
      false,
      ["deriveKey"]
    );

    const key = await window.crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: salt || new Uint8Array(16), // Use provided salt or empty for derivation base
        iterations: 600000,
        hash: "SHA-256",
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"]
    );

    cachedKey = key;
    cachedPassword = password;
    return key;
  }

  async function encrypt(plaintext, password) {
    const salt = window.crypto.getRandomValues(new Uint8Array(16));
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    
    const key = await getDerivedKey(password, salt);
    
    const ciphertext = await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      enc.encode(plaintext)
    );

    const ui8ToB64 = (ui8) => btoa(String.fromCharCode.apply(null, ui8));

    return {
      ciphertext: ui8ToB64(new Uint8Array(ciphertext)),
      iv: ui8ToB64(iv),
      salt: ui8ToB64(salt)
    };
  }

  async function decrypt(encryptedObj, password) {
    try {
      const b64ToUi8 = (b64) => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      
      const salt = b64ToUi8(encryptedObj.salt);
      const iv = b64ToUi8(encryptedObj.iv);
      const ciphertext = b64ToUi8(encryptedObj.ciphertext);

      const key = await getDerivedKey(password, salt);

      const decrypted = await window.crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        key,
        ciphertext
      );

      return dec.decode(decrypted);
    } catch (err) {
      console.error("Decryption failed:", err);
      throw new Error("Invalid password or corrupted data");
    }
  }

  function clearCache() {
    cachedKey = null;
    cachedPassword = null;
  }

  return { encrypt, decrypt, clearCache };
})();

window.CryptoModule = CryptoModule;
