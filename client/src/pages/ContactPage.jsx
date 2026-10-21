import { Camera, MapPin, Phone } from 'lucide-react';
import PageIntro from '../components/ui/PageIntro.jsx';
import ExternalLink from '../components/ui/ExternalLink.jsx';
import { useSiteSettings } from '../app/SiteSettingsContext.js';

function ContactSection({ id, number, icon: Icon, title, description, children }) {
  return (
    <section className="contact-section" aria-labelledby={`${id}-heading`}>
      <div className="contact-section-intro">
        <span className="contact-section-icon"><Icon size={23} strokeWidth={1.5} aria-hidden="true" /></span>
        <div><p className="eyebrow mb-2">{number} / Get in touch</p><h2 id={`${id}-heading`} className="section-heading">{title}</h2><p className="mt-3 max-w-xs text-sm leading-7 text-muted">{description}</p></div>
      </div>
      <div className="contact-section-details">{children}</div>
    </section>
  );
}

export default function ContactPage() {
  const contactDetails = useSiteSettings();

  return (
    <>
      <PageIntro eyebrow="Let’s plan your visit" title="We’re here to help." description="For room details, availability or restaurant enquiries, reach out to the Manglam team. We look forward to hearing from you." />
      <div className="contact-sections">
        <ContactSection id="phone" number="01" icon={Phone} title="Phone numbers" description="A conversation is a good place to start. Call our team directly.">
          <div className="phone-options">
            {contactDetails.phones.map((phone) => (
              <a key={phone.href} href={phone.href} className="phone-button">
                <span><span className="phone-number">{phone.label}</span><span className="phone-action">Tap to call</span></span>
                <span className="phone-icon"><Phone size={19} aria-hidden="true" /></span>
              </a>
            ))}
          </div>
        </ContactSection>
        <ContactSection id="instagram" number="02" icon={Camera} title="Instagram" description="Find Manglam on Instagram.">
          <p className="mb-5 font-display text-2xl text-forest">Manglam on Instagram</p>
          <ExternalLink href={contactDetails.instagram} className="button button-outline"><Camera size={18} aria-hidden="true" />Visit Instagram</ExternalLink>
        </ContactSection>
        <ContactSection id="location" number="03" icon={MapPin} title="Hotel location" description="Find the hotel at the address below. Open the map for directions.">
          <address className="mb-6 whitespace-pre-line leading-8 text-muted not-italic">{contactDetails.address}</address>
          <ExternalLink href={contactDetails.maps}><MapPin size={18} aria-hidden="true" />Open Google Maps</ExternalLink>
        </ContactSection>
      </div>
    </>
  );
}
