import React from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../../components/ui/button'

export default function Terms() {
  return (
    <div className="bg-surface-raised min-h-screen flex flex-col">
      {/* ── Navbar ── */}
      <header className="sticky top-0 z-50 bg-surface-raised/90 backdrop-blur-sm border-b border-border-subtle">
        <div className="max-w-6xl mx-auto px-6 py-3.5 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-button bg-primary flex items-center justify-center text-white text-xs font-bold">A</div>
            <span className="text-sm font-semibold text-heading">Asas Enterprise</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link to="/login" className="text-sm text-muted hover:text-heading transition-colors">
              Sign In
            </Link>
            <Button asChild size="sm">
              <Link to="/register">Get Started</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* ── Content ── */}
      <main className="flex-1 max-w-4xl mx-auto px-6 py-12">
        <div className="mb-10">
          <h1 className="text-3xl md:text-4xl font-extrabold text-heading tracking-tight mb-2">Terms of Service</h1>
          <p className="text-sm text-muted">Last updated: October 2026</p>
        </div>

        <div className="space-y-8 text-sm text-body leading-relaxed">
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-heading">1. Acceptance of Terms</h2>
            <p>
              By accessing or using Asas Enterprise (&quot;the Platform&quot;), including any associated APIs, dashboard services, and documentation, you agree to be bound by these Terms of Service. If you are entering into this agreement on behalf of a company or other legal entity, you represent that you have the authority to bind such entity.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-heading">2. Multi-Tenant Architecture &amp; Data Isolation</h2>
            <p>
              Asas provides enterprise workspace services operated under strict tenant isolation. All data, transactions, and audit trails recorded within your workspace are partitioned and accessible solely to authorized accounts belonging to your tenant. You are responsible for managing member access, role permissions, and session credentials within your organization.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-heading">3. Permitted Use &amp; Responsibilities</h2>
            <p>
              You agree to use the Platform in compliance with all applicable laws and regulations. You shall not:
            </p>
            <ul className="list-disc pl-6 space-y-1.5 text-body">
              <li>Circumvent or attempt to circumvent authentication, authorization, or multi-tenant boundary controls.</li>
              <li>Perform unauthorized penetration testing or vulnerability scanning without prior written approval.</li>
              <li>Introduce malicious payloads, automated scraping bots, or disruptive workloads that impact system availability.</li>
              <li>Use the Platform to store or transmit unlawful, infringing, or tortious material.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-heading">4. Subscription, Billing &amp; Invoicing</h2>
            <p>
              Access to enterprise modules (including HR, Payroll, Financial Ledgers, Inventory, and CRM) is provided based on the subscription tier selected by your organization. Fees are billed according to your agreed billing schedule. All payment obligations are non-cancelable and fees paid are non-refundable, except as expressly provided in an enterprise service agreement.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-heading">5. Intellectual Property &amp; Data Ownership</h2>
            <p>
              You retain all ownership and intellectual property rights in and to your business data uploaded, processed, or generated within your tenant workspace. Asas retains all ownership and intellectual property rights in the Platform, its software components, interfaces, and underlying technology.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-heading">6. Service Availability &amp; Support</h2>
            <p>
              We strive to maintain an uptime availability of 99.9% for production environments. Scheduled maintenance windows will be communicated in advance whenever feasible. In the event of system interruptions, our team will use commercially reasonable efforts to restore services promptly.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-heading">7. Limitation of Liability</h2>
            <p>
              To the maximum extent permitted by applicable law, in no event shall Asas or its affiliates be liable for any indirect, punitive, incidental, special, or consequential damages arising out of or in connection with your use of the Platform.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-heading">8. Contact Information</h2>
            <p>
              If you have any questions or inquiries regarding these Terms of Service, please contact our legal and support team at <a href="mailto:legal@asas.io" className="text-primary underline">legal@asas.io</a>.
            </p>
          </section>
        </div>
      </main>

      {/* ── Footer ── */}
      <footer className="bg-primary border-t border-primary-hover px-6 py-6 mt-16">
        <div className="max-w-6xl mx-auto flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-input bg-surface-raised/10 flex items-center justify-center text-white text-[10px] font-bold">A</div>
            <span className="text-sm font-medium text-caption">Asas Enterprise</span>
            <span className="text-body text-xs">© {new Date().getFullYear()} Asas Enterprise. All rights reserved.</span>
          </div>

          <div className="flex items-center gap-6">
            <Link to="/privacy" className="text-xs text-body-light hover:text-caption transition-colors">
              Privacy Policy
            </Link>
            <Link to="/terms" className="text-xs text-body-light hover:text-caption transition-colors">
              Terms of Service
            </Link>
            <Link to="/" className="text-xs text-body-light hover:text-caption transition-colors">
              Home
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}

