<script setup lang="ts">
import { withBase } from 'vitepress'

const route = [
  { title: 'Repository', detail: 'Source of truth' },
  { title: 'Catalog', detail: 'Owned context' },
  { title: 'Standards', detail: 'Visible evidence' },
  { title: 'Pull request', detail: 'Reviewable fix' },
]

const paths = [
  {
    label: 'Understand',
    title: 'See the operating model',
    body: 'Learn what Perongen owns, what stays in GitHub, and how evidence becomes useful engineering work.',
    link: './overview',
    action: 'Start with the overview',
  },
  {
    label: 'Use',
    title: 'Find your way around',
    body: 'Move from service ownership to relationships, scorecards, operations, documentation, and approved actions.',
    link: './getting-started/',
    action: 'Open the user guide',
  },
  {
    label: 'Run',
    title: 'Deploy and administer',
    body: 'Connect the GitHub App, prepare canonical configuration, synchronize repositories, and control access.',
    link: './admin/deployment',
    action: 'Open the deployment guide',
  },
]

const tour = [
  {
    step: 'Orient',
    title: 'Start with ownership and attention.',
    body: 'The overview brings accountable services, standards coverage, systems, and recent catalog activity into one working surface.',
    image: withBase('/images/perongen-overview.png'),
    alt: 'Perongen overview showing owned services and standards coverage',
  },
  {
    step: 'Trace',
    title: 'Follow impact through the estate.',
    body: 'Repository-owned relationships connect services to systems, APIs, and infrastructure resources.',
    image: withBase('/images/perongen-map.png'),
    alt: 'Perongen software map showing services and their system relationships',
  },
  {
    step: 'Improve',
    title: 'Turn policy into a path to green.',
    body: 'Independent scorecards combine catalog metadata with GitHub evidence and explain the next useful fix.',
    image: withBase('/images/perongen-scorecards.png'),
    alt: 'Perongen scorecards showing metadata quality and repository standards',
  },
]

const boundaries = [
  ['GitHub stays canonical', 'Configuration, service metadata, documentation, campaigns, and fixes remain reviewable repository changes.'],
  ['Secrets stay in deployment', 'Database, OAuth, private-key, session, and webhook credentials never enter portal configuration.'],
  ['Failures stay contained', 'Provider health can degrade without replacing known catalog facts or the last valid configuration.'],
]
</script>

<template>
  <main class="launch-page">
    <section class="platform-hero" aria-labelledby="hero-title">
      <div class="platform-hero__copy">
        <p class="route-label">PERONGEN / DEVELOPER PORTAL</p>
        <h1 id="hero-title">Know what you own.<br /><span>Improve what ships.</span></h1>
        <p class="platform-hero__lede">Perongen turns GitHub repositories into an owned software catalog, evidence-backed standards, and reviewable fixes—without moving the source of truth.</p>
        <div class="platform-hero__actions">
          <a class="route-button route-button--primary" href="./getting-started/">Start using Perongen <span aria-hidden="true">→</span></a>
          <a class="route-button route-button--secondary" href="./admin/deployment">Deploy the portal</a>
        </div>
      </div>

      <div class="route-board" aria-label="Perongen flow from repository to reviewable fix">
        <header>
          <span>EVIDENCE FLOW</span>
          <span>REVIEWABLE BY DESIGN</span>
        </header>
        <ol>
          <li v-for="(stop, index) in route" :key="stop.title">
            <span class="route-board__marker">{{ index + 1 }}</span>
            <div>
              <strong>{{ stop.title }}</strong>
              <small>{{ stop.detail }}</small>
            </div>
          </li>
        </ol>
        <p>Durable changes return to the repository as reviewed pull requests.</p>
      </div>
    </section>

    <section class="docs-routes" aria-labelledby="routes-title">
      <header class="section-heading">
        <p class="route-label">START HERE</p>
        <h2 id="routes-title">Start with the job in front of you.</h2>
      </header>
      <div class="docs-routes__grid">
        <a v-for="path in paths" :key="path.label" :href="path.link" class="docs-route-card">
          <span>{{ path.label }}</span>
          <h3>{{ path.title }}</h3>
          <p>{{ path.body }}</p>
          <strong>{{ path.action }} <span aria-hidden="true">→</span></strong>
        </a>
      </div>
    </section>

    <section class="product-tour" aria-labelledby="tour-title">
      <header class="section-heading section-heading--split">
        <div>
          <p class="route-label">PRODUCT TOUR</p>
          <h2 id="tour-title">One estate, three useful views.</h2>
        </div>
        <p>Move from orientation, through system impact, to evidence-backed standards. Each view answers a different engineering question without inventing missing data.</p>
      </header>
      <div class="product-tour__grid">
        <figure v-for="(item, index) in tour" :key="item.title" :class="{ 'product-tour__primary': index === 0 }">
          <div class="product-tour__frame">
            <img :src="item.image" :alt="item.alt" loading="lazy" />
          </div>
          <figcaption>
            <span>{{ item.step }}</span>
            <strong>{{ item.title }}</strong>
            <p>{{ item.body }}</p>
          </figcaption>
        </figure>
      </div>
    </section>

    <section class="trust-boundary" aria-labelledby="trust-title">
      <header class="section-heading">
        <p class="route-label">TRUST BOUNDARY</p>
        <h2 id="trust-title">Explicit by design.</h2>
      </header>
      <div class="trust-boundary__grid">
        <article v-for="([title, body], index) in boundaries" :key="title">
          <span>{{ String(index + 1).padStart(2, '0') }}</span>
          <strong>{{ title }}</strong>
          <p>{{ body }}</p>
        </article>
      </div>
      <a class="text-route" href="./architecture-security">Read architecture and security <span aria-hidden="true">→</span></a>
    </section>

    <section class="launch-cta" aria-labelledby="cta-title">
      <div>
        <p class="route-label">FIRST VALUE</p>
        <h2 id="cta-title">Bring the first repository into view.</h2>
        <p>Deploy the foundation, connect GitHub, and let Application Intake create the first reviewable service record.</p>
      </div>
      <div class="launch-cta__actions">
        <a class="route-button route-button--signal" href="./admin/deployment">Follow the deployment guide <span aria-hidden="true">→</span></a>
        <code>docker compose up -d postgres</code>
      </div>
    </section>
  </main>
</template>
