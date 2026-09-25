<script setup lang="ts">
import { ref, watchEffect } from 'vue'
import QRCode from 'qrcode'

const props = defineProps<{ url: string; size?: number }>()
const src = ref('')

watchEffect(async () => {
  src.value = await QRCode.toDataURL(props.url, { width: props.size ?? 240, margin: 1 })
})
</script>

<template>
  <img v-if="src" :src="src" :width="size ?? 240" :height="size ?? 240" alt="QR code to join" class="qr" />
</template>

<style scoped>
.qr {
  border-radius: 8px;
  background: white;
}
</style>
