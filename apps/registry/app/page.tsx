import Link from "next/link";
import Image from "next/image";

export default function HomePage(): JSX.Element {
  return (
    <main className="page">

      <div>
        <Image src="/images/skills.gif" alt="SKPM" width={540} height={380} className="skills-image" />

        <section className="card">
          <p className="eyebrow">SKPM</p>
          <h1>Coming soon</h1>

          <p className="copy">
            Skills Package Manager.
            Support required: <Link href="https://github.com/blake-simpson/skpm">github.com/blake-simpson/skp</Link>
          </p>
        </section>
      </div>
    </main>
  );
}
