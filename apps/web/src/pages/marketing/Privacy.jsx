import MarketingPageFrame from '../../components/marketing/MarketingPageFrame'

export default function Privacy() {
  return (
    <MarketingPageFrame
      eyebrow="Privacy"
      title="Privacy Policy"
      description="Last updated: October 2026. This notice describes information handled by the Asas application. Confirm deployment-specific practices with your service operator."
    >
      <div className="bg-surface-raised rounded-card border border-border-default p-6 sm:p-10 shadow-card max-w-4xl space-y-8 text-sm text-body leading-relaxed">
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-heading">1. About this notice</h2>
          <p>
            Asas ("Asas", "we", "our", or "us") processes information submitted to the application to provide account and
            workspace features. The organization operating your deployment is responsible for its hosting, configuration,
            and applicable privacy obligations. This page is a product notice and does not replace terms agreed with that organization.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-heading">2. Information handled by the application</h2>
          <ul className="list-disc pl-6 space-y-1.5 text-body-light">
            <li><strong>Account and workspace information:</strong> Details needed to create and use an account, including identity and workspace membership information.</li>
            <li><strong>Workspace content:</strong> Information your organization enters into enabled areas such as finance, HR, inventory, CRM, and projects.</li>
            <li><strong>Operational records:</strong> Authentication, application activity, integration, and export records where those features are enabled.</li>
            <li><strong>Technical data:</strong> Request and error information processed by the application and monitoring services configured by the operator.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-heading">3. Security and service providers</h2>
          <p>
            The application applies workspace-scoped access checks. Hosting, database isolation, encryption at rest, transport
            security, backups, and monitoring depend on the operator’s infrastructure and configuration. The operator may
            configure providers for hosting, email, authentication, billing, storage, or monitoring; which providers process
            information depends on the deployment. Ask the operator for its current provider list and security practices.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-heading">4. Access, export, deletion, and retention</h2>
          <p>
            Workspace administrators can use the data export and account settings available in their deployment. These tools
            may not include every copy of information, such as operational logs or provider backups. Contact the organization
            operating your workspace to ask about access, correction, deletion, retention, or other privacy requests and rights.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-bold text-heading">5. Contact</h2>
          <p>For privacy inquiries or requests, contact the organization that operates your Asas deployment.</p>
        </section>
      </div>
    </MarketingPageFrame>
  )
}
