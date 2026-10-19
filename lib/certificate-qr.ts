export function certificateVerificationUrl(certificateNo: string): string {
  const url = new URL('https://globallabtesting.in/')
  url.searchParams.set('batch', certificateNo)
  return url.toString()
}
