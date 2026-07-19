<script setup lang="ts">
import { withBase } from 'vitepress'

const fit = [
  'Engineering teams with more repositories than shared context',
  'Platform teams that want standards to produce reviewable work',
  'Organizations keeping service ownership and documentation in GitHub',
  'Teams shipping conventional and AI-built applications side by side',
]

const tour = [
  {
    eyebrow: '01 · ORIENT',
    title: 'See ownership before the next question arrives.',
    body: 'The overview leads with accountable services, standards coverage, systems, and recent catalog activity.',
    image: withBase('/images/perongen-overview.png'),
    alt: 'Perongen overview showing owned services and standards coverage',
  },
  {
    eyebrow: '02 · TRACE',
    title: 'Follow impact, not an inventory spreadsheet.',
    body: 'Repository-owned relationships connect services to systems, APIs, and infrastructure resources.',
    image: withBase('/images/perongen-map.png'),
    alt: 'Perongen software map showing services and their system relationships',
  },
  {
    eyebrow: '03 · IMPROVE',
    title: 'Turn policy into evidence and a path to green.',
    body: 'Independent scorecards combine catalog metadata with GitHub signals and keep every evaluation explainable.',
    image: withBase('/images/perongen-scorecards.png'),
    alt: 'Perongen scorecards showing metadata quality and repository standards',
  },
]

const evidence = [
  ['Repository', 'Code, docs, ownership'],
  ['Intake', 'Confirm what cannot be inferred'],
  ['Catalog', 'One reviewable service record'],
  ['Scorecards', 'Metadata and provider evidence'],
  ['GitHub fix', 'Pull request, not hidden mutation'],
]
</script>

<template>
  <main class="launch-page">
    <section class="launch-proof" aria-labelledby="proof-title">
      <p class="launch-eyebrow">THE OPERATING MODEL</p>
      <div class="launch-proof__heading">
        <h2 id="proof-title">A guardrail is useful only when it follows the software.</h2>
        <p>Perongen discovers what exists, makes uncertainty explicit, and keeps every durable change in the repository review flow your teams already trust.</p>
      </div>
      <ol class="evidence-strip">
        <li v-for="([title, detail], index) in evidence" :key="title">
          <span>{{ String(index + 1).padStart(2, '0') }}</span>
          <strong>{{ title }}</strong>
          <small>{{ detail }}</small>
        </li>
      </ol>
    </section>

    <section class="launch-fit" aria-labelledby="fit-title">
      <div>
        <p class="launch-eyebrow">WHO IT IS FOR</p>
        <h2 id="fit-title">For the point where “just check GitHub” stops scaling.</h2>
        <p>Perongen is for engineering organizations that need a dependable answer to what they own, whether it meets expectations, and how to improve it.</p>
        <a href="./overview">Understand the operating model <span aria-hidden="true">↗</span></a>
      </div>
      <ul>
        <li v-for="item in fit" :key="item"><span aria-hidden="true">✓</span>{{ item }}</li>
      </ul>
      <aside>
        <strong>Probably not the right fit</strong>
        <p>A single-repository team, or an organization looking for a hosted service with no deployment or GitHub App ownership.</p>
      </aside>
    </section>

    <section id="tour" class="launch-tour" aria-labelledby="tour-title">
      <header>
        <p class="launch-eyebrow">PRODUCT TOUR</p>
        <h2 id="tour-title">Three views. One software estate.</h2>
        <p>Watch the twelve-second field tour, then explore each view—from orientation, to impact, to standards.</p>
      </header>
      <div class="launch-film">
        <video controls playsinline preload="metadata" :poster="withBase('/images/perongen-overview.png')">
          <source :src="withBase('/images/perongen-tour.mp4')" type="video/mp4" />
          Your browser does not support embedded video. The product screenshots below show the same tour.
        </video>
        <span>12 SEC · OVERVIEW → MAP → SCORECARDS</span>
      </div>
      <div class="tour-reel" aria-label="Perongen product screenshots">
        <figure v-for="item in tour" :key="item.title">
          <div class="tour-frame">
            <img :src="item.image" :alt="item.alt" loading="lazy" />
          </div>
          <figcaption>
            <span>{{ item.eyebrow }}</span>
            <strong>{{ item.title }}</strong>
            <p>{{ item.body }}</p>
          </figcaption>
        </figure>
      </div>
    </section>

    <section class="launch-foundation" aria-labelledby="foundation-title">
      <div>
        <p class="launch-eyebrow">TRUST BOUNDARY</p>
        <h2 id="foundation-title">Self-hosted by design. Explicit about every boundary.</h2>
      </div>
      <div class="foundation-ledger">
        <article>
          <span>01</span>
          <strong>GitHub remains canonical</strong>
          <p>Configuration, service metadata, documentation, campaigns, and fixes use commits and pull requests.</p>
        </article>
        <article>
          <span>02</span>
          <strong>Secrets stay in deployment</strong>
          <p>Database, OAuth, private-key, session, and webhook credentials are never editable through portal configuration.</p>
        </article>
        <article>
          <span>03</span>
          <strong>Provider failures are isolated</strong>
          <p>Operational snapshots can degrade without taking the catalog or its last-known-good configuration down with them.</p>
        </article>
      </div>
      <a class="foundation-link" href="./architecture-security">Read architecture and security <span aria-hidden="true">↗</span></a>
    </section>

    <section class="launch-cta" aria-labelledby="cta-title">
      <div>
        <p class="launch-eyebrow">FIRST VALUE</p>
        <h2 id="cta-title">From deployment to the first scored repository.</h2>
        <p>The guided setup verifies the running system, connects the GitHub installation, and offers Application Intake when metadata does not exist yet.</p>
      </div>
      <div class="launch-command">
        <span>LOCAL EVALUATION</span>
        <code>docker compose up -d postgres<br />npm install<br />npm run dev:api &amp; npm run dev</code>
        <a href="./admin/deployment">Open the deployment guide <span aria-hidden="true">→</span></a>
      </div>
    </section>
  </main>
</template>
