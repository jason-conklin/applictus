const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..', '..');
const webBlogDir = path.join(rootDir, 'web', 'blog');
const publicBlogDir = path.join(rootDir, 'public', 'blog');

const SITE_URL = 'https://applictus.com';
const CSS_VERSION = '86';

const articles = [
  {
    slug: 'job-application-tracker',
    category: 'Guide',
    readTime: '5 min read',
    title: 'Job Application Tracker | Applictus',
    h1: 'Job Application Tracker',
    description:
      'Learn what a job application tracker should capture and how Applictus builds an automatic application timeline from forwarded job emails.',
    intro:
      'A job application tracker should give you a clear answer to one question: what is happening with every opportunity in your job search?',
    sections: [
      {
        heading: 'What a job application tracker should do',
        paragraphs: [
          'A useful tracker records more than company names. It should show the role, current status, last activity, important dates, and every hiring update that changes what you should do next.',
          'The problem is that most tracking systems rely on manual updates. You apply for a role, get a confirmation email, receive an assessment request, schedule an interview, and then have to remember to update a spreadsheet after each step.'
        ],
        bullets: [
          'Application confirmations and submitted roles',
          'Interview invitations, assessments, and recruiter next steps',
          'Offers, rejections, follow-ups, and hiring updates',
          'A timeline that shows the latest activity without sorting through email'
        ]
      },
      {
        heading: 'How Applictus tracks applications automatically',
        paragraphs: [
          'Applictus uses an inbox-powered workflow. After setup, job-related emails are forwarded to your personal Applictus address. Applictus reads those forwarded updates, identifies the company, role, and status, then organizes them into a timeline.',
          'This means you do not need to give Applictus full Gmail inbox access. Google sign-in is used for authentication, while tracking runs through forwarding that you control.'
        ]
      },
      {
        heading: 'Why automatic tracking matters',
        paragraphs: [
          'A job search moves quickly. It is easy to miss an assessment deadline or forget which company requested an interview. Automatic tracking reduces that friction because the update is captured when the email arrives.',
          'The result is a calmer dashboard that shows confirmations, interviews, offers, rejections, and follow-ups in one place.'
        ]
      }
    ],
    related: [
      'track-job-applications-from-email',
      'how-to-track-job-applications',
      'interview-tracker'
    ]
  },
  {
    slug: 'track-job-applications-from-email',
    category: 'Email tracking',
    readTime: '6 min read',
    title: 'Track Job Applications From Email Automatically | Applictus',
    h1: 'Track Job Applications From Email Automatically',
    description:
      'See how email-based job application tracking works with Gmail forwarding, filters, and an automatic application timeline.',
    intro:
      'Most job search updates already arrive by email. Applictus turns those updates into an organized application timeline.',
    sections: [
      {
        heading: 'Why email is the best signal for job search tracking',
        paragraphs: [
          'Application confirmations, interview invitations, assessment links, offer letters, rejection notices, and recruiter follow-ups usually land in your inbox first.',
          'Instead of asking you to enter every update by hand, Applictus uses those emails as the source of truth for your job search.'
        ]
      },
      {
        heading: 'How the forwarding workflow works',
        paragraphs: [
          'When you create an account, Applictus gives you a personal inbox address. You enable Gmail forwarding and, if you want more control, add Gmail filters for job-related senders or keywords.',
          'After setup, Applictus processes forwarded job emails automatically. It identifies the hiring platform or recruiter message, extracts useful details, and updates your dashboard.'
        ],
        bullets: [
          'No Gmail inbox read permission is required',
          'You control what gets forwarded',
          'You can disable forwarding any time',
          'Forwarded updates become application timeline events'
        ]
      },
      {
        heading: 'What Applictus can organize from email',
        paragraphs: [
          'Applictus is designed for job-related emails from job boards, company portals, applicant tracking systems, and recruiters.',
          'That includes updates from platforms such as LinkedIn, Indeed, Workday, Greenhouse, Lever, iCIMS, SmartRecruiters, and many company hiring portals.'
        ]
      }
    ],
    related: [
      'how-to-use-gmail-filters-for-job-applications',
      'job-application-tracker',
      'job-application-spreadsheet-alternative'
    ]
  },
  {
    slug: 'job-application-spreadsheet-alternative',
    category: 'Productivity',
    readTime: '5 min read',
    title: 'Job Application Spreadsheet Alternative | Applictus',
    h1: 'Job Application Spreadsheet Alternative',
    description:
      'Compare manual job application spreadsheets with automatic job search tracking from Applictus.',
    intro:
      'Spreadsheets can work at the start of a job search, but they become harder to maintain as applications, interviews, and follow-ups pile up.',
    sections: [
      {
        heading: 'Where spreadsheets break down',
        paragraphs: [
          'A spreadsheet asks you to be the system. You have to remember to add every company, paste links, update statuses, note deadlines, and keep the rows current.',
          'That creates a gap between what is happening in your inbox and what your tracker says. During an active job search, that gap can mean missed follow-ups or outdated status notes.'
        ]
      },
      {
        heading: 'What an automatic alternative should improve',
        paragraphs: [
          'A better tracker should reduce manual work while still keeping your job search organized. It should capture emails, group related updates, and make the next status obvious.',
          'Applictus focuses on the workflow job seekers already have: application updates arriving by email.'
        ],
        bullets: [
          'Automatic application timeline creation',
          'Status updates for applied, interview, offer, and rejection stages',
          'Email-based tracking without full inbox access',
          'A dashboard built for scanning active opportunities'
        ]
      },
      {
        heading: 'When to move beyond a spreadsheet',
        paragraphs: [
          'If you are applying to several roles per week, using multiple job boards, or receiving assessment and interview requests, an automatic tracker can save time quickly.',
          'The goal is not to make another table. The goal is to keep a reliable timeline without asking you to update cells after every email.'
        ]
      }
    ],
    related: [
      'best-job-application-trackers',
      'job-application-tracker',
      'track-job-applications-from-email'
    ]
  },
  {
    slug: 'interview-tracker',
    category: 'Interview tracking',
    readTime: '5 min read',
    title: 'Interview Tracker for Job Seekers | Applictus',
    h1: 'Interview Tracker for Job Seekers',
    description:
      'Learn how to track interviews, assessments, recruiter requests, and next steps in one job search timeline.',
    intro:
      'Interview tracking is more than writing down a calendar event. You need to know who asked for the interview, what action is required, and how it fits into the rest of your search.',
    sections: [
      {
        heading: 'What belongs in an interview tracker',
        paragraphs: [
          'A good interview tracker should include recruiter outreach, interview invitations, scheduling links, assessments, take-home assignments, and follow-up reminders.',
          'It should also preserve context. If a company sends an assessment as the next step in the interview process, that is an interview-stage action item, not just another email.'
        ],
        bullets: [
          'Interview invitations and scheduling requests',
          'Assessment links and completion deadlines',
          'Recruiter follow-ups and next-step instructions',
          'Offer and rejection outcomes after interviews'
        ]
      },
      {
        heading: 'How Applictus detects interview updates',
        paragraphs: [
          'Applictus analyzes forwarded job-related emails for hiring-stage signals. Phrases such as schedule your interview, next step in your interview process, complete the assessment, or speak with our team can update an application to an interview status.',
          'Those events appear in the application timeline so you can quickly see which opportunities require action.'
        ]
      },
      {
        heading: 'Why interview tracking helps',
        paragraphs: [
          'When interviews are spread across Gmail, calendars, job boards, and recruiter threads, it is easy to lose track of what needs attention.',
          'A central timeline keeps your active opportunities visible and reduces the chance of missing an important deadline.'
        ]
      }
    ],
    related: [
      'how-to-track-job-applications',
      'track-job-applications-from-email',
      'how-to-use-gmail-filters-for-job-applications'
    ]
  },
  {
    slug: 'how-to-track-job-applications',
    category: 'How to',
    readTime: '7 min read',
    title: 'How To Track Job Applications Effectively | Applictus',
    h1: 'How To Track Job Applications Effectively',
    description:
      'A practical guide to tracking job applications, interviews, follow-ups, offers, and rejections without losing momentum.',
    intro:
      'The best way to track job applications is to keep the system simple enough that you will actually use it every week.',
    sections: [
      {
        heading: 'Start with the fields that matter',
        paragraphs: [
          'A tracker should help you decide what to do next. Start with company, role, application date, current status, latest update, and follow-up notes.',
          'Avoid creating so many columns that updating the tracker becomes its own project.'
        ],
        bullets: [
          'Company and role',
          'Current status and last activity date',
          'Interview or assessment deadlines',
          'Relevant links and recruiter contact details',
          'Notes about next steps'
        ]
      },
      {
        heading: 'Keep your timeline current',
        paragraphs: [
          'Your tracker is only useful if it reflects the latest email you received. Application confirmations, interview requests, offers, and rejections should all be captured quickly.',
          'This is where Applictus helps. Instead of updating a spreadsheet manually, you can forward job emails and let Applictus organize the timeline automatically.'
        ]
      },
      {
        heading: 'Review active opportunities regularly',
        paragraphs: [
          'Set aside time to review active applications, especially anything with an interview, assessment, or recruiter request. Look for stale applications that need a follow-up and urgent items with deadlines.',
          'A clean tracker turns a scattered job search into a weekly routine you can manage.'
        ]
      }
    ],
    related: [
      'job-application-tracker',
      'interview-tracker',
      'job-application-spreadsheet-alternative'
    ]
  },
  {
    slug: 'best-job-application-trackers',
    category: 'Comparison',
    readTime: '7 min read',
    title: 'Best Job Application Trackers for Job Seekers in 2026 | Applictus',
    h1: 'Best Job Application Trackers for Job Seekers in 2026',
    description:
      'Compare the main types of job application trackers and learn what to look for in a tracker for your 2026 job search.',
    intro:
      'The best job application tracker depends on how you search, how many roles you apply to, and how much manual work you want to do.',
    sections: [
      {
        heading: 'The main types of job application trackers',
        paragraphs: [
          'Most job seekers choose between spreadsheets, notes or task apps, CRM-style trackers, and automatic email-based trackers.',
          'Each option can work, but they have different tradeoffs. Spreadsheets are flexible, task apps are familiar, and automatic trackers reduce the upkeep required to stay current.'
        ]
      },
      {
        heading: 'What to look for in 2026',
        paragraphs: [
          'Modern job searches move across LinkedIn, Indeed, company portals, applicant tracking systems, recruiter emails, and calendar links. A tracker should handle that complexity without making you copy every update by hand.',
          'Look for a tracker that captures application status, keeps interview and assessment requests visible, and helps you understand the latest activity for each role.'
        ],
        bullets: [
          'Low manual data entry',
          'Interview and assessment tracking',
          'Offer and rejection status support',
          'Clear application timelines',
          'Privacy controls that match your comfort level'
        ]
      },
      {
        heading: 'Where Applictus fits',
        paragraphs: [
          'Applictus is built for job seekers who want automatic tracking without granting full Gmail inbox access. You control forwarding, and Applictus turns job-related updates into organized application records.',
          'If your job search is already happening in email, an inbox-powered tracker can be a strong alternative to maintaining a spreadsheet.'
        ]
      }
    ],
    related: [
      'job-application-spreadsheet-alternative',
      'job-application-tracker',
      'track-job-applications-from-email'
    ]
  },
  {
    slug: 'how-to-use-gmail-filters-for-job-applications',
    category: 'Gmail setup',
    readTime: '6 min read',
    title: 'How To Use Gmail Filters For Job Applications | Applictus',
    h1: 'How To Use Gmail Filters For Job Applications',
    description:
      'Use Gmail filters to organize job application emails and control which updates are forwarded to Applictus.',
    intro:
      'Gmail filters can make your job search cleaner by automatically organizing application confirmations, interview requests, recruiter messages, and hiring updates.',
    sections: [
      {
        heading: 'Why filters help job seekers',
        paragraphs: [
          'A busy inbox can hide important hiring emails. Filters let you label, star, or forward messages based on sender, subject, or keywords.',
          'For Applictus, filters can also help you decide which job-related emails are forwarded to your personal Applictus inbox address.'
        ]
      },
      {
        heading: 'Useful filter ideas',
        paragraphs: [
          'Start broad, then narrow the rules as you learn which messages matter. You can filter by common job platform senders, company recruiting domains, or phrases that appear in application updates.'
        ],
        bullets: [
          'Senders from job boards and applicant tracking systems',
          'Subjects containing application, interview, assessment, offer, or rejection',
          'Recruiter or talent team messages',
          'Company portal notifications'
        ]
      },
      {
        heading: 'Use filters with Applictus',
        paragraphs: [
          'After Gmail forwarding is enabled, Applictus can process the job-related messages you choose to forward. This keeps the workflow automatic while leaving you in control.',
          'You can adjust or disable filters at any time if you want to forward more or fewer updates.'
        ]
      }
    ],
    related: [
      'track-job-applications-from-email',
      'interview-tracker',
      'how-to-track-job-applications'
    ]
  }
];

