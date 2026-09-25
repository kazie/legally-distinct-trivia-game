<script setup lang="ts">
import { reactive } from 'vue'
import ConnectionBadge from './ConnectionBadge.vue'
import JoinQr from './JoinQr.vue'

const qr = reactive({ url: 'http://192.168.1.10:5173/play/DEMO', size: 240 })
</script>

<template>
  <Story title="Small bits" group="components" :layout="{ type: 'grid', width: 320 }">
    <Variant title="Connection: connected"><ConnectionBadge status="open" :host-online="true" /></Variant>
    <Variant title="Connection: waiting for host"><ConnectionBadge status="open" :host-online="false" /></Variant>
    <Variant title="Connection: connecting"><ConnectionBadge status="connecting" /></Variant>
    <Variant title="Connection: offline"><ConnectionBadge status="closed" /></Variant>
    <Variant title="Join QR">
      <template #controls>
        <HstText v-model="qr.url" title="URL" />
        <HstSlider v-model="qr.size" title="Size" :min="100" :max="400" :step="20" />
      </template>
      <JoinQr :url="qr.url" :size="qr.size" />
    </Variant>
  </Story>
</template>
