import { Client, Account, Databases, Storage, ID, Query } from 'appwrite';

// ========== CLIENT SETUP ==========
const client = new Client();

client
  .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!)
  .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID!);

// ========== INSTANCES ==========
export const account = new Account(client);
export const databases = new Databases(client);
export const storage = new Storage(client);

// ========== CONFIG ==========
export const CONFIG = {
  databaseId: process.env.NEXT_PUBLIC_APPWRITE_DATABASE_ID!,
  certificatesCollection: process.env.NEXT_PUBLIC_APPWRITE_CERTIFICATES_COLLECTION!,
  requestsCollection: process.env.NEXT_PUBLIC_APPWRITE_REQUESTS_COLLECTION!,
  bucketId: process.env.NEXT_PUBLIC_APPWRITE_BUCKET_ID!,
} as const;

// ========== TYPES ==========
export interface Certificate {
  $id: string;
  certificateId: string;       // Human-readable like "GL-2025-00123"
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  rudrakshaType: string;       // "Nepal", "Indonesian", "Java"
  mukhiCount: string;          // "1", "2", ... "21"
  weight: string;              // in grams
  origin: string;
  testDate: string;            // ISO date
  xrayResult: string;
  densityResult: string;
  microscopicResult: string;
  overallResult: string;       // "Genuine", "Artificial", "Tampered"
  grade: string;               // "A+", "A", "B", "C"
  remarks: string;
  imageUrl: string;
  status: string;              // "issued", "revoked"
  createdAt: string;
  updatedAt: string;
}

export interface TestRequest {
  $id: string;
  requestId: string;           // Human-readable tracking ID
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  address: string;
  rudrakshaType: string;
  mukhiCount: string;
  quantity: string;
  specialInstructions: string;
  status: 'received' | 'testing' | 'completed' | 'dispatched';
  estimatedDelivery: string;
  createdAt: string;
  updatedAt: string;
}

// ========== HELPER: Generate Human-Readable ID ==========
export function generateCertificateId(): string {
  const year = new Date().getFullYear();
  const random = Math.floor(Math.random() * 99999).toString().padStart(5, '0');
  return `GL-${year}-${random}`;
}

export function generateRequestId(): string {
  const year = new Date().getFullYear();
  const month = (new Date().getMonth() + 1).toString().padStart(2, '0');
  const random = Math.floor(Math.random() * 9999).toString().padStart(4, '0');
  return `REQ-${year}${month}-${random}`;
}

// ========== CERTIFICATE FUNCTIONS ==========

/**
 * Create a new certificate in Appwrite DB
 * Called by staff from the dashboard
 */
export async function createCertificate(data: Omit<Certificate, '$id' | 'createdAt' | 'updatedAt'>) {
  try {
    const response = await databases.createDocument(
      CONFIG.databaseId,
      CONFIG.certificatesCollection,
      ID.unique(),
      {
        certificateId: data.certificateId,
        customerName: data.customerName,
        customerEmail: data.customerEmail,
        customerPhone: data.customerPhone,
        rudrakshaType: data.rudrakshaType,
        mukhiCount: data.mukhiCount,
        weight: data.weight,
        origin: data.origin,
        testDate: data.testDate,
        xrayResult: data.xrayResult,
        densityResult: data.densityResult,
        microscopicResult: data.microscopicResult,
        overallResult: data.overallResult,
        grade: data.grade,
        remarks: data.remarks,
        imageUrl: data.imageUrl,
        status: data.status || 'issued',
      }
    );
    return response;
  } catch (error) {
    console.error('Appwrite :: createCertificate error:', error);
    throw error;
  }
}

/**
 * Fetch a certificate by human-readable certificateId
 * Used by the "Verify Certificate" feature (customer-facing)
 */
export async function getCertificateByCertId(certificateId: string) {
  try {
    const response = await databases.listDocuments(
      CONFIG.databaseId,
      CONFIG.certificatesCollection,
      [Query.equal('certificateId', certificateId)]
    );

    if (response.documents.length === 0) {
      return null;
    }

    return response.documents[0] as unknown as Certificate;
  } catch (error) {
    console.error('Appwrite :: getCertificateByCertId error:', error);
    throw error;
  }
}

/**
 * Get all certificates (staff dashboard, paginated)
 */
