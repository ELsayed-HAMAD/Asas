import MarketingPageFrame from '../../components/marketing/MarketingPageFrame'

export default function Terms() {
  return (
    <MarketingPageFrame
      eyebrow="Legal"
      title="Terms of Service"
      description="Last updated: October 2026. These product terms describe general use of the Asas application. Deployment-specific agreements may also apply."
    >
      <div className="bg-surface-raised rounded-card border border-border-default p-6 sm:p-10 shadow-card max-w-4xl space-y-8 text-sm text-body leading-relaxed">
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-heading">1. Using Asas</h2>
          <p>
            By accessing or using Asas, you agree to follow these terms and any applicable agreement with the organization
            operating your deployment. If you use Asas for a company, you confirm that you are authorized to do so.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-heading">2. Accounts and workspace access</h2>
          <p>
            Keep your sign-in credentials secure and use workspace roles responsibly. You are responsible for activity carried
            out through your account and for notifying the workspace operator about suspected unauthorized access.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-heading">3. Acceptable use</h2>
          <p>You agree not to:</p>
          <ul className="list-disc pl-6 space-y-1.5 text-body-light">
            <li>Attempt to bypass authentication, authorization, or workspace boundaries.</li>
            <li>Disrupt the service, introduce malicious content, or access another organization’s data without authorization.</li>
            <li>Use the service in violation of applicable law or another party’s rights.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-heading">4. Plans and billing</h2>
          <p>
            The available plan, limits, price, billing period, and payment method are shown in the application for your
            deployment. Paid checkout is available only when billing is configured. Features and limits may change as the
            service evolves; the plan presented at checkout and any separate agreement govern an active subscription.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-heading">5. Your data and the platform</h2>
          <p>
            You or your organization retain rights to the content submitted to the workspace. The rights to the Asas software,
            branding, and interface remain with their respective owners. You authorize the operator to process workspace
            content as needed to provide the service and as described by the applicable privacy notice or agreement.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-heading">6. Availability and support</h2>
          <p>
            Availability, support commitments, backup coverage, and service levels depend on the operator and any separate
            agreement. No uptime target or recovery-time guarantee is created by this page.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-heading">7. Contact</h2>
          <p>For questions about these terms, contact the organization that operates your Asas deployment.</p>
        </section>
      </div>
    </MarketingPageFrame>
  )
}
