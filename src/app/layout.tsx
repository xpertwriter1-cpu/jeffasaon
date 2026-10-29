import type { Metadata } from 'next';
import { Navigation } from '@/components/navigation';
import { currentUser } from '@/lib/session';
import { school } from '@/lib/school';
import './globals.css';
export const metadata: Metadata = {
  title: { default: school.name, template: '%s | ' + school.name },
  description:
    'A caring preschool in Rongai, Kenya. Daycare, Playgroup, PP1 and PP2 with room to learn, play and grow.',
};
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <div className="contact-strip">
          <div className="container">
            <span>{school.location}</span>
            <a href={'tel:' + school.phone.replaceAll(' ', '')}>{school.phone}</a>
          </div>
        </div>
        <Navigation user={user} />
        <main id="main">{children}</main>
        <footer className="site-footer">
          <div className="container footer-grid">
            <div>
              <h2>{school.name}</h2>
              <p>A caring start. A confident future.</p>
              <p>Room to learn, play and grow in Rongai.</p>
            </div>
            <div>
              <h3>Explore</h3>
              {['about', 'programs', 'admissions', 'contact'].map((id) => (
                <a href={'/#' + id} key={id}>
                  {id === 'programs' ? 'Programmes' : id[0]!.toUpperCase() + id.slice(1)}
                </a>
              ))}
            </div>
            <div>
              <h3>Visit or get in touch</h3>
              <p>{school.location}</p>
              <a href={'tel:' + school.phone.replaceAll(' ', '')}>{school.phone}</a>
              <a href={'mailto:' + school.email}>{school.email}</a>
            </div>
          </div>
          <div className="container footer-bottom">
            <span>
              &copy; {new Date().getFullYear()} {school.name}
            </span>
            <a href="/photo-credits">Photo credits</a>
          </div>
        </footer>
      </body>
    </html>
  );
}