export async function getAllCertificates(offset = 0, limit = 20) {
  try {
    const response = await databases.listDocuments(
      CONFIG.databaseId,
      CONFIG.certificatesCollection,
      [Query.orderDesc('$createdAt'), Query.limit(limit), Query.offset(offset)]
    );
    return {
      documents: response.documents as unknown as Certificate[],
      total: response.total,
    };
  } catch (error) {
    console.error('Appwrite :: getAllCertificates error:', error);
    throw error;
  }
}

// ========== TEST REQUEST FUNCTIONS ==========

/**
 * Customer submits a new test request
 * This is PUBLIC — no auth required
 */
export async function createTestRequest(data: {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  address: string;
  rudrakshaType: string;
  mukhiCount: string;
  quantity: string;
  specialInstructions: string;
}) {
  try {
    const requestId = generateRequestId();
    const estimatedDelivery = new Date();
    estimatedDelivery.setDate(estimatedDelivery.getDate() + 7); // 7 working days

    const response = await databases.createDocument(
      CONFIG.databaseId,
      CONFIG.requestsCollection,
      ID.unique(),
      {
        requestId,
        customerName: data.customerName,
        customerEmail: data.customerEmail,
        customerPhone: data.customerPhone,
        address: data.address,
        rudrakshaType: data.rudrakshaType,
        mukhiCount: data.mukhiCount,
        quantity: data.quantity,
        specialInstructions: data.specialInstructions || '',
        status: 'received',
        estimatedDelivery: estimatedDelivery.toISOString(),
      }
    );
    return { document: response, requestId };
  } catch (error) {
    console.error('Appwrite :: createTestRequest error:', error);
    throw error;
  }
}

/**
 * Track a test request by ID (customer-facing)
 */
export async function trackTestRequest(requestId: string) {
  try {
    const response = await databases.listDocuments(
      CONFIG.databaseId,
      CONFIG.requestsCollection,
      [Query.equal('requestId', requestId)]
    );

    if (response.documents.length === 0) {
      return null;
    }

    return response.documents[0] as unknown as TestRequest;
  } catch (error) {
    console.error('Appwrite :: trackTestRequest error:', error);
    throw error;
  }
}

/**
 * Get all test requests (staff dashboard)
 */
export async function getAllTestRequests(offset = 0, limit = 20) {
  try {
    const response = await databases.listDocuments(
      CONFIG.databaseId,
      CONFIG.requestsCollection,
      [Query.orderDesc('$createdAt'), Query.limit(limit), Query.offset(offset)]
    );
    return {
      documents: response.documents as unknown as TestRequest[],
      total: response.total,
    };
  } catch (error) {
    console.error('Appwrite :: getAllTestRequests error:', error);
    throw error;
  }
}

/**
 * Update test request status (staff only)
 */
export async function updateRequestStatus(docId: string, status: TestRequest['status']) {
  try {
    return await databases.updateDocument(
      CONFIG.databaseId,
      CONFIG.requestsCollection,
      docId,
      { status }
    );
  } catch (error) {
    console.error('Appwrite :: updateRequestStatus error:', error);
    throw error;
  }
}

// ========== AUTH FUNCTIONS (Staff Only) ==========

export async function loginStaff(email: string, password: string) {
  try {
    return await account.createEmailPasswordSession(email, password);
  } catch (error) {
    console.error('Appwrite :: loginStaff error:', error);
    throw error;
  }
}

export async function logoutStaff() {
  try {
    return await account.deleteSession('current');
  } catch (error) {
    console.error('Appwrite :: logoutStaff error:', error);
    throw error;
  }
}

export async function getCurrentUser() {
  try {
    return await account.get();
  } catch (error) {
    // Not logged in — return null silently
    return null;
  }
}

// ========== STORAGE ==========

/**
 * Upload a Rudraksha image
 * Returns the file ID which you store in the certificate's imageUrl field
 */
export async function uploadRudrakshaImage(file: File) {
  try {
    const response = await storage.createFile(
      CONFIG.bucketId,
      ID.unique(),
      file
    );
    // Return the URL for displaying
    const url = storage.getFileView(CONFIG.bucketId, response.$id);
    return { fileId: response.$id, url: url.toString() };
  } catch (error) {
    console.error('Appwrite :: uploadRudrakshaImage error:', error);
    throw error;
  }
}