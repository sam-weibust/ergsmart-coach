const PrivacyPolicy = () => (
  <div className="min-h-screen bg-background text-foreground">
    <div className="max-w-3xl mx-auto px-6 py-16">
      <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
      <p className="text-sm text-muted-foreground mb-10">
        Last updated: May 24, 2026 &nbsp;·&nbsp;{" "}
        <a href="https://crewsync.app" className="underline hover:text-foreground">
          crewsync.app
        </a>
      </p>

      <section className="space-y-8 text-sm leading-relaxed">
        <div>
          <h2 className="text-lg font-semibold mb-2">1. Who we are</h2>
          <p>
            CrewSync ("we", "us", "our") operates the rowing training platform available at{" "}
            <a href="https://crewsync.app" className="underline hover:text-foreground">
              crewsync.app
            </a>
            . This policy explains what personal information we collect, how it is used,
            how it is stored and protected, and your rights over that information. CrewSync
            complies with Massachusetts 201 CMR 17.00 (Standards for the Protection of
            Personal Information of Residents of the Commonwealth).
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">2. What personal information we collect</h2>
          <p>We collect only the data necessary to deliver personalised training insights:</p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>Account credentials — email address and hashed password (via Supabase Auth)</li>
            <li>Athlete profile — name, date of birth, height, weight, experience level</li>
            <li>Rowing performance data — erg scores, splits, heart rate, distance, workout history</li>
            <li>Recovery and wellness data — sleep, hydration, perceived exertion entered manually</li>
            <li>Training plan data — generated workout plans and coach-uploaded training philosophy</li>
            <li>Uploaded files — profile avatar and training videos (stored in Supabase Storage)</li>
            <li>Usage data — last sign-in time, last active timestamp (for session security)</li>
            <li>Team data — team membership and, for coaches, team roster and contact information</li>
          </ul>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">3. How we use your data</h2>
          <p>
            All data collected by CrewSync is used exclusively to provide the service:
          </p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>Generating personalised training plans and erg workout recommendations</li>
            <li>Tracking and displaying your athletic progress over time</li>
            <li>Enabling coaches to manage team rosters and training programs</li>
            <li>Sending transactional emails (account changes, deletion confirmation)</li>
            <li>Security and fraud prevention (audit logs, session timeout enforcement)</li>
          </ul>
          <p className="mt-2">
            We do not use your data for advertising, profiling unrelated to sport performance,
            or any purpose beyond the core service described above.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">4. How we store and protect your data</h2>
          <p>We implement the following technical and organisational safeguards:</p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>All data transmitted over HTTPS with HSTS enforced (2-year max-age, preloaded)</li>
            <li>Passwords hashed using bcrypt via Supabase Auth — never stored in plaintext</li>
            <li>Row-level security (RLS) enforced on all personal data tables in the database</li>
            <li>Minimum 12-character passwords required, with complexity requirements enforced</li>
            <li>Audit log of sensitive actions (password changes, data exports, account deletion)</li>
            <li>Session timeout enforced after 30 consecutive days of inactivity</li>
            <li>Security headers: X-Content-Type-Options, X-Frame-Options, Referrer-Policy,
              Content-Security-Policy, Permissions-Policy</li>
            <li>Database and storage hosted on Supabase infrastructure with encryption at rest</li>
          </ul>
          <p className="mt-2">
            No method of transmission or storage is 100% secure, but we take reasonable measures
            consistent with Massachusetts 201 CMR 17.00 to protect personal information against
            unauthorized access, use, modification, and disclosure.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">5. Data retention</h2>
          <p>
            We retain your personal data for as long as your account is active. If you delete
            your account, your personal data is <strong>permanently and irreversibly removed</strong> from
            our systems immediately — including your profile, erg workouts, scores, recovery logs,
            wellness check-ins, training plans, and uploaded files. This is a hard delete
            with no recovery period, consistent with 201 CMR 17.00. A confirmation email is sent
            to your registered address when deletion is complete.
          </p>
          <p className="mt-2">
            Audit log entries referencing your user ID may be retained for up to 90 days for
            security compliance purposes before being purged.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">6. Data sharing</h2>
          <p>
            <strong>We never sell your data.</strong> Your personal information is never shared
            with advertisers, data brokers, or any external organisation for commercial purposes.
          </p>
          <p className="mt-2">We use the following sub-processors solely to operate the platform:</p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>Supabase — database, authentication, and file storage (United States)</li>
            <li>Anthropic — AI-generated training plan and insight generation (United States)</li>
            <li>Vercel — web hosting and global delivery (United States)</li>
            <li>Resend — transactional email delivery (United States)</li>
          </ul>
          <p className="mt-2">
            Each sub-processor receives only the minimum data required to perform their function
            and is bound by their own data processing agreements.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">7. Minor data protection and parental rights</h2>
          <p>
            CrewSync is used by scholastic and collegiate rowing programs that may include athletes
            under the age of 18. We take the following steps to protect minor data:
          </p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>Athletes under 18 require parental or guardian consent before account creation.
              Coaches are responsible for obtaining and documenting this consent.</li>
            <li>Minor athlete data is subject to the same collection minimisation and retention
              controls as adult data.</li>
            <li>Parents or guardians of minor athletes may request access to, correction of,
              or deletion of their child's data by contacting us at the address below.</li>
            <li>We do not knowingly collect personal information from children under 13 without
              verifiable parental consent.</li>
          </ul>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">8. Your rights and how to exercise them</h2>
          <p>
            Under Massachusetts 201 CMR 17.00 and general data protection principles, you have the
            following rights:
          </p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li><strong>Right to access</strong> — download all your personal data as a JSON file
              from Account Settings → Export My Data, or contact us.</li>
            <li><strong>Right to deletion</strong> — permanently delete your account and all data
              from Account Settings → Delete My Account, or contact us.</li>
            <li><strong>Right to correction</strong> — update your profile information from the
              Dashboard, or contact us for corrections we cannot process automatically.</li>
            <li><strong>Right to data portability</strong> — use the Export My Data feature to
              download a machine-readable copy of all your data.</li>
          </ul>
          <p className="mt-2">
            To submit a privacy request, contact us at:
          </p>
          <p className="mt-1 font-medium">
            <a href="mailto:sam.weibust@gmail.com" className="underline hover:text-foreground">
              sam.weibust@gmail.com
            </a>
          </p>
          <p className="mt-2">
            We will respond to all privacy requests within 30 days.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">9. Massachusetts 201 CMR 17.00 compliance</h2>
          <p>
            CrewSync maintains a Written Information Security Program (WISP) consistent with
            Massachusetts 201 CMR 17.00. Our program includes:
          </p>
          <ul className="list-disc pl-6 mt-2 space-y-1">
            <li>Designation of an employee responsible for the security program (Sam Weibust,
              sam.weibust@gmail.com)</li>
            <li>Risk assessment and identification of reasonably foreseeable internal and external
              risks to personal information</li>
            <li>Technical safeguards including encryption in transit, password controls, access
              restrictions via row-level security, and audit logging</li>
            <li>Secure access credential management — minimum 12-character passwords with complexity
              requirements enforced at the application level</li>
            <li>Immediate hard deletion of personal data upon account closure</li>
            <li>Regular review of this policy and security practices</li>
          </ul>
          <p className="mt-2">
            For compliance inquiries, contact: sam.weibust@gmail.com
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">10. Changes to this policy</h2>
          <p>
            We may update this policy as our practices or the law changes. When we do, we will
            revise the "last updated" date at the top of this page. Continued use of CrewSync
            after any material changes constitutes acceptance of the updated policy. For significant
            changes, we will notify users via email.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-2">11. Contact</h2>
          <p>
            For privacy questions, data requests, or compliance concerns, contact:
          </p>
          <p className="mt-2 font-medium">
            Sam Weibust — CrewSync Privacy Contact
            <br />
            <a href="mailto:sam.weibust@gmail.com" className="underline hover:text-foreground">
              sam.weibust@gmail.com
            </a>
          </p>
        </div>
      </section>
    </div>
  </div>
);

export default PrivacyPolicy;
