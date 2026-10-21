import HeroSection from '../components/home/HeroSection.jsx';
import ExploreSection from '../components/home/ExploreSection.jsx';
import IntroductionSection from '../components/home/IntroductionSection.jsx';
import LocationSection from '../components/home/LocationSection.jsx';

export default function HomePage() {
  return (
    <>
      <title>Manglam Hotel & Restaurant | Kalwad, Rajasthan</title>
      <meta name="description" content="Welcome to Manglam Hotel & Restaurant in Kalwad, Rajasthan. Explore rooms, discover our restaurant and contact our team to plan your visit." />
      <HeroSection />
      <ExploreSection />
      <IntroductionSection />
      <LocationSection />
    </>
  );
}