const articlesBySlug = new Map(articles.map((article) => [article.slug, article]));

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function nav() {
  return `
      <header class="home-nav blog-nav" aria-label="Main">
        <a class="home-brand" href="/" aria-label="Applictus home">
          <span class="home-brand-mark" aria-hidden="true">
            <img src="/Applictus_logo.png" alt="" />
          </span>
          <span class="home-brand-copy">
            <strong>Applictus</strong>
            <small>Application Status Tracker</small>
          </span>
        </a>
        <div class="home-nav-actions">
          <a class="home-link" href="/about">About</a>
          <a class="home-link" href="/blog">Blog</a>
          <a class="btn btn--secondary btn--sm" href="/app">Login</a>
          <a class="btn btn--primary btn--sm" href="/app">Sign up</a>
        </div>
      </header>`;
}

function footer() {
  const links = [
    ['Blog', '/blog'],
    ['About', '/about'],
    ['Contact', '/contact'],
    ['Privacy', '/privacy'],
    ['Terms', '/terms']
  ];
  return `
      <footer class="app-footer blog-footer" role="contentinfo">
        <div class="app-footer-inner">
          <div class="app-footer-copy">&copy; 2026 Applictus</div>
          <nav class="app-footer-links" aria-label="Company links">
            ${links
              .map(([label, href], index) => {
                const sep =
                  index < links.length - 1
                    ? '<span class="app-footer-sep" aria-hidden="true">&middot;</span>'
                    : '';
                return `<a class="app-footer-link" href="${href}">${label.toUpperCase()}</a>${sep}`;
              })
              .join('\n            ')}
          </nav>
        </div>
      </footer>`;
}

