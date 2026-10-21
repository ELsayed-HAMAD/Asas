import { useQuery } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import { Link } from 'react-router-dom'
import MarketingPageFrame from '../../components/marketing/MarketingPageFrame'
import { Button } from '../../components/ui/button'
import { Badge } from '../../components/ui/badge'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../../components/ui/accordion'
import { http } from '../../lib/api/http'

const FALLBACK_TIERS = [
  {
    id: 'free',
    name: 'Free Starter',
    tagline: 'Start with the full workspace on a five-seat Free plan.',
    priceMonthly: 0,
    priceAnnual: 0,
    seatLimit: 5,
    storageLimitGb: 5,
    features: ['Up to 5 team members', '5 GB workspace storage allowance', 'Access to current product modules'],
  },
  {
    id: 'starter',
    name: 'Standard Growth',
    tagline: 'A larger seat and storage allowance for growing teams.',
    priceMonthly: 29,
    priceAnnual: 24,
    seatLimit: 15,
    storageLimitGb: 25,
    features: ['Up to 15 team members', '25 GB workspace storage allowance', 'Access to current product modules'],
  },
  {
    id: 'pro',
    name: 'Professional Scale',
    tagline: 'More capacity for established teams.',
    priceMonthly: 79,
    priceAnnual: 64,
    seatLimit: 50,
    storageLimitGb: 100,
    features: ['Up to 50 team members', '100 GB workspace storage allowance', 'Access to current product modules'],
    popular: true,
  },
  {
    id: 'enterprise',
    name: 'Enterprise Bespoke',
    tagline: 'The largest published seat and storage allowance.',
    priceMonthly: 199,
    priceAnnual: 160,
    seatLimit: 250,
    storageLimitGb: 1000,
    features: ['Up to 250 team members', '1,000 GB workspace storage allowance', 'Access to current product modules'],
  },
]

const COMPARISON_ROWS = [
  { feature: 'Team members', free: '5', starter: '15', pro: '50', enterprise: '250' },
  { feature: 'Workspace storage allowance', free: '5 GB', starter: '25 GB', pro: '100 GB', enterprise: '1,000 GB' },
  { feature: 'Current product modules', free: 'Included', starter: 'Included', pro: 'Included', enterprise: 'Included' },
]

const FAQS = [
  {
    q: 'Can I start on the Free plan without entering a payment method?',
    a: 'Yes. New workspaces use Free plan defaults, with up to 5 members and a 5 GB storage allowance. No payment method is required to create an account.',
  },
  {
    q: 'How do paid plans work?',
    a: 'Paid checkout requires Stripe to be configured for this deployment. When available, upgrades are completed through Stripe Checkout and confirmed by the billing webhook. The current checkout supports monthly plans.',
  },
  {
    q: 'What happens if our team exceeds our tier limits?',
    a: 'Invitations are checked against the configured seat allowance. Storage usage is measured from stored files where supported; some storage accounting remains approximate and is under review.',
  },
  {
    q: 'Are product modules locked by plan?',
    a: 'The current application does not restrict modules by subscription tier. Plans describe seat and storage allowances; paid checkout must be configured by the deployment operator.',
  },
]

