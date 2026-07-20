import { Client, Databases, Storage, Query } from "appwrite"

const client = new Client()
client
  .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!)
  .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID!)

const databases = new Databases(client)
const storage = new Storage(client)

export type Certificate = {
  'CERTIFICATE_NO': string
  Certificate_photograph: string
  [key: string]: string
}

export async function findCertificate(
  input: string
): Promise<Certificate | null> {
  try {
    const { documents, error } = await databases.listDocuments(
      process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!,
      process.env.NEXT_PUBLIC_APPWRITE_CERTIFICATES_COLLECTION!,
      [Query.equal("CERTIFICATE_NO", input.trim())]
    )

    if (error || documents.length === 0) return null

    const data = documents[0]

    // Convert Appwrite Storage file ID to viewable URL
    let imageUrl = ""
    if (data.Certificate_photograph) {
      imageUrl = `/api/certificate-image/${data.Certificate_photograph}`
    }

    // Return ALL fields dynamically
    const result: Certificate = {
      'CERTIFICATE_NO': data['CERTIFICATE_NO'] as string,
      Certificate_photograph: imageUrl,
    }

    Object.entries(data).forEach(([key, value]) => {
      if (!key.startsWith("$") && key !== "CERTIFICATE_NO" && key !== "Certificate_photograph") {
        result[key] = String(value ?? "")
      }
    })

    return result
  } catch (error) {
    console.error("Appwrite :: findCertificate error:", error)
    return null
  }
}