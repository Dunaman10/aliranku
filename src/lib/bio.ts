/**
 * Helper WebAuthn (Biometric / Passkey / Sidik Jari)
 */

export function isBiometricSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.PublicKeyCredential !== undefined &&
    typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function'
  )
}

const CRED_ID_KEY = 'aliranku-bio-credential-id'

export function getSavedCredentialId(): string | null {
  return localStorage.getItem(CRED_ID_KEY)
}

export function saveCredentialId(id: string) {
  localStorage.setItem(CRED_ID_KEY, id)
}

export function removeCredentialId() {
  localStorage.removeItem(CRED_ID_KEY)
}

/** Registers biometric credential (passkey) */
export async function registerBiometric(): Promise<boolean> {
  if (!isBiometricSupported()) return false

  try {
    const userId = new Uint8Array(16)
    crypto.getRandomValues(userId)
    const challenge = new Uint8Array(32)
    crypto.getRandomValues(challenge)

    const credential = (await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: { name: 'Aliranku App' },
        user: {
          id: userId,
          name: 'user@aliranku',
          displayName: 'Pengguna Aliranku',
        },
        pubKeyCredParams: [{ alg: -7, type: 'public-key' }, { alg: -257, type: 'public-key' }],
        authenticatorSelection: {
          userVerification: 'required',
          authenticatorAttachment: 'platform',
        },
        timeout: 60000,
      },
    })) as PublicKeyCredential | null

    if (credential && credential.id) {
      saveCredentialId(credential.id)
      return true
    }
    return false
  } catch (err) {
    console.error('Biometric registration error:', err)
    return false
  }
}

/** Verifies biometric credential */
export async function verifyBiometric(): Promise<boolean> {
  if (!isBiometricSupported()) return false
  const savedId = getSavedCredentialId()
  if (!savedId) return false

  try {
    const challenge = new Uint8Array(32)
    crypto.getRandomValues(challenge)

    // Decode base64url or raw string ID
    const rawId = Uint8Array.from(atob(savedId.replace(/-/g, '+').replace(/_/g, '/')), (c) =>
      c.charCodeAt(0),
    )

    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        allowCredentials: [
          {
            id: rawId,
            type: 'public-key',
          },
        ],
        userVerification: 'required',
        timeout: 60000,
      },
    })

    return assertion !== null
  } catch (err) {
    console.error('Biometric verification error:', err)
    // Fallback: jika challenge dengan specific ID gagal (misal encoding beda), coba prompt platform authenticator generic
    try {
      const challenge = new Uint8Array(32)
      crypto.getRandomValues(challenge)
      const assertion = await navigator.credentials.get({
        publicKey: {
          challenge,
          userVerification: 'required',
          timeout: 60000,
        },
      })
      return assertion !== null
    } catch {
      return false
    }
  }
}
