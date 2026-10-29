import Image from 'next/image';
import Link from 'next/link';
import { randomBytes } from 'node:crypto';
import { ActionForm } from '@/components/action-form';
import { Field, Hidden } from '@/components/fields';
import { sendEnquiry } from '@/actions/enquiries';
import { school, programmes } from '@/lib/school';
const descriptions = [
  'A gentle daily routine with care, play and rest.',
  'Learning to share, make friends and explore together.',
  'Discovering letters, numbers and the joy of asking questions.',
  'Growing independence and getting ready for the next step.',
];
export default function Home() {
  return (
    <>
      <section id="home" className="hero">
        <div className="container hero-grid">
          <div className="hero-copy">
            <span className="eyebrow">A little school. A warm welcome.</span>
            <h1>
              Small beginnings.
              <br />
              <em>A world of possibility.</em>
            </h1>
            <p>
              Curious minds need room to grow. At Jeffersons, children learn through play,
              find their confidence and feel at home.
            </p>
            <div className="button-row">
              <a className="button" href="#admissions">
                Find your child's place
              </a>
              <a className="plain-link" href="#about">
                Get to know us <span aria-hidden="true">&rarr;</span>
              </a>
            </div>
            <div className="hero-detail">
              <span>Daycare to PP2</span>
              <span>Rongai, Kenya</span>
            </div>
          </div>
          <figure className="hero-photo">
            <Image
              src="/images/african-preschool.jpg"
              alt="Young children and their caregiver at a community preschool in Cape Town, South Africa"
              width={1440}
              height={960}
              sizes="(max-width: 800px) 100vw, 52vw"
              preload
            />
            <figcaption>
              <strong>Every child belongs.</strong>
              <span>Care, connection and a little discovery, every day.</span>
            </figcaption>
          </figure>
        </div>
      </section>
      <section id="about" className="section container">
        <div className="section-heading">
          <span className="eyebrow">Our approach</span>
          <h2>Childhood is for exploring.</h2>
          <p>
            We work with families to make the early years feel safe, meaningful and full
            of possibility.
          </p>
        </div>
        <div className="card-grid three">
          {[
            {
              n: '01',
              title: 'Learn through play',
              copy: 'Stories, making things, movement and discovery help children make sense of the world.',
            },
            {
              n: '02',
              title: 'Feel known and cared for',
              copy: 'A warm welcome and familiar routines help little learners settle in and take part.',
            },
            {
              n: '03',
              title: 'Grow at their own pace',
              copy: 'We encourage small steps towards independence, friendship and the confidence to try.',
            },
          ].map((item) => (
            <article className="feature-card" key={item.n}>
              <span className="card-number">{item.n}</span>
              <h3>{item.title}</h3>
              <p>{item.copy}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="learning-band">
        <div className="container split">
          <figure>
            <Image
              src="/images/nursery-classroom.png"
              alt="A nursery school teacher leading a classroom lesson in Douala, Cameroon"
              width={960}
              height={640}
              sizes="(max-width: 800px) 100vw, 45vw"
            />
            <figcaption className="photo-note">
              A glimpse of early learning in Africa. Representative photograph.
            </figcaption>
          </figure>
          <div>
            <span className="eyebrow">A foundation for life</span>
            <h2>More than the first letters and numbers.</h2>
            <p>
              Early learning is also about speaking up, listening, making a friend and
              trying again. We make space for all of it.
            </p>
            <a className="plain-link" href="#programs">
              Explore our programmes <span aria-hidden="true">&rarr;</span>
            </a>
          </div>
        </div>
      </section>
      <section id="programs" className="section container">
        <div className="section-heading">
          <span className="eyebrow">Learning at every stage</span>
          <h2>A place for your little learner.</h2>
          <p>From a first day away from home to getting ready for primary school.</p>
        </div>
        <div className="card-grid four">
          {programmes.map((name, index) => (
            <article className="programme-card" key={name}>
              <span className="card-number">0{index + 1}</span>
              <h3>{name}</h3>
              <p>{descriptions[index]}</p>
              <a className="plain-link" href="#admissions">
                Admissions <span aria-hidden="true">&rarr;</span>
              </a>
            </article>
          ))}
        </div>
        <p className="muted small-text">
          Contact us to confirm ages, hours, availability and current fees.
        </p>
      </section>
      <section id="admissions" className="admissions-band">
        <div className="container">
          <div className="section-heading">
            <span className="eyebrow">Your next chapter starts here</span>
            <h2>Let's take the first step together.</h2>
            <p>
              Choose a programme, create a parent account and tell us about your child.
              Our team will review the application and guide you through the next steps.
            </p>
          </div>
          <div className="admission-steps">
            <p>
              <strong>1. Choose a programme</strong>
              <span>Find the stage that suits your child.</span>
            </p>
            <p>
              <strong>2. Tell us about your child</strong>
              <span>Complete the admission form in your parent portal.</span>
            </p>
            <p>
              <strong>3. Hear from our team</strong>
              <span>We review your application before confirming a place.</span>
            </p>
          </div>
          <div className="button-row">
            {programmes.map((name) => (
              <Link
                className="button secondary"
                key={name}
                href={'/parent/admission?classLevel=' + name}
              >
                Apply for {name}
              </Link>
            ))}
          </div>
        </div>
      </section>
      <section id="contact" className="section container">
        <div className="contact-grid">
          <div>
            <span className="eyebrow">We would love to hear from you</span>
            <h2>Come with your questions.</h2>
            <p>
              Ask about a place, our programmes or arranging a visit. We will get back to
              you by email.
            </p>
            <dl className="contact-details">
              <dt>Call us</dt>
              <dd>
                <a href={'tel:' + school.phone.replaceAll(' ', '')}>{school.phone}</a>
              </dd>
              <dt>Email</dt>
              <dd>
                <a href={'mailto:' + school.email}>{school.email}</a>
              </dd>
              <dt>Find us</dt>
              <dd>{school.location}</dd>
            </dl>
          </div>
          <ActionForm action={sendEnquiry} label="Send enquiry">
            <Hidden name="requestKey" value={randomBytes(32).toString('hex')} />
            <div hidden>
              <label>
                Leave empty
                <input name="website" tabIndex={-1} autoComplete="off" />
              </label>
            </div>
            <Field name="parentName" label="Your name" required />
            <div className="form-grid">
              <Field
                name="email"
                label="Email address"
                type="email"
                required
                maxLength={254}
              />
              <Field
                name="phone"
                label="Phone number"
                type="tel"
                required
                maxLength={30}
              />
            </div>
            <Field name="childAge" label="Child's age (optional)" maxLength={100} />
            <Field
              name="message"
              label="How can we help?"
              type="textarea"
              maxLength={5000}
              required
            />
            <p className="muted small-text">
              Your details are used to respond to this enquiry.
            </p>
          </ActionForm>
        </div>
      </section>
    </>
  );
}
