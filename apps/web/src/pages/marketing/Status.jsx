import { Link } from 'react-router-dom'
import { Activity, ArrowRight } from 'lucide-react'
import MarketingPageFrame from '../../components/marketing/MarketingPageFrame'

export default function Status() {
  return (
    <MarketingPageFrame
      eyebrow="Service status"
      title="Public live status is not connected"
      description="This page does not yet receive live uptime or incident data, so it cannot confirm current service availability."
    >
      <section className="max-w-3xl rounded-card border border-border-default bg-surface-raised p-6 shadow-card md:p-8">
        <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-full bg-surface-muted text-muted"><Activity size={21} /></div>
        <h2 className="text-lg font-bold text-heading">No public status feed is configured</h2>
        <p className="mt-2 text-sm leading-6 text-muted">We do not publish an uptime percentage or incident history here. For help with a workspace or a feature, sign in and open the Support Center.</p>
        <Link to="/dashboard/support" className="mt-6 inline-flex items-center gap-2 rounded-button bg-primary px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-hover">Open Support Center <ArrowRight size={15} /></Link>
      </section>
    </MarketingPageFrame>
  )
}
