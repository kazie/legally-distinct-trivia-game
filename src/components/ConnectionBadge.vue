<script setup lang="ts">
import type { ConnectionStatus } from '@/net/bridgeClient'

defineProps<{ status: ConnectionStatus; hostOnline?: boolean | null }>()
</script>

<template>
  <span class="pill" :class="status === 'open' && hostOnline !== false ? 'ok' : 'bad'">
    <template v-if="status !== 'open'">{{ status === 'connecting' ? 'Connecting…' : 'Bridge offline' }}</template>
    <template v-else-if="hostOnline === false">Waiting for host…</template>
    <template v-else>Connected</template>
  </span>
</template>
