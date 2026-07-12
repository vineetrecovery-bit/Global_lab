import { Client, Account, Databases, Storage, ID, Query } from "appwrite"

const client = new Client()
client
  .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!)
  .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID!)

const account = new Account(client)
const databases = new Databases(client)
const storage = new Storage(client)

const DB_ID = process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!
const COLL_ID = process.env.NEXT_PUBLIC_APPWRITE_CERTIFICATES_COLLECTION!
const BUCKET_ID = process.env.NEXT_PUBLIC_APPWRITE_BUCKET_ID!

// ---- Auth ----
export async function adminLogin(email: string, password: string) {
  return account.createEmailPasswordSession(email, password)
}

export async function adminLogout() {
  return account.deleteSession("current")
}

export async function getAdminUser() {
  try {
    return await account.get()
  } catch {
    return null
  }
}

// ---- Documents (Rows) ----
export async function getAllDocuments() {
  const { documents } = await databases.listDocuments(DB_ID, COLL_ID, [
    Query.limit(200),
    Query.orderDesc("$createdAt"),
  ])
  return documents
}

export async function createDocument(data: Record<string, unknown>) {
  return databases.createDocument(DB_ID, COLL_ID, ID.unique(), data)
}

export async function updateDocument(
  docId: string,
  data: Record<string, unknown>
) {
  // Remove Appwrite internal fields — they cannot be updated
  const clean: Record<string, unknown> = {}
  Object.entries(data).forEach(([key, value]) => {
    if (!key.startsWith("$")) {
      clean[key] = value
    }
  })
  return databases.updateDocument(DB_ID, COLL_ID, docId, clean)
}

export async function deleteDocument(docId: string) {
  return databases.deleteDocument(DB_ID, COLL_ID, docId)
}

// ---- Attributes (Columns) ----
export async function getAttributes() {
  const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!
  const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID!

  try {
    // Appwrite v26 removed listAttributes from client SDK — use REST API directly
    const res = await fetch(
      `${endpoint}/databases/${DB_ID}/collections/${COLL_ID}/attributes`,
      {
        headers: {
          'X-Appwrite-Project': projectId,
        },
      }
    )

    if (!res.ok) throw new Error('REST API failed')

    const data = await res.json()
    return (data.attributes || []).map((a: any) => ({
      key: a.key,
      type: a.type,
      size: a.size || 0,
      required: a.required || false,
      status: a.status || 'available',
      $id: a.key,
    }))
  } catch {
    // Final fallback: scan document keys
    const docs = await getAllDocuments()
    const keys = new Set<string>()
    docs.forEach((doc) => {
      Object.keys(doc).forEach((k) => {
        if (!k.startsWith("$")) keys.add(k)
      })
    })
    return Array.from(keys).map((key) => ({
      key,
      type: "string",
      size: 0,
      required: false,
      status: "available",
      $id: key,
    }))
  }
}

export async function addStringColumn(key: string, size: number = 500) {
  // Method 1: createAttribute with string type
  try {
    await (databases as any).createAttribute(DB_ID, COLL_ID, key, "string", size, false)
  } catch (e1) {
    // Method 2: createStringAttribute (older SDK)
    try {
      await (databases as any).createStringAttribute(DB_ID, COLL_ID, key, size, false)
    } catch (e2) {
      // Method 3: Check what methods actually exist
      const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(databases)).filter(m => m.toLowerCase().includes('attrib') || m.toLowerCase().includes('string'))
      throw new Error(
        `Cannot create column. SDK methods found: ${methods.join(', ') || 'NONE'}. ` +
        `Error 1: ${e1?.message || e1}. Error 2: ${e2?.message || e2}`
      )
    }
  }

  // Poll until ready
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 1000))
    try {
      const { attributes } = await databases.listAttributes(DB_ID, COLL_ID)
      const attr = attributes.find((a: any) => a.key === key)
      if (attr && attr.status === "available") return true
    } catch {
      // keep polling
    }
  }
  return false
}


export async function removeColumn(key: string) {
  try {
    return await databases.deleteAttribute(DB_ID, COLL_ID, key)
  } catch {
    return (databases as any).deleteAttribute(DB_ID, COLL_ID, key)
  }
}

export async function renameColumn(oldKey: string, newKey: string) {
  const docs = await getAllDocuments()
  await addStringColumn(newKey, 500)
  for (const doc of docs) {
    const val = doc[oldKey]
    if (val !== undefined && val !== null) {
      const clean: Record<string, unknown> = {}
      clean[newKey] = val
      await updateDocument(doc.$id, clean)
    }
  }
  await removeColumn(oldKey)
  return true
}

// ---- Storage ----
export async function uploadImage(file: File): Promise<string> {
  const result = await storage.createFile(BUCKET_ID, ID.unique(), file)
  return result.$id
}

export function getImageUrl(fileId: string): string {
  return `/api/certificate-image/${fileId}`
}