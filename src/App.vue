<template>
  <!-- Keyed by path so switching rooms creates fresh controllers. -->
  <RouterView :key="$route.path.startsWith('/editor') ? 'editor' : $route.path" />
</template>
