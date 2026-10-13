import Link from "next/link";
import { Card, PageHeading, PageWidth, textLink } from "@/components/ui";

const EMAIL = "contact@malikstefan.com";

function Email() {
  return (
    <a href={`mailto:${EMAIL}`} className={textLink}>
      {EMAIL}
    </a>
  );
}

// Public: anyone can read the terms before signing in or paying.
export default function Terms() {
  return (
    <PageWidth>
      <PageHeading intro="Last updated: 13 October 2026">Refund policy and terms</PageHeading>
      <Card className="space-y-3 leading-relaxed">
        <p>Report Harmonizer is run by Malik Machaieie, a sole operator based in Denmark.</p>

        <h2 className="pt-6 text-xl font-semibold text-navy">Refund policy</h2>
        <p>
          You can get a full refund within 14 days of any charge. Email <Email /> to ask.
        </p>
        <p>
          The first time you ask, no questions are asked. After that, I give refunds only if
          the service did not work as described.
        </p>
        <p>
          The money goes back to the card you paid with. I process refunds within 5 business
          days.
        </p>
        <p>A refund ends your subscription right away.</p>

        <h2 className="pt-6 text-xl font-semibold text-navy">Terms of sale</h2>

        <h3 className="pt-2 font-semibold text-navy">Price and payment</h3>
        <p>Report Harmonizer costs 15 euros a month.</p>
        <p>Prices are in euros. I am not registered for VAT, so no VAT is added.</p>
        <p>You pay by card. Stripe handles the payment and charges your card every month until you cancel.</p>

        <h3 className="pt-2 font-semibold text-navy">Cancelling</h3>
        <p>
          You can cancel at any time. Go to the{" "}
          <Link href="/billing" className={textLink}>
            billing page
          </Link>{" "}
          and click Manage subscription.
        </p>
        <p>
          Cancelling takes effect at the end of the month you have paid for. You keep access
          until then.
        </p>

        <h3 className="pt-2 font-semibold text-navy">What the service does</h3>
        <p>
          You upload a Word report. Report Harmonizer edits it into one voice and gives it back
          to you. Every change is a tracked change in Word.
        </p>
        <p>
          An AI model makes the edits, and it can make mistakes. You review each change and
          accept or reject it.
        </p>
        <p>There is no uptime guarantee.</p>

        <h3 className="pt-2 font-semibold text-navy">Your reports and payments</h3>
        <p>
          To make the edits, the text of your report is sent to Anthropic, through the Claude
          API. Payments are handled by Stripe.
        </p>
        <p>
          Uploaded reports and the edited files are stored on my server in New York, USA. For
          now they are kept until you ask me to delete them. Email me and I will delete them
          within 3 business days.
        </p>

        <h3 className="pt-2 font-semibold text-navy">If I end the service</h3>
        <p>
          I can end the service with 30 days notice by email. If I do, I refund the unused part
          of your current month.
        </p>

        <h3 className="pt-2 font-semibold text-navy">Support</h3>
        <p>
          Email <Email />. I reply within 3 business days.
        </p>
      </Card>
    </PageWidth>
  );
}
