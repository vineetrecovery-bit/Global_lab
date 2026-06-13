import { createClient } from "@supabase/supabase-js"

export type Certificate = {
  number: string
  productName: string
  origin: string
  image: string
  mukhi: string
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function findCertificate(
  input: string
): Promise<Certificate | null> {
  const { data, error } = await supabase
    .from("Certificates")
    .select("*")
    .eq("Certificate_no", input.trim())
    .single()

  if (error || !data) {
    console.error(error)
    return null
  }

  return {
    number: data.Certificate_no,
    productName: data.product_name,
    origin: data.origin,
    image: data.certificate_image,
    mukhi: data.Mukhi,
  }
}