import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Required for SampleReports component
export const certificates = [
  {
    number: "GL-RUD-2026-000001",
    productName: "5 Mukhi Rudraksha",
    image: "/placeholder.svg",
    category: "Rudraksha",
    weight: "",
    issueDate: "",
  },
]

export type Certificate = {
  number: string
  productName: string
  origin: string
  image: string
  mukhi: string
}

export async function findCertificate(
  input: string
): Promise<Certificate | null> {
  const { data, error } = await supabase
    .from("Certificates")
    .select("*")
    .eq("certificates", input.trim())
    .single()

  if (error) {
    console.log("SUPABASE ERROR:", error)
    return null
  }

  if (!data) {
    console.log("NO DATA FOUND")
    return null
  }

  console.log("SUPABASE DATA:", data)

  return {
    number: data.certificates,
    productName: data.product_name,
    origin: data.origin,
    image: data.certificate_image,
    mukhi: data.Mukhi,
  }
}