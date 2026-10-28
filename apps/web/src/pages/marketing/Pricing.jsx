import { useQuery } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import { Link } from 'react-router-dom'
import MarketingPageFrame from '../../components/marketing/MarketingPageFrame'
import { Button } from '../../components/ui/button'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../../components/ui/accordion'
import { PLATFORM_PLANS } from '../../../../../packages/contracts/src/billing/catalog.ts'
import { http } from '../../lib/api/http'

const COMPARISON_ROWS = [
  { feature: 'Team members', value: plan => plan.seatLimit.toLocaleString() },
  { feature: 'Workspace storage allowance', value: plan => `${plan.storageLimitGb.toLocaleString()} GB` },
  { feature: 'Current product modules', value: () => 'Included' },
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

  // The API catalog is authoritative at runtime; use the same shared catalog during an API outage.
  const tiers = (plansQuery.data?.tiers || PLATFORM_PLANS).map((plan) => ({
    tier: plan.id,
    name: plan.name,
    description: plan.tagline,
    monthlyPrice: plan.priceMonthly,
    annualPrice: plan.priceAnnual,
    seatLimit: plan.seatLimit,
    storageLimitGb: plan.storageLimitGb,
    features: plan.features,
    highlight: Boolean(plan.popular),
    cta: plan.id === 'free' ? 'Start Free' : 'Start on Free',
  }))

  return (
    <MarketingPageFrame
      eyebrow="Workspace pricing"
      title="Plans for your team and workspace"
      description="Compare the current workspace seat and storage limits. Product areas are shared across plans; paid checkout is available only when billing is configured for this deployment."
    >
      {plansQuery.isError && (
        <div role="status" className="mb-8 rounded-2xl border border-amber-200/70 bg-amber-50/70 px-5 py-4 text-sm leading-6 text-amber-800">
          Could not confirm the paid-checkout configuration. You can still create a workspace on the Free plan; paid checkout may be unavailable.
        </div>
      )}
      {plansQuery.isSuccess && plansQuery.data?.stripeConfigured !== true && (
        <div role="status" className="mb-8 rounded-2xl border border-amber-200/70 bg-amber-50/70 px-5 py-4 text-sm leading-6 text-amber-800">
          Paid checkout is not configured in this environment. You can create a workspace on the Free plan.
        </div>
      )}

      <div className="mb-6 flex items-center justify-between gap-4 text-xs text-[#86868b]">
        <span>Prices shown are monthly.</span>
        <span>Annual checkout is not currently available.</span>
      </div>

      <div className="grid gap-px overflow-hidden rounded-[26px] border border-black/[0.07] bg-black/[0.06] shadow-[0_20px_60px_rgba(0,0,0,0.05)] md:grid-cols-2 xl:grid-cols-4">
        {tiers.map((plan) => {
          const price = plan.monthlyPrice === 0 ? '$0' : `$${plan.monthlyPrice}`
          return (
            <article key={plan.tier} className={`flex flex-col p-6 sm:p-7 ${plan.highlight ? 'bg-[#f0f6ff]' : 'bg-white/85'}`}>
              <div className="flex min-h-6 items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-[#1d1d1f]">{plan.name}</h2>
                {plan.highlight && <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[#0071e3]">Most popular</span>}
                {plan.tier === 'free' && <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[#929297]">Default</span>}
              </div>
              <p className="mt-3 min-h-10 text-xs leading-5 text-[#86868b]">{plan.description}</p>
              <div className="mt-8 flex items-end gap-2">
                <span className="text-4xl font-semibold tracking-[-0.045em] text-[#1d1d1f]">{price}</span>
                <span className="pb-1 text-[10px] text-[#86868b]">{plan.monthlyPrice === 0 ? '/ month forever' : '/ month'}</span>
              </div>
              <ul className="mt-8 space-y-3.5 text-xs leading-5 text-[#626267]">
                {plan.features?.map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#0071e3]" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <Button asChild variant={plan.tier === 'free' || plan.highlight ? 'default' : 'outline'} className={`mt-9 h-10 w-full rounded-full text-xs font-medium ${plan.tier === 'free' || plan.highlight ? 'bg-[#0071e3] text-white shadow-[0_8px_22px_rgba(0,113,227,0.18)] hover:bg-[#0077ed]' : 'border-black/10 bg-transparent text-[#1d1d1f] shadow-none hover:bg-white'}`}>
                <Link to="/register">{plan.cta || 'Get Started'}</Link>
              </Button>
            </article>
          )
        })}
      </div>

      <section className="mt-24">
        <div className="max-w-2xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.17em] text-[#0071e3]">Plan comparison</p>
          <h2 className="mt-4 text-3xl font-semibold tracking-[-0.035em] text-[#1d1d1f] sm:text-4xl">Compare plan limits across tiers</h2>
          <p className="mt-4 text-sm leading-6 text-[#737378]">Product modules are shared across tiers; plans currently differ by seat and storage allowances.</p>
        </div>
        <div className="mt-8 overflow-hidden rounded-[24px] border border-black/[0.07] bg-white/65 shadow-[0_16px_50px_rgba(0,0,0,0.04)] backdrop-blur-xl">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead className="border-b border-black/[0.07] text-[10px] font-semibold uppercase tracking-[0.12em] text-[#86868b]">
                <tr>
                  <th className="px-5 py-4">Plan limit</th>
                  {tiers.map(plan => <th key={plan.tier} className={`px-5 py-4 text-center ${plan.highlight ? 'bg-[#f0f6ff] text-[#0071e3]' : ''}`}>{plan.name}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.06] text-[#626267]">
                {COMPARISON_ROWS.map((row) => (
                  <tr key={row.feature}>
                    <td className="px-5 py-4 font-medium text-[#1d1d1f]">{row.feature}</td>
                    {tiers.map(plan => <td key={plan.tier} className={`px-5 py-4 text-center ${plan.highlight ? 'bg-[#f0f6ff]/60' : ''}`}>{row.value(plan)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="mx-auto mt-24 max-w-3xl">
        <div className="text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.17em] text-[#0071e3]">Questions, answered</p>
          <h2 className="mt-4 text-3xl font-semibold tracking-[-0.035em] text-[#1d1d1f] sm:text-4xl">Frequently Asked Questions</h2>
          <p className="mt-4 text-sm text-[#737378]">Billing, limits, and provider configuration.</p>
        </div>
        <Accordion type="single" collapsible className="mt-8 border-y border-black/10">
          {FAQS.map((faq, index) => (
            <AccordionItem key={faq.q} value={`faq-${index}`} className="border-black/10 px-1">
              <AccordionTrigger className="py-5 text-left text-sm font-semibold text-[#1d1d1f] hover:no-underline">{faq.q}</AccordionTrigger>
              <AccordionContent className="pb-5 pr-8 text-sm leading-6 text-[#737378]">{faq.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>
    </MarketingPageFrame>
  )
}
