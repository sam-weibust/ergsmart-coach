const PrivacyPolicy = () => (
  <div className="min-h-screen bg-background text-foreground">
    <div className="max-w-3xl mx-auto px-6 py-16">
      <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
      <p className="text-sm text-muted-foreground mb-10">
        Effective date: April 22, 2026 &nbsp;·&nbsp;{" "}
        <a href="https://crewsync.app" className="underline hover:text-foreground">
          crewsync.app
        </a>
      </p>

      <section className="space-y-8 text-sm leading-relaxed">
        <div>
          <h2 className="text-lg font-semibold mb-2">1. Who we are</h2>
          <p>
            CrewSync ("we", "us", "our") operates the training platform available at{" "}
            <a href="https://crewsync.app" className="underline hover:text-foreground">
              crewsync.app
            </a>
            . This policy explains what data we collect, why we collect it, and how
            it is used.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">2. What data we collect</h2>
          <p>We collect only the data necessary to deliver personalised training insights:</p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>Rowing performance data (erg scores, splits, heart rate, distances)</li>
            <li>Training plan history and workout logs</li>
            <li>Athlete profile information (age, weight, height, experience level)</li>
            <li>Recovery metrics entered manually (sleep, hydration, nutrition)</li>
            <li>Account credentials (email address, hashed password via Supabase Auth)</li>
          </ul>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">3. How we use your data</h2>
          <p>
            All data collected by CrewSync is used exclusively to provide training
            insights, generate personalised workout plans, and track your athletic
            progress. We do not use your data for advertising, profiling unrelated to
            sport performance, or any purpose beyond the core service.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">4. Data sharing</h2>
          <p>
            <strong>We never sell your data to third parties.</strong> Your rowing
            performance data, erg scores, and personal information are never shared
            with advertisers, data brokers, or any external organisation for commercial
            purposes.
          </p>
          <p className="mt-2">
            We use the following sub-processors solely to operate the platform:
          </p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>Supabase — database and authentication hosting</li>
            <li>Anthropic — AI-generated training plan and insight generation</li>
            <li>Vercel — web hosting and deployment</li>
          </ul>
          <p className="mt-2">
            Each sub-processor is bound by their own data processing agreements and
            receives only the minimum data required to perform their function.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">5. Data retention</h2>
          <p>
            We retain your data for as long as your account is active. If you delete
            your account, your personal data is removed from our systems within 30 days,
            except where retention is required by law.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">6. Your rights &amp; data deletion</h2>
          <p>
            You have the right to access, correct, or delete any personal data we hold
            about you. To request data deletion or a copy of your data, contact us at:
          </p>
          <p className="mt-2 font-medium">
            <a href="mailto:support@crewsync.app" className="underline hover:text-foreground">
              support@crewsync.app
            </a>
          </p>
          <p className="mt-2">
            We will respond to all data requests within 30 days.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">7. Security</h2>
          <p>
            We use industry-standard security practices including encrypted connections
            (HTTPS), hashed passwords, and row-level security on our database. No
            method of transmission over the internet is 100% secure, but we take
            reasonable measures to protect your information.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">8. Changes to this policy</h2>
          <p>
            We may update this policy from time to time. When we do, we will revise the
            effective date at the top of this page. Continued use of CrewSync after any
            changes constitutes acceptance of the updated policy.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">9. Contact</h2>
          <p>
            If you have any questions about this privacy policy, please contact us at{" "}
            <a href="mailto:support@crewsync.app" className="underline hover:text-foreground">
              support@crewsync.app
            </a>{" "}
            or visit{" "}
            <a href="https://crewsync.app" className="underline hover:text-foreground">
              crewsync.app
            </a>
            .
          </p>
        </div>
      </section>
    </div>
  </div>
);

export default PrivacyPolicy;
