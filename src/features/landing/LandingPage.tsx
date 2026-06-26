import { FeaturesSection } from './FeaturesSection'
import { HeroSection } from './HeroSection'
import { HowItWorksSection } from './HowItWorksSection'
import { ProblemSection } from './ProblemSection'
import { SolutionSection } from './SolutionSection'
import { WaitlistSection } from './WaitlistSection'

/**
 * The marketing landing page. Composed entirely from reusable sections that
 * inherit the dashboard's HUD design system. The live dashboard preview in the
 * hero is the star; every section keeps copy tight and leans on visuals.
 */
export function LandingPage() {
  return (
    <div className="bg-background">
      <HeroSection />
      <ProblemSection />
      <SolutionSection />
      <FeaturesSection />
      <HowItWorksSection />
      <WaitlistSection />
    </div>
  )
}
