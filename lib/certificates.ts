import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function findCertificate(input: string) {
  const { data, error } = await supabase
    .from("Certificates")
    .select("*")
    .eq("Certificate_no", input)
    .single()

  if (error || !data) {
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