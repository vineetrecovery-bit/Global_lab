import { Navbar } from '@/components/navbar'
import { Hero } from '@/components/hero'
import { TrustIndicators } from '@/components/trust-indicators'
import { About } from '@/components/about'
import { Process } from '@/components/process'
import { SampleReports } from '@/components/sample-reports'
import { VerificationProcess } from '@/components/verification-process'
import { WhyGlobalLab } from '@/components/why-global-lab'
import { Contact } from '@/components/contact'
import { Footer } from '@/components/footer'
import { AdminPanel } from '@/components/admin-panel'

export default function Page() {
  return (
    <main className="min-h-screen bg-background">
      <Navbar />
      <Hero />
      <TrustIndicators />
      <About />
      <Process />
      <SampleReports />
      <VerificationProcess />
      <WhyGlobalLab />
      <Contact />
      <Footer />
      <AdminPanel />
    </main>
  )
}