function CTASection() {
  return `
          <section class="blog-cta" aria-labelledby="blog-cta-title">
            <div>
              <p class="blog-eyebrow">Start tracking automatically</p>
              <h2 id="blog-cta-title">Turn job emails into an application timeline.</h2>
              <p>Applictus helps you track confirmations, interviews, offers, rejections, and follow-ups from forwarded job updates without full Gmail inbox access.</p>
            </div>
            <div class="blog-cta-actions">
              <a class="btn btn-bevel btn-primary" href="/app">Start tracking applications</a>
              <a class="btn btn-bevel btn-secondary" href="/">Back to homepage</a>
            </div>
          </section>`;
}

function BlogCard(article) {
  return `
            <article class="blog-card">
              <div class="blog-card-meta">
                <span>${escapeHtml(article.category)}</span>
                <span>${escapeHtml(article.readTime)}</span>
              </div>
              <h2><a href="/blog/${article.slug}">${escapeHtml(article.h1)}</a></h2>
              <p>${escapeHtml(article.description)}</p>
              <div class="blog-card-footer">
                <a class="blog-card-link" href="/blog/${article.slug}">Read article</a>
              </div>
            </article>`;
}

function RelatedArticles(currentArticle) {
  const related = currentArticle.related
    .map((slug) => articlesBySlug.get(slug))
    .filter(Boolean);
  return `
          <aside class="blog-related" aria-labelledby="related-title">
            <p class="blog-eyebrow">Related articles</p>
            <h2 id="related-title">Keep reading</h2>
            <div class="blog-related-list">
              ${related
                .map(
                  (article) => `
              <a class="blog-related-card" href="/blog/${article.slug}">
                <span>${escapeHtml(article.category)}</span>
                <strong>${escapeHtml(article.h1)}</strong>
                <small>${escapeHtml(article.readTime)}</small>
              </a>`
                )
                .join('')}
            </div>
          </aside>`;
}

