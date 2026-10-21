export default function PageIntro({ eyebrow, title, description, noIndex = false, children }) {
  return (
    <>
      <title>{`${title} | Manglam Hotel & Restaurant`}</title>
      <meta name="description" content={description} />
      {noIndex && <meta name="robots" content="noindex, nofollow" />}
      <div className="mb-10 max-w-3xl">
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="mt-4 font-display text-4xl leading-tight text-forest sm:text-6xl">{title}</h1>
        <p className="mt-5 max-w-2xl text-base leading-8 text-muted sm:text-lg">{description}</p>
        {children}
      </div>
    </>
  );
}
