export default function ArchIllustration({ className = '' }) {
  return (
    <div className={`arch-illustration ${className}`} aria-hidden="true">
      <svg viewBox="0 0 480 460" fill="none" focusable="false">
        <circle cx="378" cy="94" r="47" fill="#D4AD70" />
        <path d="M54 423V223a186 186 0 0 1 372 0v200" stroke="#C6AB83" />
        <path d="M78 423V223a162 162 0 0 1 324 0v200" stroke="#C6AB83" />
        <path d="M102 423V223a138 138 0 0 1 276 0v200" fill="#DBC7A6" />
        <path d="M128 423V223a112 112 0 0 1 224 0v200" fill="#A8AE95" />
        <path d="M155 423V223a85 85 0 0 1 170 0v200" fill="#617766" />
        <path d="M183 423V223a57 57 0 0 1 114 0v200" fill="#203E37" />
        <path d="M183 423 240 311l57 112" fill="#39584A" />
        <path d="M31 424h418M55 438h370M80 452h320" stroke="#A58B64" />
        <path d="M29 374V270m0 51c-19-3-25-15-24-29 17 4 25 14 24 29Zm0-22c21-3 30-15 29-30-18 3-29 14-29 30Zm0 54c22-3 32-16 31-32-20 4-30 16-31 32Z" stroke="#617766" strokeWidth="2" />
        <path d="M444 389v-96m0 49c-17-2-26-14-25-28 17 2 26 15 25 28Zm0 21c19-2 29-15 28-30-19 3-29 15-28 30Z" stroke="#617766" strokeWidth="2" />
        <path d="M20 375h20l-4 49H25l-5-49Zm413 14h61l-10 35h-41l-10-35Z" fill="#BB9471" />
      </svg>
    </div>
  );
}
