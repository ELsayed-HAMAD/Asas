import React from 'react'
import { Link } from 'react-router-dom'

export default function Privacy() {
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
            <Link
              to="/register"
              className="bg-primary text-white text-sm font-medium px-4 py-2 rounded-button hover:bg-primary-hover transition-colors"
            >
              Get Started
            </Link>
          </div>
        </div>
      </header>

      {/* ── Content ── */}
      <main className="flex-1 max-w-4xl mx-auto px-6 py-12">
        <div className="mb-10">
          <h1 className="text-3xl md:text-4xl font-extrabold text-heading tracking-tight mb-2">Privacy Policy</h1>
          <p className="text-sm text-muted">Last updated: October 2026</p>
        </div>

        <div className="space-y-8 text-sm text-body leading-relaxed">
          <section className="space-y-3">
            <h2 className="text-lg font-bold text-heading">1. Introduction</h2>
            <p>
              Asas Enterprise (&quot;Asas&quot;, &quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) is committed to protecting the privacy and security of your business and personal data. This Privacy Policy describes how we collect, process, store, and safeguard information when you use our enterprise platform.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-heading">2. Information We Collect</h2>
            <p>We collect information necessary to provide and operate enterprise services, including:</p>
            <ul className="list-disc pl-6 space-y-1.5 text-body">
              <li><strong>Account Credentials:</strong> Full name, verified email address, organization name, role, and hashed passwords.</li>
              <li><strong>Tenant Workspace Data:</strong> Information entered into operational modules, including employee records, payroll data, financial ledger transactions, inventory levels, and CRM communications.</li>
              <li><strong>Operational Logs:</strong> Tamper-evident audit logs detailing administrative actions, data exports, integrations, and authentication events.</li>
              <li><strong>Technical Information:</strong> IP addresses, browser agent metadata, and session identifiers for security monitoring and fraud prevention.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-heading">3. Tenant Isolation &amp; Data Security</h2>
            <p>
              Our multi-tenant architecture implements strict logical partitioning. Data belonging to your organization is isolated at the database query and transaction level, preventing cross-tenant leakage. All data at rest is encrypted using AES-256 encryption, and data in transit is protected using TLS 1.3.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-heading">4. How We Use Information</h2>
            <p>We process data solely for the following business purposes:</p>
            <ul className="list-disc pl-6 space-y-1.5 text-body">
              <li>Provisioning, maintaining, and updating your enterprise workspace and authorized modules.</li>
              <li>Executing requested asynchronous export jobs, report generation, and third-party webhook dispatches.</li>
              <li>Ensuring platform integrity, verifying user permissions, and maintaining immutable audit trails.</li>
              <li>Delivering vital security advisories, billing invoices, and transactional platform alerts.</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-heading">5. Data Retention &amp; Deletion</h2>
            <p>
              Tenant operational data is retained for the duration of your active subscription and as required by statutory accounting or legal obligations. Upon termination of service or upon verified request from an authorized tenant administrator, workspace data will be scheduled for permanent purging in accordance with our data retention schedule.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-heading">6. User Rights &amp; Regulatory Compliance</h2>
            <p>
              Depending on your jurisdiction (including GDPR, CCPA, and regional data protection regulations), you and your authorized members may exercise rights of access, rectification, portability, and erasure regarding your personal data.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold text-heading">7. Contact Information</h2>
            <p>
              For data protection questions, compliance requests, or data privacy inquiries, please contact our Data Protection Officer at <a href="mailto:privacy@asas.io" className="text-primary underline">privacy@asas.io</a>.
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

