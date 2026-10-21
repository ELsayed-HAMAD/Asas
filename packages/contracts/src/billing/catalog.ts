/** Shared plan catalog data kept free of runtime schema dependencies for browser consumers. */
export interface PlatformPlan {
  id: string
  name: string
  tagline: string
  priceMonthly: number
  priceAnnual: number
  currency: string
  seatLimit: number
  storageLimitGb: number
  popular?: boolean
  features: string[]
  moduleAccess: string[]
}

export const PLATFORM_PLANS: PlatformPlan[] = [
  {
    id: 'free',
    name: 'Free Starter',
    tagline: 'Start with the full workspace on a five-seat Free plan.',
    priceMonthly: 0,
    priceAnnual: 0,
    currency: 'USD',
    seatLimit: 5,
    storageLimitGb: 5,
    features: [
      'Up to 5 team members',
      '5 GB workspace storage allowance',
      'Access to current finance, HR, CRM, projects, and inventory modules',
      'No payment method required',
    ],
    moduleAccess: ['all'],
  },
  {
    id: 'starter',
    name: 'Standard Growth',
    tagline: 'A larger seat and storage allowance for growing teams.',
    priceMonthly: 29,
    priceAnnual: 24,
    currency: 'USD',
    seatLimit: 15,
    storageLimitGb: 25,
    popular: true,
    features: [
      'Up to 15 team members',
      '25 GB workspace storage allowance',
      'Access to current finance, HR, CRM, projects, and inventory modules',
      'Paid activation requires configured Stripe checkout',
    ],
    moduleAccess: ['all'],
  },
  {
    id: 'pro',
    name: 'Professional Scale',
    tagline: 'More capacity for established teams.',
    priceMonthly: 79,
    priceAnnual: 64,
    currency: 'USD',
    seatLimit: 50,
    storageLimitGb: 100,
    features: [
      'Up to 50 team members',
      '100 GB workspace storage allowance',
      'Access to current finance, HR, CRM, projects, and inventory modules',
      'Paid activation requires configured Stripe checkout',
    ],
    moduleAccess: ['all'],
  },
  {
    id: 'enterprise',
    name: 'Enterprise Bespoke',
    tagline: 'The largest published seat and storage allowance.',
    priceMonthly: 199,
    priceAnnual: 160,
    currency: 'USD',
    seatLimit: 250,
    storageLimitGb: 1000,
    features: [
      'Up to 250 team members',
      '1,000 GB workspace storage allowance',
      'Access to current finance, HR, CRM, projects, and inventory modules',
      'Paid activation requires configured Stripe checkout',
    ],
    moduleAccess: ['all'],
  },
]
