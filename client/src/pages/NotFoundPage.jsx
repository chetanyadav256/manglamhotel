import PageIntro from '../components/ui/PageIntro.jsx';
import ActionLink from '../components/ui/ActionLink.jsx';

export default function NotFoundPage() {
  return (
    <>
      <PageIntro eyebrow="404" title="Page not found" description="The page you are looking for could not be found." />
      <ActionLink to="/">Back to home</ActionLink>
    </>
  );
}
