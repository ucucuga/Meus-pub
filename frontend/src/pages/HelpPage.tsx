import { useNavigate } from 'react-router-dom';
import styles from './HelpPage.module.css';

function BackIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M15 6l-6 6 6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const STEPS = [
  {
    title: 'Connect your wallet',
    description:
      'Open Meus and connect your TON wallet (Tonkeeper or any TON wallet) via TON Connect.',
  },
  {
    title: 'Create a contract',
    description:
      "Set the project name, counterparty's Telegram ID, deadline, and payment amount. Choose your role — Customer or Performer.",
  },
  {
    title: 'Fund the escrow',
    description:
      'As Customer, deposit the agreed amount into the smart contract. Funds are locked on the blockchain — neither party can access them until the contract is resolved.',
  },
  {
    title: 'Complete the work',
    description:
      'As Performer, complete the work before the deadline and mark it as done in the app. This starts the 48-hour review period.',
  },
  {
    title: 'Review and approve',
    description:
      'As Customer, review the work within 48 hours. The Performer has attached the work either via direct messages or in the files section on the platform. If satisfied or if there are minor flaws that can be quickly corrected, then confirm the payment. Funds are instantly sent to the Performer.',
  },
  {
    title: 'Dispute resolution',
    description:
      "If there's a disagreement, so that the work is done in a completely inappropriate way, then open a dispute. Both parties submit evidence. The arbiter reviews and decides within 30 days.",
  },
] as const;

const RULES = [
  {
    icon: '💰',
    title: 'Commission',
    description: `Commission is deducted from the escrow amount:
- Up to 100 TON → 3%
- 100–500 TON → 2%
- Over 500 TON → 1%
Commission is taken from the Performer's payment.`,
  },
  {
    icon: '⏰',
    title: 'Deadlines',
    description: `• Work must be submitted before the project deadline
• Customer has 48 hours to review submitted work
• If Customer does not act in 48 hours, payment is automatically released to the Performer`,
  },
  {
    icon: '⚖️',
    title: 'Disputes',
    description: `• Only the Customer can open a dispute
• Disputes must be opened within the 48-hour review window
• Both parties submit evidence once
• Arbiter decides within 30 days`,
  },
  {
    icon: '🔒',
    title: 'Your funds are safe',
    description:
      'All funds are held by the smart contract on the TON blockchain. Neither Meus nor any other party can access or move your funds — only the contract rules can release them.',
  },
  {
    icon: '🚫',
    title: 'Cancellation',
    description:
      'Once an escrow contract is created and accepted by both parties, it cannot be cancelled. The funds remain locked in the smart contract until the work is approved, a dispute is resolved, or a timeout occurs. Choose your counterparty carefully before creating a contract.',
  },
  {
    icon: '📱',
    title: 'Blockchain transactions',
    description:
      'Some actions (deposit, approve, dispute) require signing a transaction in your TON wallet. Make sure your wallet is connected and has enough TON for gas fees (keep at least 0.1 TON extra).',
  },
] as const;

function openSupportBot(): void {
  const tg = window.Telegram?.WebApp;
  if (tg?.openTelegramLink) {
    tg.openTelegramLink('https://t.me/meus_escrow_help');
  } else {
    window.open('https://t.me/meus_escrow_help', '_blank', 'noopener,noreferrer');
  }
}

export function HelpPage() {
  const navigate = useNavigate();

  return (
    <div className={styles.page}>
      <div className={styles.blob1} aria-hidden />
      <div className={styles.blob2} aria-hidden />
      <div className={styles.blob3} aria-hidden />
      <header className={styles.header}>
        <button
          type="button"
          className={styles.backButton}
          aria-label="Go back"
          onClick={() => navigate(-1)}
        >
          <BackIcon />
        </button>
        <h1 className={styles.headerTitle}>How it works</h1>
      </header>

      <main className={styles.content}>
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>How to use Meus</h2>
          <div className={styles.cardList}>
            {STEPS.map((step, index) => (
              <article key={step.title} className={styles.stepCard}>
                <span className={styles.stepNumber}>{index + 1}</span>
                <div className={styles.stepBody}>
                  <h3 className={styles.stepTitle}>{step.title}</h3>
                  <p className={styles.stepDescription}>{step.description}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Rules & important info</h2>
          <div className={styles.cardList}>
            {RULES.map((rule) => (
              <article key={rule.title} className={styles.ruleCard}>
                <span className={styles.ruleIcon} aria-hidden>
                  {rule.icon}
                </span>
                <div className={styles.stepBody}>
                  <h3 className={styles.stepTitle}>{rule.title}</h3>
                  <p className={styles.stepDescription}>{rule.description}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>📬 Contact & support</h2>
          <div className={styles.contactBlock}>
            <p className={styles.contactText}>For support or questions, contact us via:</p>
            <button type="button" className={styles.botButton} onClick={openSupportBot}>
              @meus_escrow_help
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
