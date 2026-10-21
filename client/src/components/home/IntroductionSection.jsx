import ActionLink from '../ui/ActionLink.jsx';

export default function IntroductionSection() {
  return (
    <section className="introduction-section" aria-labelledby="intro-heading">
      <div className="page-container introduction-grid">
        <div className="intro-monogram" aria-hidden="true"><span className="intro-monogram-caption">MANGLAM · RAJASTHAN</span><span className="intro-letter">M</span><span className="intro-monogram-bottom">HOTEL & RESTAURANT</span></div>
        <div>
          <p className="eyebrow">A little about us</p>
          <h2 id="intro-heading" className="display-heading mt-4">Your visit starts<br />with a conversation.</h2>
          <p className="mt-6 max-w-lg leading-8 text-muted">Manglam Hotel & Restaurant is located on Kalwar Road in Kalwad, Rajasthan. This is your place to explore room information and find out about our restaurant.</p>
          <p className="mt-4 mb-7 max-w-lg leading-8 text-muted">Have a question before you visit? Speak directly with our team for current room details, prices and availability, or restaurant enquiries.</p>
          <ActionLink to="/contact" variant="outline">Say hello</ActionLink>
        </div>
      </div>
    </section>
  );
}