function renderArticleBody(article) {
  return article.sections
    .map((section) => {
      const bullets = Array.isArray(section.bullets)
        ? `<ul>${section.bullets.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
        : '';
      return `
            <section>
              <h2>${escapeHtml(section.heading)}</h2>
              ${section.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('\n              ')}
              ${bullets}
            </section>`;
    })
    .join('\n');
}

function BlogPageLayout({ title, description, canonicalPath, content }) {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="description" content="${escapeHtml(description)}" />
    <link rel="canonical" href="${SITE_URL}${canonicalPath}" />
    <title>${escapeHtml(title)}</title>
    <link rel="icon" href="/Applictus_logo.png" type="image/png" />
    <link rel="stylesheet" href="/styles.css?v=${CSS_VERSION}" />
  </head>
  <body class="home home-page blog-page animated-bg-mode animated-bg-auth">
    <div class="home-shell blog-shell">
${nav()}
      <main class="blog-main">
${content}
      </main>
${footer()}
    </div>
  </body>
</html>
`;
}

function renderHub() {
  const content = `
        <section class="blog-hero page-wrap">
          <div class="blog-hero-content">
            <div class="blog-hero-brand">
              <span class="blog-hero-logo" aria-hidden="true">
                <img src="/Applictus_logo.png" alt="" />
              </span>
              <p class="blog-eyebrow">Applictus Blog</p>
            </div>
            <h1>Applictus Blog</h1>
            <p>Practical guides for tracking job applications, managing interview steps, organizing inbox workflows, and keeping every opportunity visible.</p>
            <div class="blog-hero-topics" aria-label="Blog topics">
              <span>Application tracking</span>
              <span>Interview follow-ups</span>
              <span>Gmail workflows</span>
            </div>
          </div>
        </section>

        <section class="blog-index page-wrap" aria-label="Applictus articles">
          <div class="blog-card-grid">
${articles.map(BlogCard).join('\n')}
          </div>
        </section>

${CTASection()}`;

  return BlogPageLayout({
    title: 'Applictus Blog | Job Application Tracking Guides',
    description:
      'Read Applictus guides about job application tracking, interview tracking, Gmail filters, automatic job search timelines, and spreadsheet alternatives.',
    canonicalPath: '/blog',
    content
  });
}

function renderArticle(article) {
  const content = `
        <article class="blog-article page-wrap">
          <header class="blog-article-header">
            <div class="blog-article-hero-inner">
              <nav class="blog-breadcrumb" aria-label="Breadcrumb">
                <a href="/">Home</a>
                <span aria-hidden="true">/</span>
                <a href="/blog">Blog</a>
              </nav>
              <div class="blog-article-meta">
                <span>${escapeHtml(article.category)}</span>
                <span>${escapeHtml(article.readTime)}</span>
              </div>
              <div class="blog-article-title">
                <h1>${escapeHtml(article.h1)}</h1>
                <p>${escapeHtml(article.intro)}</p>
              </div>
            </div>
          </header>

          <div class="blog-article-layout">
            <div class="blog-article-body">
${renderArticleBody(article)}
            </div>
${RelatedArticles(article)}
          </div>
        </article>

${CTASection()}`;

  return BlogPageLayout({
    title: article.title,
    description: article.description,
    canonicalPath: `/blog/${article.slug}`,
    content
  });
}

function writeFileBoth(relativePath, html) {
  for (const baseDir of [webBlogDir, publicBlogDir]) {
    const dest = path.join(baseDir, relativePath);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, html, 'utf8');
  }
}

writeFileBoth('index.html', renderHub());
for (const article of articles) {
  writeFileBoth(path.join(article.slug, 'index.html'), renderArticle(article));
}

// eslint-disable-next-line no-console
console.log(`[generate-blog-pages] wrote ${articles.length + 1} page(s) to web/blog and public/blog`);
