<script setup lang="ts">
const areas = [
  { label: 'Catalog', detail: 'Services and source metadata', href: './guides/services' },
  { label: 'Ownership', detail: 'Teams, people, and responsibility', href: './guides/teams' },
  { label: 'Standards', detail: 'Scorecards and service health', href: './guides/scorecards' },
  { label: 'Actions', detail: 'Safe, workflow-backed self-service', href: './guides/actions' },
  { label: 'Administration', detail: 'Configuration and integrations', href: './admin/control-plane' },
]
</script>

<template>
  <section class="portal-map" aria-labelledby="portal-map-title">
    <div class="portal-map__intro">
      <p class="portal-map__eyebrow">Portal map</p>
      <h2 id="portal-map-title">One dependable view of engineering ownership.</h2>
      <p>Perongen gathers repository facts, team context, standards, and approved workflows without inventing data that is not there.</p>
    </div>
    <div class="portal-map__ledger">
      <a v-for="(area, index) in areas" :key="area.label" :href="area.href" class="portal-map__row">
        <span class="portal-map__index">{{ String(index + 1).padStart(2, '0') }}</span>
        <strong>{{ area.label }}</strong>
        <span>{{ area.detail }}</span>
        <span class="portal-map__arrow" aria-hidden="true">↗</span>
      </a>
    </div>
  </section>
</template>