export default function Pricing() {
  const plansQuery = useQuery({
    queryKey: ['marketing', 'billing-plans'],
    queryFn: () => http.get('/billing/plans'),
  })

  // The API catalog is authoritative (`id`, `tagline`, `priceMonthly`, `priceAnnual`).
  // Normalize the older fallback shape so the page renders correctly during API outages.
  const tiers = (plansQuery.data?.tiers || FALLBACK_TIERS).map((plan) => ({
    tier: plan.id ?? plan.tier,
    name: plan.name,
    description: plan.tagline ?? plan.description,
    monthlyPrice: plan.priceMonthly ?? plan.monthlyPrice,
    annualPrice: plan.priceAnnual ?? plan.annualPrice,
    seatLimit: plan.seatLimit,
    storageLimitGb: plan.storageLimitGb,
    features: plan.features,
    highlight: plan.popular ?? plan.highlight,
    cta: plan.id === 'free' || plan.tier === 'free' ? 'Start Free' : 'Start on Free',
  }))

  return (
    <MarketingPageFrame
      eyebrow="Transparent Enterprise Pricing"
      title="Predictable plans tailored to your operating scale"
      description="Zero hidden charges, transparent seat limits, and a permanent Free Starter tier. Upgrade whenever your operational volume requires greater capacity."
    >
      {!plansQuery.data?.stripeConfigured && (
        <div role="status" className="mb-8 rounded-card border border-warning-border bg-warning-light px-4 py-3 text-sm text-warning-text">
          Paid checkout is not configured in this environment. You can create a workspace on the Free plan.
        </div>
      )}

      <p className="mb-12 text-center text-sm text-body-light">Prices shown are monthly. Annual checkout is not currently available.</p>

      {/* 4 Plans Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-20">
        {tiers.map((plan) => {
          const price = plan.monthlyPrice === 0 ? '$0' : `$${plan.monthlyPrice}`

          const isPro = plan.tier === 'pro'

          return (
            <div
              key={plan.tier}
              className={`rounded-card p-6 flex flex-col justify-between hover-lift transition-premium ${
                isPro
                  ? 'bg-primary text-on-primary border-2 border-accent shadow-glass hover:shadow-glow relative'
                  : 'bg-surface-raised text-body border border-border-default/80 shadow-card hover:shadow-card-hover hover:border-border-strong'
              }`}
            >
              {isPro && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-accent text-on-primary text-[10px] font-bold uppercase tracking-wider px-3 py-0.5 rounded-full shadow-card">
                  Most Popular
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className={`font-bold text-lg ${isPro ? 'text-on-primary' : 'text-heading'}`}>
                    {plan.name}
                  </h3>
                  {plan.tier === 'free' && (
                    <Badge variant="outline" className="bg-surface-muted text-body text-[10px] border-border-default shadow-xs">
                      Default
                    </Badge>
                  )}
                </div>

                <p className={`text-xs mb-6 ${isPro ? 'text-primary-subtle' : 'text-caption'}`}>
                  {plan.description}
                </p>

                <div className="mb-6">
                  <span className={`text-4xl font-extrabold ${isPro ? 'text-on-primary' : 'text-heading'}`}>
                    {price}
                  </span>
                  {plan.monthlyPrice != null && (
                    <span className={`text-xs ml-1 ${isPro ? 'text-primary-subtle' : 'text-caption'}`}>
                      {plan.monthlyPrice === 0 ? '/ month forever' : '/ month'}
                    </span>
                  )}
                </div>

                <ul className="space-y-3 text-xs">
                  {plan.features?.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <Check className={`w-4 h-4 flex-shrink-0 mt-0.5 ${isPro ? 'text-success-bright' : 'text-success'}`} />
                      <span className={isPro ? 'text-primary-light' : 'text-body-light'}>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <Button
                asChild
                className={`w-full mt-8 text-xs font-semibold h-10 rounded-button cursor-pointer hover-lift transition-micro active:scale-[0.98] ${
                  isPro
                    ? 'bg-accent hover:bg-accent-hover text-on-primary shadow-card hover:shadow-glow'
                    : plan.tier === 'free'
                    ? 'bg-primary hover:bg-primary-hover text-on-primary shadow-card'
                    : 'border border-border-default/80 bg-surface-raised hover:bg-surface-muted text-heading shadow-card'
                }`}
              >
                <Link to="/register">
                  {plan.cta || 'Get Started'}
                </Link>
              </Button>
            </div>
          )
        })}
      </div>

      {/* Feature Comparison Table */}
      <section className="mb-20">
        <div className="text-center mb-8">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-heading">
            Compare platform features across tiers
          </h2>
          <p className="text-sm text-body-light mt-2">
            Product modules are shared across tiers; plans currently differ by seat and storage allowances.
          </p>
        </div>

        <div className="bg-surface-raised rounded-card border border-border-default overflow-hidden shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-muted border-b border-border-default text-heading font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-3.5 px-4">Plan limit</th>
                  <th className="py-3.5 px-4 text-center">Free Starter</th>
                  <th className="py-3.5 px-4 text-center">Starter</th>
                  <th className="py-3.5 px-4 text-center bg-primary-light text-primary">Scale Pro</th>
                  <th className="py-3.5 px-4 text-center">Enterprise</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle text-body-light">
                {COMPARISON_ROWS.map((row) => (
                  <tr key={row.feature} className="hover:bg-surface-muted/50">
                    <td className="py-3.5 px-4 font-medium text-heading">{row.feature}</td>
                    <td className="py-3.5 px-4 text-center">{row.free}</td>
                    <td className="py-3.5 px-4 text-center">{row.starter}</td>
                    <td className="py-3.5 px-4 text-center bg-primary-light/30">{row.pro}</td>
                    <td className="py-3.5 px-4 text-center">{row.enterprise}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Frequently Asked Questions */}
      <section className="max-w-3xl mx-auto">
        <div className="text-center mb-8">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-heading">
            Frequently Asked Questions
          </h2>
          <p className="text-sm text-body-light mt-2">
            Everything you need to know about billing, security, and workspace entitlements.
          </p>
        </div>

        <Accordion type="single" collapsible className="space-y-3">
          {FAQS.map((faq, i) => (
            <AccordionItem key={faq.q} value={`faq-${i}`} className="bg-surface-raised rounded-card-sm border border-border-default px-4">
              <AccordionTrigger className="text-sm font-semibold text-heading py-3.5 hover:no-underline">
                {faq.q}
              </AccordionTrigger>
              <AccordionContent className="text-xs text-body-light leading-relaxed pb-4">
                {faq.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>
    </MarketingPageFrame>
  )
}
